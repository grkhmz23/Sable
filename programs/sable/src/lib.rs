#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{
    self,
    spl_token::{self, solana_program::program_pack::Pack},
    Token,
    TokenAccount,
    Transfer,
};

pub mod error;
pub mod events;
pub mod magicblock;
pub mod state;

use error::*;
use events::*;
use state::*;

// NOTE: SABLE_PROGRAM_ID_TBD — replace with real deployed program ID in Prompt 3
declare_id!("CvGdTmYZXMSibPL49xCzvghYDk156EfUVbkrd9P6devK");

// Default MagicBlock delegation program ID (mainnet)
pub const DEFAULT_DELEGATION_PROGRAM_ID: Pubkey =
    pubkey!("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");

// wSOL mint address - always included by default
pub const WSOL_MINT: Pubkey = pubkey!("So11111111111111111111111111111111111111112");

#[program]
pub mod sable {
    use super::*;

    /// Initialize the program config and vault authority
    pub fn initialize(
        ctx: Context<Initialize>,
        delegation_program_id: Option<Pubkey>,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.config_admin.key();
        config.delegation_program_id =
            delegation_program_id.unwrap_or(DEFAULT_DELEGATION_PROGRAM_ID);
        config.bump = ctx.bumps.config;

        let vault_authority = &mut ctx.accounts.vault_authority;
        vault_authority.bump = ctx.bumps.vault_authority;

        emit!(InitializeEvent {
            admin: config.admin,
            delegation_program_id: config.delegation_program_id,
        });

        Ok(())
    }

    /// Join the program by creating a UserState PDA
    pub fn join(ctx: Context<Join>) -> Result<()> {
        let user_state = &mut ctx.accounts.user_state;
        user_state.owner = ctx.accounts.owner.key();
        user_state.bump = ctx.bumps.user_state;
        user_state.state_version = 0;

        emit!(JoinEvent {
            owner: user_state.owner,
        });

        Ok(())
    }

    /// Complete setup by creating UserState and wSOL UserBalance (always included by default)
    /// Additional mints can be added in the same transaction via remaining_accounts
    pub fn complete_setup(
        ctx: Context<CompleteSetup>,
        additional_mints: Vec<Pubkey>,
    ) -> Result<()> {
        // Validate mint count
        require!(
            additional_mints.len() <= MAX_MINTS_PER_SETUP,
            SableError::TooManyMints
        );

        // Check for duplicates (including wSOL)
        let mut mint_set = std::collections::HashSet::new();
        for mint in &additional_mints {
            require!(*mint != WSOL_MINT, SableError::DuplicateMint);
            require!(mint_set.insert(*mint), SableError::DuplicateMint);
        }

        // 1. Create UserState
        let user_state = &mut ctx.accounts.user_state;
        user_state.owner = ctx.accounts.owner.key();
        user_state.bump = ctx.bumps.user_state;
        user_state.state_version = 0;

        // 2. Create wSOL UserBalance (always included by default)
        let wsol_balance = &mut ctx.accounts.wsol_balance;
        wsol_balance.owner = ctx.accounts.owner.key();
        wsol_balance.mint = WSOL_MINT;
        wsol_balance.bump = ctx.bumps.wsol_balance;
        wsol_balance.amount = 0;
        wsol_balance.version = 0;

        // 3. Validate and create additional UserBalance accounts from remaining_accounts
        // Remaining accounts structure:
        // [0..n]: Mint accounts (to validate)
        // [n..2n]: UserBalance accounts (to initialize)
        let remaining = ctx.remaining_accounts;
        let n = additional_mints.len();
        let owner_key = ctx.accounts.owner.key();

        require!(
            remaining.len() == n * 2,
            SableError::InvalidRecipientAccounts
        );

        for (i, mint_key) in additional_mints.iter().enumerate() {
            // Validate mint account
            let mint_acc = &remaining[i];
            require!(mint_acc.key() == *mint_key, SableError::InvalidMint);
            require!(mint_acc.owner == &token::ID, SableError::InvalidMint);

            let mint_data = mint_acc.try_borrow_data()?;
            require!(
                mint_data.len() >= 82 && mint_data[0] == 1,
                SableError::InvalidMint
            );
            drop(mint_data);

            // Initialize UserBalance account
            let balance_acc = &remaining[n + i];

            // Verify it's the expected PDA
            let expected_seeds = &[
                USER_BALANCE_SEED.as_bytes(),
                owner_key.as_ref(),
                mint_key.as_ref(),
            ];
            let (expected_pda, _bump) =
                Pubkey::find_program_address(expected_seeds, ctx.program_id);
            require!(
                balance_acc.key() == expected_pda,
                SableError::InvalidRecipientAccounts
            );

            // Manually initialize the account data
            // Structure: discriminator(8) + owner(32) + mint(32) + bump(1) + amount(8) + version(8) = 89 bytes
            let mut data = balance_acc.try_borrow_mut_data()?;

            // Discriminator - Anchor will set this, we skip first 8 bytes
            // Owner
            data[8..40].copy_from_slice(&owner_key.to_bytes());
            // Mint
            data[40..72].copy_from_slice(&mint_key.to_bytes());
            // Bump
            data[72] = _bump;
            // Amount (0)
            data[73..81].copy_from_slice(&0u64.to_le_bytes());
            // Version (0)
            data[81..89].copy_from_slice(&0u64.to_le_bytes());
        }

        emit!(CompleteSetupEvent {
            owner: ctx.accounts.owner.key(),
            wsol_included: true,
            additional_mints: additional_mints.clone(),
            total_balances: 1 + n as u8,
        });

        Ok(())
    }

    /// Add a mint to track for the user
    pub fn add_mint(ctx: Context<AddMint>) -> Result<()> {
        // Validate mint is owned by SPL Token program by checking it's an initialized mint
        let mint_info = ctx.accounts.mint.to_account_info();
        let mint_data = mint_info.try_borrow_data()?;
        require!(
            mint_data.len() >= 82, // Minimum mint account size
            SableError::InvalidMint
        );
        // Check is_initialized byte (first byte)
        require!(mint_data[0] == 1, SableError::InvalidMint);
        drop(mint_data);

        let user_balance = &mut ctx.accounts.user_balance;
        user_balance.owner = ctx.accounts.owner.key();
        user_balance.mint = ctx.accounts.mint.key();
        user_balance.bump = ctx.bumps.user_balance;
        user_balance.amount = 0;
        user_balance.version = 0;

        emit!(AddMintEvent {
            owner: user_balance.owner,
            mint: user_balance.mint,
        });

        Ok(())
    }

    /// Deposit tokens into the vault and credit the user's ledger
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, SableError::InvalidAmount);

        // Transfer tokens from user to vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_ata.to_account_info(),
            to: ctx.accounts.vault_ata.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        // Update ledger
        let user_state = &mut ctx.accounts.user_state;
        let user_balance = &mut ctx.accounts.user_balance;

        user_balance.amount = user_balance
            .amount
            .checked_add(amount)
            .ok_or(SableError::Overflow)?;
        user_state.state_version = user_state
            .state_version
            .checked_add(1)
            .ok_or(SableError::Overflow)?;
        user_balance.version = user_state.state_version;

        emit!(DepositEvent {
            owner: user_state.owner,
            mint: user_balance.mint,
            amount,
            new_balance: user_balance.amount,
            state_version: user_state.state_version,
        });

        Ok(())
    }

    /// Transfer tokens internally via ledger updates (batch)
    pub fn transfer_batch(ctx: Context<TransferBatch>, items: Vec<TransferItem>) -> Result<()> {
        require!(!items.is_empty(), SableError::InvalidAmount);
        require!(
            items.len() <= MAX_BATCH_TRANSFER_RECIPIENTS,
            SableError::TooManyRecipients
        );

        let sender_user_state = &mut ctx.accounts.sender_user_state;
        let sender_balance = &mut ctx.accounts.sender_balance;

        // Calculate total debit and validate
        let mut total_debit: u64 = 0;
        let mut recipient_map: std::collections::HashSet<Pubkey> = std::collections::HashSet::new();

        for item in &items {
            require!(item.amount > 0, SableError::InvalidAmount);
            require!(
                item.to_owner != sender_user_state.owner,
                SableError::SelfTransferNotAllowed
            );

            // Check for duplicate recipients
            require!(
                recipient_map.insert(item.to_owner),
                SableError::DuplicateRecipient
            );

            total_debit = total_debit
                .checked_add(item.amount)
                .ok_or(SableError::Overflow)?;
        }

        require!(
            sender_balance.amount >= total_debit,
            SableError::InsufficientBalance
        );

        // Debit sender
        sender_balance.amount = sender_balance
            .amount
            .checked_sub(total_debit)
            .ok_or(SableError::Underflow)?;

        // Credit recipients from remaining accounts
        let remaining_accounts = ctx.remaining_accounts;
        let expected_accounts_per_recipient = 2; // UserState + UserBalance

        require!(
            remaining_accounts.len() == items.len() * expected_accounts_per_recipient,
            SableError::InvalidRecipientAccounts
        );

        let mut transfer_events = Vec::new();

        for (i, item) in items.iter().enumerate() {
            let recipient_user_state_info = &remaining_accounts[i * 2];
            let recipient_balance_info = &remaining_accounts[i * 2 + 1];

            // Validate recipient UserState PDA
            let expected_user_state_seeds = &[USER_STATE_SEED.as_bytes(), item.to_owner.as_ref()];
            let (expected_user_state, _) =
                Pubkey::find_program_address(expected_user_state_seeds, ctx.program_id);
            require!(
                recipient_user_state_info.key() == expected_user_state,
                SableError::InvalidRecipientAccounts
            );

            // Validate recipient UserBalance PDA
            let expected_balance_seeds = &[
                USER_BALANCE_SEED.as_bytes(),
                item.to_owner.as_ref(),
                sender_balance.mint.as_ref(),
            ];
            let (expected_balance, _) =
                Pubkey::find_program_address(expected_balance_seeds, ctx.program_id);
            require!(
                recipient_balance_info.key() == expected_balance,
                SableError::InvalidRecipientAccounts
            );

            // Credit recipient using direct account data manipulation
            let mut recipient_balance_data = recipient_balance_info.try_borrow_mut_data()?;

            // Account structure: discriminator(8) + owner(32) + mint(32) + bump(1) + amount(8) + version(8) = 89 bytes
            // amount starts at byte 73, version at byte 81
            let current_amount = u64::from_le_bytes([
                recipient_balance_data[73],
                recipient_balance_data[74],
                recipient_balance_data[75],
                recipient_balance_data[76],
                recipient_balance_data[77],
                recipient_balance_data[78],
                recipient_balance_data[79],
                recipient_balance_data[80],
            ]);
            let new_amount = current_amount
                .checked_add(item.amount)
                .ok_or(SableError::Overflow)?;
            recipient_balance_data[73..81].copy_from_slice(&new_amount.to_le_bytes());

            // Update version
            let new_version = sender_user_state
                .state_version
                .checked_add(1)
                .ok_or(SableError::Overflow)?;
            recipient_balance_data[81..89].copy_from_slice(&new_version.to_le_bytes());

            transfer_events.push(TransferEvent {
                from_owner: sender_user_state.owner,
                mint: sender_balance.mint,
                to_owner: item.to_owner,
                amount: item.amount,
            });
        }

        // Update sender state version
        sender_user_state.state_version = sender_user_state
            .state_version
            .checked_add(1)
            .ok_or(SableError::Overflow)?;
        sender_balance.version = sender_user_state.state_version;

        emit!(TransferBatchEvent {
            from_owner: sender_user_state.owner,
            mint: sender_balance.mint,
            recipient_count: items.len() as u16,
            total_amount: total_debit,
            state_version: sender_user_state.state_version,
            transfers: transfer_events,
        });

        Ok(())
    }

    /// Send tokens externally from vault to recipient ATAs (L1 only, non-delegated state)
    /// This debits the sender ledger and performs SPL transfers from the program vault.
    pub fn external_send_batch<'info>(
        ctx: Context<'_, '_, '_, 'info, ExternalSendBatch<'info>>,
        items: Vec<TransferItem>,
    ) -> Result<()> {
        require!(!items.is_empty(), SableError::InvalidAmount);
        require!(
            items.len() <= MAX_BATCH_TRANSFER_RECIPIENTS,
            SableError::TooManyRecipients
        );

        let sender_user_state_info = ctx.accounts.sender_user_state.to_account_info();
        require!(
            sender_user_state_info.owner == ctx.program_id,
            SableError::WithdrawWhileDelegated
        );

        let vault_ata_info = ctx.accounts.vault_ata.to_account_info();
        let vault_authority_info = ctx.accounts.vault_authority.to_account_info();
        let token_program_info = ctx.accounts.token_program.to_account_info();

        let sender_user_state = &mut ctx.accounts.sender_user_state;
        let sender_balance = &mut ctx.accounts.sender_balance;

        // Validate total debit
        let mut total_debit: u64 = 0;
        for item in &items {
            require!(item.amount > 0, SableError::InvalidAmount);
            total_debit = total_debit
                .checked_add(item.amount)
                .ok_or(SableError::Overflow)?;
        }

        require!(
            sender_balance.amount >= total_debit,
            SableError::InsufficientBalance
        );

        let remaining_accounts = ctx.remaining_accounts;
        require!(
            remaining_accounts.len() == items.len(),
            SableError::InvalidRecipientAccounts
        );

        // Debit sender before credits. Transaction atomicity guarantees rollback on failure.
        sender_balance.amount = sender_balance
            .amount
            .checked_sub(total_debit)
            .ok_or(SableError::Underflow)?;

        let vault_authority_seeds = &[
            VAULT_AUTHORITY_SEED.as_bytes(),
            &[ctx.accounts.vault_authority.bump],
        ];
        let signer_seeds = &[&vault_authority_seeds[..]];

        let mut transfer_events = Vec::with_capacity(items.len());
        let mint_key = ctx.accounts.mint.key();
        let vault_ata_key = ctx.accounts.vault_ata.key();

        for (i, item) in items.iter().enumerate() {
            let destination_ata_info = remaining_accounts[i].clone();

            require!(
                destination_ata_info.owner == &token::ID,
                SableError::InvalidDestinationTokenAccount
            );
            require!(
                destination_ata_info.key() != vault_ata_key,
                SableError::InvalidDestinationTokenAccount
            );

            let dest_data = destination_ata_info.try_borrow_data()?;
            let dest_token = spl_token::state::Account::unpack(&dest_data)
                .map_err(|_| error!(SableError::InvalidDestinationTokenAccount))?;
            require!(
                dest_token.mint == mint_key,
                SableError::InvalidDestinationTokenAccount
            );
            require!(
                dest_token.owner == item.to_owner,
                SableError::InvalidDestinationTokenAccount
            );
            drop(dest_data);

            let cpi_accounts = Transfer {
                from: vault_ata_info.clone(),
                to: destination_ata_info.clone(),
                authority: vault_authority_info.clone(),
            };
            let cpi_ctx =
                CpiContext::new_with_signer(token_program_info.clone(), cpi_accounts, signer_seeds);
            token::transfer(cpi_ctx, item.amount)?;

            transfer_events.push(TransferEvent {
                from_owner: sender_user_state.owner,
                mint: sender_balance.mint,
                to_owner: item.to_owner,
                amount: item.amount,
            });
        }

        sender_user_state.state_version = sender_user_state
            .state_version
            .checked_add(1)
            .ok_or(SableError::Overflow)?;
        sender_balance.version = sender_user_state.state_version;

        emit!(ExternalSendBatchEvent {
            from_owner: sender_user_state.owner,
            mint: sender_balance.mint,
            recipient_count: items.len() as u16,
            total_amount: total_debit,
            state_version: sender_user_state.state_version,
            transfers: transfer_events,
        });

        Ok(())
    }

    /// Withdraw tokens from vault (only when not delegated)
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, SableError::InvalidAmount);

        let user_state = &ctx.accounts.user_state;
        let user_balance = &mut ctx.accounts.user_balance;

        // CRITICAL: Check account is not delegated (owner must be this program)
        let user_state_info = user_state.to_account_info();
        require!(
            user_state_info.owner == ctx.program_id,
            SableError::WithdrawWhileDelegated
        );

        require!(
            user_balance.amount >= amount,
            SableError::InsufficientBalance
        );

        // Get vault authority seeds
        let vault_authority_seeds = &[
            VAULT_AUTHORITY_SEED.as_bytes(),
            &[ctx.accounts.vault_authority.bump],
        ];
        let signer_seeds = &[&vault_authority_seeds[..]];

        // Transfer tokens from vault to destination
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault_ata.to_account_info(),
            to: ctx.accounts.destination_ata.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, amount)?;

        // Update ledger
        user_balance.amount = user_balance
            .amount
            .checked_sub(amount)
            .ok_or(SableError::Underflow)?;

        let user_state = &mut ctx.accounts.user_state;
        user_state.state_version = user_state
            .state_version
            .checked_add(1)
            .ok_or(SableError::Overflow)?;
        user_balance.version = user_state.state_version;

        emit!(WithdrawEvent {
            owner: user_state.owner,
            mint: user_balance.mint,
            amount,
            new_balance: user_balance.amount,
            state_version: user_state.state_version,
        });

        Ok(())
    }

    /// Request delegation to MagicBlock Ephemeral Rollup
    /// Real CPI will be wired in Prompt 2.
    pub fn delegate_user_state_and_balances(
        _ctx: Context<DelegateUserStateAndBalances>,
        _mint_list: Vec<Pubkey>,
    ) -> Result<()> {
        Err(SableError::NotYetImplemented.into())
    }

    /// Request commit and undelegate from MagicBlock ER
    /// Real CPI will be wired in Prompt 2.
    pub fn commit_and_undelegate_user_state_and_balances(
        _ctx: Context<CommitAndUndelegateUserStateAndBalances>,
        _mint_list: Vec<Pubkey>,
    ) -> Result<()> {
        Err(SableError::NotYetImplemented.into())
    }
}

// Account validation structs

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub config_admin: Signer<'info>,

    #[account(
        init,
        payer = config_admin,
        space = 8 + Config::SIZE,
        seeds = [CONFIG_SEED.as_bytes()],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = config_admin,
        space = 8 + VaultAuthority::SIZE,
        seeds = [VAULT_AUTHORITY_SEED.as_bytes()],
        bump
    )]
    pub vault_authority: Account<'info, VaultAuthority>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Join<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + UserState::SIZE,
        seeds = [USER_STATE_SEED.as_bytes(), owner.key().as_ref()],
        bump
    )]
    pub user_state: Account<'info, UserState>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CompleteSetup<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + UserState::SIZE,
        seeds = [USER_STATE_SEED.as_bytes(), owner.key().as_ref()],
        bump
    )]
    pub user_state: Account<'info, UserState>,

    #[account(
        init,
        payer = owner,
        space = 8 + UserBalance::SIZE,
        seeds = [
            USER_BALANCE_SEED.as_bytes(),
            owner.key().as_ref(),
            WSOL_MINT.as_ref()
        ],
        bump
    )]
    pub wsol_balance: Account<'info, UserBalance>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction()]
pub struct AddMint<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: We validate this is a valid mint account in the instruction
    #[account(owner = token::ID)]
    pub mint: AccountInfo<'info>,

    #[account(
        seeds = [USER_STATE_SEED.as_bytes(), owner.key().as_ref()],
        bump = user_state.bump,
    )]
    pub user_state: Account<'info, UserState>,

    #[account(
        init,
        payer = owner,
        space = 8 + UserBalance::SIZE,
        seeds = [
            USER_BALANCE_SEED.as_bytes(),
            owner.key().as_ref(),
            mint.key().as_ref()
        ],
        bump
    )]
    pub user_balance: Account<'info, UserBalance>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [USER_STATE_SEED.as_bytes(), owner.key().as_ref()],
        bump = user_state.bump,
        has_one = owner,
    )]
    pub user_state: Account<'info, UserState>,

    #[account(
        mut,
        seeds = [
            USER_BALANCE_SEED.as_bytes(),
            owner.key().as_ref(),
            mint.key().as_ref()
        ],
        bump = user_balance.bump,
        has_one = owner,
        has_one = mint,
    )]
    pub user_balance: Account<'info, UserBalance>,

    /// CHECK: We validate this is the correct mint in the user_balance account
    pub mint: AccountInfo<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = owner,
    )]
    pub user_ata: Account<'info, TokenAccount>,

    #[account(
        seeds = [VAULT_AUTHORITY_SEED.as_bytes()],
        bump = vault_authority.bump,
    )]
    pub vault_authority: Account<'info, VaultAuthority>,

    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = mint,
        associated_token::authority = vault_authority,
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(items: Vec<TransferItem>)]
pub struct TransferBatch<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,

    #[account(
        mut,
        seeds = [USER_STATE_SEED.as_bytes(), sender.key().as_ref()],
        bump = sender_user_state.bump,
        has_one = owner @ SableError::NotAuthorized,
    )]
    pub sender_user_state: Account<'info, UserState>,

    #[account(
        mut,
        seeds = [
            USER_BALANCE_SEED.as_bytes(),
            sender.key().as_ref(),
            mint.key().as_ref()
        ],
        bump = sender_balance.bump,
        has_one = owner @ SableError::NotAuthorized,
        has_one = mint,
    )]
    pub sender_balance: Account<'info, UserBalance>,

    /// CHECK: We validate this is the correct mint
    pub mint: AccountInfo<'info>,

    /// CHECK: This is the owner field from sender_user_state for validation
    pub owner: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [USER_STATE_SEED.as_bytes(), owner.key().as_ref()],
        bump = user_state.bump,
        has_one = owner,
    )]
    pub user_state: Account<'info, UserState>,

    #[account(
        mut,
        seeds = [
            USER_BALANCE_SEED.as_bytes(),
            owner.key().as_ref(),
            mint.key().as_ref()
        ],
        bump = user_balance.bump,
        has_one = owner,
        has_one = mint,
    )]
    pub user_balance: Account<'info, UserBalance>,

    /// CHECK: We validate this is the correct mint
    pub mint: AccountInfo<'info>,

    #[account(
        seeds = [VAULT_AUTHORITY_SEED.as_bytes()],
        bump = vault_authority.bump,
    )]
    pub vault_authority: Account<'info, VaultAuthority>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault_authority,
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = owner,
    )]
    pub destination_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(items: Vec<TransferItem>)]
pub struct ExternalSendBatch<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [USER_STATE_SEED.as_bytes(), owner.key().as_ref()],
        bump = sender_user_state.bump,
        has_one = owner,
    )]
    pub sender_user_state: Account<'info, UserState>,

    #[account(
        mut,
        seeds = [
            USER_BALANCE_SEED.as_bytes(),
            owner.key().as_ref(),
            mint.key().as_ref()
        ],
        bump = sender_balance.bump,
        has_one = owner,
        has_one = mint,
    )]
    pub sender_balance: Account<'info, UserBalance>,

    /// CHECK: Mint consistency is validated via sender_balance + vault_ata constraints
    pub mint: AccountInfo<'info>,

    #[account(
        seeds = [VAULT_AUTHORITY_SEED.as_bytes()],
        bump = vault_authority.bump,
    )]
    pub vault_authority: Account<'info, VaultAuthority>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault_authority,
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(mint_list: Vec<Pubkey>)]
pub struct DelegateUserStateAndBalances<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [USER_STATE_SEED.as_bytes(), owner.key().as_ref()],
        bump = user_state.bump,
    )]
    pub user_state: Account<'info, UserState>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(mint_list: Vec<Pubkey>)]
pub struct CommitAndUndelegateUserStateAndBalances<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub owner: SystemAccount<'info>,

    #[account(
        seeds = [USER_STATE_SEED.as_bytes(), owner.key().as_ref()],
        bump = user_state.bump,
    )]
    pub user_state: Account<'info, UserState>,

    pub system_program: Program<'info, System>,
}

// Constants
pub const CONFIG_SEED: &str = "config";
pub const USER_STATE_SEED: &str = "user_state";
pub const USER_BALANCE_SEED: &str = "user_balance";
pub const VAULT_AUTHORITY_SEED: &str = "vault_authority";
pub const MAX_BATCH_TRANSFER_RECIPIENTS: usize = 15;
pub const MAX_MINTS_PER_DELEGATION: usize = 10;
pub const MAX_MINTS_PER_SETUP: usize = 9; // wSOL + 9 additional = 10 total
