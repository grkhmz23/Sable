use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};
use ephemeral_rollups_sdk::cpi::delegate_account;
use ephemeral_rollups_sdk::cpi::commit_and_undelegate_accounts;

pub mod error;
pub mod events;
pub mod state;

use error::*;
use events::*;
use state::*;

declare_id!("L2CnccKT1qHNS1wJ7p3wJ3JhCX5s4J5wT5x3h5mH2j1");

// Default MagicBlock delegation program
pub const DEFAULT_DELEGATION_PROGRAM_ID: Pubkey = 
    pubkey!("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");

#[program]
pub mod l2conceptv1 {
    use super::*;

    /// Initialize the program config and vault authority
    pub fn initialize(
        ctx: Context<Initialize>,
        delegation_program_id: Option<Pubkey>,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.config_admin.key();
        config.delegation_program_id = delegation_program_id.unwrap_or(DEFAULT_DELEGATION_PROGRAM_ID);
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

    /// Add a mint to track for the user
    pub fn add_mint(ctx: Context<AddMint>) -> Result<()> {
        // Validate mint is owned by SPL Token program
        require!(
            ctx.accounts.mint.owner == &token::ID,
            L2ConceptV1Error::InvalidMint
        );

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
        require!(amount > 0, L2ConceptV1Error::InvalidAmount);

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

        user_balance.amount = user_balance.amount
            .checked_add(amount)
            .ok_or(L2ConceptV1Error::Overflow)?;
        user_state.state_version = user_state.state_version
            .checked_add(1)
            .ok_or(L2ConceptV1Error::Overflow)?;
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
    pub fn transfer_batch(
        ctx: Context<TransferBatch>,
        items: Vec<TransferItem>,
    ) -> Result<()> {
        require!(!items.is_empty(), L2ConceptV1Error::InvalidAmount);
        require!(
            items.len() <= MAX_BATCH_TRANSFER_RECIPIENTS,
            L2ConceptV1Error::TooManyRecipients
        );

        let sender_user_state = &mut ctx.accounts.sender_user_state;
        let sender_balance = &mut ctx.accounts.sender_balance;

        // Calculate total debit and validate
        let mut total_debit: u64 = 0;
        let mut recipient_map: std::collections::HashSet<Pubkey> = std::collections::HashSet::new();

        for item in &items {
            require!(item.amount > 0, L2ConceptV1Error::InvalidAmount);
            require!(
                item.to_owner != sender_user_state.owner,
                L2ConceptV1Error::SelfTransferNotAllowed
            );
            
            // Check for duplicate recipients
            require!(
                recipient_map.insert(item.to_owner),
                L2ConceptV1Error::DuplicateRecipient
            );

            total_debit = total_debit
                .checked_add(item.amount)
                .ok_or(L2ConceptV1Error::Overflow)?;
        }

        require!(
            sender_balance.amount >= total_debit,
            L2ConceptV1Error::InsufficientBalance
        );

        // Debit sender
        sender_balance.amount = sender_balance.amount
            .checked_sub(total_debit)
            .ok_or(L2ConceptV1Error::Underflow)?;

        // Credit recipients from remaining accounts
        let remaining_accounts = ctx.remaining_accounts;
        let expected_accounts_per_recipient = 2; // UserState + UserBalance

        require!(
            remaining_accounts.len() == items.len() * expected_accounts_per_recipient,
            L2ConceptV1Error::InvalidRecipientAccounts
        );

        let mut transfer_events = Vec::new();

        for (i, item) in items.iter().enumerate() {
            let recipient_user_state_info = &remaining_accounts[i * 2];
            let recipient_balance_info = &remaining_accounts[i * 2 + 1];

            // Validate recipient UserState PDA
            let expected_user_state_seeds = &[
                USER_STATE_SEED.as_bytes(),
                item.to_owner.as_ref(),
            ];
            let (expected_user_state, _) = Pubkey::find_program_address(
                expected_user_state_seeds,
                ctx.program_id,
            );
            require!(
                recipient_user_state_info.key() == expected_user_state,
                L2ConceptV1Error::InvalidRecipientAccounts
            );

            // Validate recipient UserBalance PDA
            let expected_balance_seeds = &[
                USER_BALANCE_SEED.as_bytes(),
                item.to_owner.as_ref(),
                sender_balance.mint.as_ref(),
            ];
            let (expected_balance, _) = Pubkey::find_program_address(
                expected_balance_seeds,
                ctx.program_id,
            );
            require!(
                recipient_balance_info.key() == expected_balance,
                L2ConceptV1Error::InvalidRecipientAccounts
            );

            // Credit recipient
            let mut recipient_balance: Account<UserBalance> = Account::try_from_unchecked(
                &ctx.program_id,
                recipient_balance_info,
            )?;
            
            recipient_balance.amount = recipient_balance.amount
                .checked_add(item.amount)
                .ok_or(L2ConceptV1Error::Overflow)?;
            recipient_balance.version = sender_user_state.state_version
                .checked_add(1)
                .ok_or(L2ConceptV1Error::Overflow)?;

            // Serialize back
            recipient_balance.exit(&ctx.program_id)?;

            transfer_events.push(TransferEvent {
                from_owner: sender_user_state.owner,
                mint: sender_balance.mint,
                to_owner: item.to_owner,
                amount: item.amount,
            });
        }

        // Update sender state version
        sender_user_state.state_version = sender_user_state.state_version
            .checked_add(1)
            .ok_or(L2ConceptV1Error::Overflow)?;
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

    /// Withdraw tokens from vault (only when not delegated)
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, L2ConceptV1Error::InvalidAmount);

        let user_state = &ctx.accounts.user_state;
        let user_balance = &mut ctx.accounts.user_balance;

        // CRITICAL: Check account is not delegated (owner must be this program)
        let user_state_info = user_state.to_account_info();
        require!(
            user_state_info.owner == ctx.program_id,
            L2ConceptV1Error::WithdrawWhileDelegated
        );

        require!(
            user_balance.amount >= amount,
            L2ConceptV1Error::InsufficientBalance
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
        user_balance.amount = user_balance.amount
            .checked_sub(amount)
            .ok_or(L2ConceptV1Error::Underflow)?;
        
        let user_state = &mut ctx.accounts.user_state;
        user_state.state_version = user_state.state_version
            .checked_add(1)
            .ok_or(L2ConceptV1Error::Overflow)?;
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

    /// Delegate user state and balances to Ephemeral Rollup
    pub fn delegate_user_state_and_balances(
        ctx: Context<DelegateUserStateAndBalances>,
        mint_list: Vec<Pubkey>,
    ) -> Result<()> {
        require!(
            !mint_list.is_empty() && mint_list.len() <= MAX_MINTS_PER_DELEGATION,
            L2ConceptV1Error::InvalidMintList
        );

        // Delegate UserState
        delegate_account(
            ctx.accounts.user_state.key(),
            ctx.accounts.user_state.to_account_info(),
            ctx.accounts.owner.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        )?;

        // Delegate each UserBalance
        let remaining_accounts = ctx.remaining_accounts;
        require!(
            remaining_accounts.len() == mint_list.len(),
            L2ConceptV1Error::InvalidRecipientAccounts
        );

        for (i, mint) in mint_list.iter().enumerate() {
            let balance_info = &remaining_accounts[i];
            
            // Validate it's the correct UserBalance PDA
            let expected_seeds = &[
                USER_BALANCE_SEED.as_bytes(),
                ctx.accounts.owner.key().as_ref(),
                mint.as_ref(),
            ];
            let (expected_balance, _) = Pubkey::find_program_address(
                expected_seeds,
                ctx.program_id,
            );
            require!(
                balance_info.key() == expected_balance,
                L2ConceptV1Error::InvalidRecipientAccounts
            );

            delegate_account(
                balance_info.key(),
                balance_info.clone(),
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.magic_context.to_account_info(),
                ctx.accounts.magic_program.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            )?;
        }

        emit!(DelegateEvent {
            owner: ctx.accounts.owner.key(),
            mint_count: mint_list.len() as u8,
            mints: mint_list,
        });

        Ok(())
    }

    /// Commit and undelegate user state and balances from ER back to L1
    pub fn commit_and_undelegate_user_state_and_balances(
        ctx: Context<CommitAndUndelegateUserStateAndBalances>,
        mint_list: Vec<Pubkey>,
    ) -> Result<()> {
        require!(
            !mint_list.is_empty() && mint_list.len() <= MAX_MINTS_PER_DELEGATION,
            L2ConceptV1Error::InvalidMintList
        );

        // Collect all accounts to commit/undelegate
        let mut accounts_to_commit = vec![
            ctx.accounts.user_state.to_account_info(),
        ];

        // Add balance accounts
        let remaining_accounts = ctx.remaining_accounts;
        require!(
            remaining_accounts.len() == mint_list.len(),
            L2ConceptV1Error::InvalidRecipientAccounts
        );

        for (i, mint) in mint_list.iter().enumerate() {
            let balance_info = &remaining_accounts[i];
            
            // Validate it's the correct UserBalance PDA
            let expected_seeds = &[
                USER_BALANCE_SEED.as_bytes(),
                ctx.accounts.owner.key().as_ref(),
                mint.as_ref(),
            ];
            let (expected_balance, _) = Pubkey::find_program_address(
                expected_seeds,
                ctx.program_id,
            );
            require!(
                balance_info.key() == expected_balance,
                L2ConceptV1Error::InvalidRecipientAccounts
            );

            accounts_to_commit.push(balance_info.clone());
        }

        commit_and_undelegate_accounts(
            accounts_to_commit,
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        )?;

        emit!(CommitUndelegateEvent {
            owner: ctx.accounts.owner.key(),
            mint_count: mint_list.len() as u8,
            mints: mint_list,
        });

        Ok(())
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
#[instruction()]
pub struct AddMint<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: Verified in instruction
    pub mint: Account<'info, Mint>,

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

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = owner,
    )]
    pub user_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
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
        has_one = owner @ L2ConceptV1Error::NotAuthorized,
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
        has_one = owner @ L2ConceptV1Error::NotAuthorized,
        has_one = mint,
    )]
    pub sender_balance: Account<'info, UserBalance>,

    pub mint: Account<'info, Mint>,

    /// CHECK: Validated in instruction via remaining_accounts
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

    pub mint: Account<'info, Mint>,

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
#[instruction(mint_list: Vec<Pubkey>)]
pub struct DelegateUserStateAndBalances<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: This account will be delegated
    #[account(mut)]
    pub user_state: AccountInfo<'info>,

    /// CHECK: MagicBlock context
    pub magic_context: AccountInfo<'info>,

    /// CHECK: MagicBlock delegation program
    pub magic_program: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(mint_list: Vec<Pubkey>)]
pub struct CommitAndUndelegateUserStateAndBalances<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub owner: SystemAccount<'info>,

    /// CHECK: This account will be committed/undelegated
    #[account(mut)]
    pub user_state: AccountInfo<'info>,

    /// CHECK: MagicBlock context
    pub magic_context: AccountInfo<'info>,

    /// CHECK: MagicBlock delegation program
    pub magic_program: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

use anchor_spl::associated_token::AssociatedToken;

// Constants
pub const CONFIG_SEED: &str = "config";
pub const USER_STATE_SEED: &str = "user_state";
pub const USER_BALANCE_SEED: &str = "user_balance";
pub const VAULT_AUTHORITY_SEED: &str = "vault_authority";
pub const MAX_BATCH_TRANSFER_RECIPIENTS: usize = 15;
pub const MAX_MINTS_PER_DELEGATION: usize = 10;
