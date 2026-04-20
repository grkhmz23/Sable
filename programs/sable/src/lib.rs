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
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::{delegate_account, DelegateAccounts, DelegateConfig};
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;

pub mod error;
pub mod events;
pub mod instructions;
pub mod policy;
pub mod state;

use error::*;
use events::*;
use instructions::agent::*;
use instructions::auction::*;
use state::*;

/// Helper for CPI calls to the MagicBlock PER permission program.
mod permission_cpi {
    use super::*;
    use solana_program::{
        instruction::{AccountMeta, Instruction},
        program::invoke_signed,
    };

    pub const PERMISSION_PROGRAM_ID: Pubkey =
        pubkey!("ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1");
    pub const PERMISSION_SEED: &[u8] = b"permission:";

    pub const AUTHORITY_FLAG: u8 = 1 << 0;
    pub const TX_LOGS_FLAG: u8 = 1 << 1;
    pub const TX_BALANCES_FLAG: u8 = 1 << 2;
    pub const TX_MESSAGE_FLAG: u8 = 1 << 3;
    pub const ACCOUNT_SIGNATURES_FLAG: u8 = 1 << 4;

    /// CPI call to the permission program's `create_permission` instruction.
    /// Grants the `authority` full visibility and authority flags over the
    /// `permissioned_account`.
    pub fn create_permission<'info>(
        permission_program: &AccountInfo<'info>,
        permissioned_account: &AccountInfo<'info>,
        permission_pda: &AccountInfo<'info>,
        payer: &AccountInfo<'info>,
        system_program: &AccountInfo<'info>,
        authority: Pubkey,
        signers_seeds: &[&[&[u8]]],
    ) -> Result<()> {
        // Validate permission program
        require!(
            permission_program.key() == PERMISSION_PROGRAM_ID,
            SableError::InvalidRecipientAccounts
        );

        // Validate permission PDA
        let (expected_permission, _) = Pubkey::find_program_address(
            &[PERMISSION_SEED, permissioned_account.key.as_ref()],
            &PERMISSION_PROGRAM_ID,
        );
        require!(
            permission_pda.key() == expected_permission,
            SableError::InvalidRecipientAccounts
        );

        // Build instruction data:
        // discriminator (u64 = 0) + MembersArgs { members: Some(vec![Member]) }
        let mut data = vec![0u8; 8]; // discriminator

        // Serialize MembersArgs manually (borsh-compatible):
        // Option::Some = 1u8, Vec<u32> length, Member { flags: u8, pubkey: [u8; 32] }
        let flags = AUTHORITY_FLAG
            | TX_LOGS_FLAG
            | TX_BALANCES_FLAG
            | TX_MESSAGE_FLAG
            | ACCOUNT_SIGNATURES_FLAG;
        data.push(1); // Some variant
        data.extend_from_slice(&1u32.to_le_bytes()); // vec length = 1
        data.push(flags);
        data.extend_from_slice(&authority.to_bytes());

        let instruction = Instruction {
            program_id: PERMISSION_PROGRAM_ID,
            accounts: vec![
                AccountMeta::new_readonly(*permissioned_account.key, true),
                AccountMeta::new(*permission_pda.key, false),
                AccountMeta::new(*payer.key, true),
                AccountMeta::new_readonly(*system_program.key, false),
            ],
            data,
        };

        let account_infos = &[
            permission_program.clone(),
            permissioned_account.clone(),
            permission_pda.clone(),
            payer.clone(),
            system_program.clone(),
        ];

        invoke_signed(&instruction, account_infos, signers_seeds)
            .map_err(|_| error!(SableError::PermissionInitFailed))?;

        Ok(())
    }
}

declare_id!("SaSAXcdWhyr1KD8TKRg6K7WPuxcPLZJHKEwsjQgL5Di");

// wSOL mint address - always included by default
pub const WSOL_MINT: Pubkey = pubkey!("So11111111111111111111111111111111111111112");

#[ephemeral]
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
            delegation_program_id.unwrap_or(ephemeral_rollups_sdk::id());
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
        user_state.agent_count = 0;
        user_state.task_count = 0;

        emit!(JoinEvent {
            owner: user_state.owner,
        });

        Ok(())
    }

    /// Complete setup by creating UserState and wSOL UserBalance (always included by default)
    /// Additional mints can be added in the same transaction via remaining_accounts
    pub fn complete_setup<'info>(
        ctx: Context<'_, '_, '_, 'info, CompleteSetup<'info>>,
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
        user_state.agent_count = 0;
        user_state.task_count = 0;

        // 2. Create wSOL UserBalance (always included by default)
        let wsol_balance = &mut ctx.accounts.wsol_balance;
        wsol_balance.owner = ctx.accounts.owner.key();
        wsol_balance.mint = WSOL_MINT;
        wsol_balance.bump = ctx.bumps.wsol_balance;
        wsol_balance.amount = 0;
        wsol_balance.version = 0;

        // Create PER permission for wSOL balance
        let owner_key = ctx.accounts.owner.key();

        require!(
            ctx.accounts.permission_program.key() == permission_cpi::PERMISSION_PROGRAM_ID,
            SableError::InvalidRecipientAccounts
        );
        let (expected_wsol_permission, _) = Pubkey::find_program_address(
            &[permission_cpi::PERMISSION_SEED, ctx.accounts.wsol_balance.key().as_ref()],
            &permission_cpi::PERMISSION_PROGRAM_ID,
        );
        require!(
            ctx.accounts.wsol_permission.key() == expected_wsol_permission,
            SableError::InvalidRecipientAccounts
        );

        let mut wsol_data = vec![0u8; 8]; // discriminator
        let wsol_flags = permission_cpi::AUTHORITY_FLAG
            | permission_cpi::TX_LOGS_FLAG
            | permission_cpi::TX_BALANCES_FLAG
            | permission_cpi::TX_MESSAGE_FLAG
            | permission_cpi::ACCOUNT_SIGNATURES_FLAG;
        wsol_data.push(1); // Some variant
        wsol_data.extend_from_slice(&1u32.to_le_bytes());
        wsol_data.push(wsol_flags);
        wsol_data.extend_from_slice(&owner_key.to_bytes());

        let wsol_instruction = solana_program::instruction::Instruction {
            program_id: permission_cpi::PERMISSION_PROGRAM_ID,
            accounts: vec![
                solana_program::instruction::AccountMeta::new_readonly(
                    ctx.accounts.wsol_balance.key(),
                    true,
                ),
                solana_program::instruction::AccountMeta::new(
                    ctx.accounts.wsol_permission.key(),
                    false,
                ),
                solana_program::instruction::AccountMeta::new(ctx.accounts.owner.key(), true),
                solana_program::instruction::AccountMeta::new_readonly(
                    ctx.accounts.system_program.key(),
                    false,
                ),
            ],
            data: wsol_data,
        };

        let wsol_signer_seeds: &[&[&[u8]]] = &[&[
            USER_BALANCE_SEED.as_bytes(),
            owner_key.as_ref(),
            WSOL_MINT.as_ref(),
            &[ctx.bumps.wsol_balance],
        ]];

        let wsol_account_infos = &[
            ctx.accounts.permission_program.to_account_info().clone(),
            ctx.accounts.wsol_balance.to_account_info().clone(),
            ctx.accounts.wsol_permission.to_account_info().clone(),
            ctx.accounts.owner.to_account_info().clone(),
            ctx.accounts.system_program.to_account_info().clone(),
        ];

        solana_program::program::invoke_signed(
            &wsol_instruction,
            wsol_account_infos,
            wsol_signer_seeds,
        )
        .map_err(|_| error!(SableError::PermissionInitFailed))?;

        // 3. Validate and create additional UserBalance accounts from remaining_accounts
        // Remaining accounts structure:
        // [0..n]: Mint accounts (to validate)
        // [n..2n]: UserBalance accounts (to initialize)
        // [2n..3n]: Permission PDAs for each balance
        let remaining = ctx.remaining_accounts;
        let n = additional_mints.len();

        require!(
            remaining.len() == n * 3,
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
            let (expected_pda, bump) =
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
            data[72] = bump;
            // Amount (0)
            data[73..81].copy_from_slice(&0u64.to_le_bytes());
            // Version (0)
            data[81..89].copy_from_slice(&0u64.to_le_bytes());
            drop(data);

            // Create PER permission for this balance
            let permission_acc = &remaining[2 * n + i];

            // Validate permission program
            require!(
                ctx.accounts.permission_program.key() == permission_cpi::PERMISSION_PROGRAM_ID,
                SableError::InvalidRecipientAccounts
            );

            // Validate permission PDA
            let (expected_permission, _) = Pubkey::find_program_address(
                &[permission_cpi::PERMISSION_SEED, balance_acc.key.as_ref()],
                &permission_cpi::PERMISSION_PROGRAM_ID,
            );
            require!(
                permission_acc.key() == expected_permission,
                SableError::InvalidRecipientAccounts
            );

            // Build instruction data manually
            let mut data = vec![0u8; 8]; // discriminator
            let flags = permission_cpi::AUTHORITY_FLAG
                | permission_cpi::TX_LOGS_FLAG
                | permission_cpi::TX_BALANCES_FLAG
                | permission_cpi::TX_MESSAGE_FLAG
                | permission_cpi::ACCOUNT_SIGNATURES_FLAG;
            data.push(1); // Some variant
            data.extend_from_slice(&1u32.to_le_bytes());
            data.push(flags);
            data.extend_from_slice(&owner_key.to_bytes());

            let instruction = solana_program::instruction::Instruction {
                program_id: permission_cpi::PERMISSION_PROGRAM_ID,
                accounts: vec![
                    solana_program::instruction::AccountMeta::new_readonly(*balance_acc.key, true),
                    solana_program::instruction::AccountMeta::new(*permission_acc.key, false),
                    solana_program::instruction::AccountMeta::new(*ctx.accounts.owner.key, true),
                    solana_program::instruction::AccountMeta::new_readonly(
                        *ctx.accounts.system_program.key,
                        false,
                    ),
                ],
                data,
            };

            let balance_signer_seeds: &[&[&[u8]]] = &[&[
                USER_BALANCE_SEED.as_bytes(),
                owner_key.as_ref(),
                mint_key.as_ref(),
                &[bump],
            ]];

            let account_infos = &[
                ctx.accounts.permission_program.clone(),
                balance_acc.clone(),
                permission_acc.clone(),
                ctx.accounts.owner.to_account_info().clone(),
                ctx.accounts.system_program.to_account_info().clone(),
            ];

            solana_program::program::invoke_signed(
                &instruction,
                account_infos,
                balance_signer_seeds,
            )
            .map_err(|_| error!(SableError::PermissionInitFailed))?;
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
        let owner_key = ctx.accounts.owner.key();
        let mint_key = ctx.accounts.mint.key();
        user_balance.owner = owner_key;
        user_balance.mint = mint_key;
        user_balance.bump = ctx.bumps.user_balance;
        user_balance.amount = 0;
        user_balance.version = 0;

        // Create PER permission for this balance
        let signer_seeds: &[&[&[u8]]] = &[&[
            USER_BALANCE_SEED.as_bytes(),
            owner_key.as_ref(),
            mint_key.as_ref(),
            &[ctx.bumps.user_balance],
        ]];
        permission_cpi::create_permission(
            &ctx.accounts.permission_program,
            &user_balance.to_account_info(),
            &ctx.accounts.permission,
            &ctx.accounts.owner.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            owner_key,
            signer_seeds,
        )?;

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
            require!(
                item.kind == RecipientKind::User,
                SableError::InvalidRecipientAccounts
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

    /// Spawn a new agent under a UserState or existing AgentState.
    pub fn spawn_agent(
        ctx: Context<SpawnAgent>,
        parent_kind: ParentKind,
        label: String,
        nonce: u32,
    ) -> Result<()> {
        instructions::agent::spawn_agent(ctx, parent_kind, label, nonce)
    }

    /// Close an agent. Only the root_user owner can close.
    pub fn close_agent(ctx: Context<CloseAgent>) -> Result<()> {
        instructions::agent::close_agent(ctx)
    }

    /// Update an agent's spend policy. Only the root_user owner can set policy.
    pub fn set_policy(ctx: Context<SetPolicy>, policy: SpendPolicy) -> Result<()> {
        instructions::agent::set_policy(ctx, policy)
    }

    /// Fund an agent by debiting the root user's balance.
    pub fn fund_agent(ctx: Context<FundAgent>, amount: u64) -> Result<()> {
        instructions::agent::fund_agent(ctx, amount)
    }

    /// Defund an agent by crediting the root user's balance.
    pub fn defund_agent(ctx: Context<DefundAgent>, amount: u64) -> Result<()> {
        instructions::agent::defund_agent(ctx, amount)
    }

    /// Transfer from an AgentBalance to a UserBalance or AgentBalance.
    pub fn agent_transfer(
        ctx: Context<AgentTransfer>,
        amount: u64,
        recipient: Pubkey,
        recipient_kind: RecipientKind,
    ) -> Result<()> {
        instructions::agent::agent_transfer(ctx, amount, recipient, recipient_kind)
    }

    /// Batch transfer from an AgentBalance to multiple recipients.
    pub fn agent_transfer_batch(
        ctx: Context<AgentTransferBatch>,
        items: Vec<TransferItem>,
        ancestor_count: u8,
    ) -> Result<()> {
        instructions::agent::agent_transfer_batch(ctx, items, ancestor_count)
    }

    /// Freeze an agent. Callable by root_user owner or any ancestor agent's owner.
    pub fn freeze_agent(ctx: Context<FreezeAgent>) -> Result<()> {
        instructions::agent::freeze_agent(ctx)
    }

    /// Unfreeze an agent. Callable by root_user owner or any ancestor agent's owner.
    pub fn unfreeze_agent(ctx: Context<UnfreezeAgent>) -> Result<()> {
        instructions::agent::unfreeze_agent(ctx)
    }

    /// Revoke an agent. Only the root_user owner can revoke. Irreversible.
    pub fn revoke_agent(ctx: Context<RevokeAgent>) -> Result<()> {
        instructions::agent::revoke_agent(ctx)
    }

    /// Create a new task (auction listing).
    pub fn create_task(
        ctx: Context<CreateTask>,
        poster_kind: PosterKind,
        task_id: u64,
        budget: u64,
        min_deposit: u64,
        spec_hash: [u8; 32],
        bid_commit_deadline: i64,
        bid_reveal_deadline: i64,
    ) -> Result<()> {
        instructions::auction::create_task(
            ctx,
            poster_kind,
            task_id,
            budget,
            min_deposit,
            spec_hash,
            bid_commit_deadline,
            bid_reveal_deadline,
        )
    }

    /// Cancel a task and refund escrowed budget.
    pub fn cancel_task(ctx: Context<CancelTask>) -> Result<()> {
        instructions::auction::cancel_task(ctx)
    }

    /// Commit a sealed bid to a task.
    pub fn commit_bid(
        ctx: Context<CommitBid>,
        bidder_kind: BidderKind,
        commit_hash: [u8; 32],
        deposit: u64,
    ) -> Result<()> {
        instructions::auction::commit_bid(ctx, bidder_kind, commit_hash, deposit)
    }

    /// Reveal a sealed bid during the reveal window.
    pub fn reveal_bid(ctx: Context<RevealBid>, amount: u64, nonce: u64) -> Result<()> {
        instructions::auction::reveal_bid(ctx, amount, nonce)
    }

    /// Settle the auction after the reveal deadline.
    pub fn settle_auction(ctx: Context<SettleAuction>) -> Result<()> {
        instructions::auction::settle_auction(ctx)
    }

    /// Delegate UserState and UserBalance PDAs to the Ephemeral Rollup.
    ///
    /// Remaining accounts (per mint in mint_list, in order):
    ///   [i*4 + 0]: user_balance PDA
    ///   [i*4 + 1]: buffer PDA for the balance
    ///   [i*4 + 2]: delegation_record PDA for the balance
    ///   [i*4 + 3]: delegation_metadata PDA for the balance
    pub fn delegate_user_state_and_balances<'info>(
        ctx: Context<'_, '_, '_, 'info, DelegateUserStateAndBalances<'info>>,
        mint_list: Vec<Pubkey>,
    ) -> Result<()> {
        require!(!mint_list.is_empty(), SableError::EmptyMintList);
        require!(
            mint_list.len() <= MAX_MINTS_PER_DELEGATION,
            SableError::TooManyMints
        );

        // Check for duplicates
        let mut mint_set = std::collections::HashSet::new();
        for mint in &mint_list {
            require!(mint_set.insert(*mint), SableError::DuplicateMint);
        }

        let owner_key = ctx.accounts.owner.key();

        // Ensure UserState is not already delegated
        let user_state_info = ctx.accounts.user_state.to_account_info();
        require!(
            user_state_info.owner == ctx.program_id,
            SableError::AlreadyDelegated
        );

        // Delegate UserState via macro-generated helper
        let user_state_seeds = &[USER_STATE_SEED.as_bytes(), owner_key.as_ref()];
        ctx.accounts
            .delegate_user_state(
                &ctx.accounts.owner,
                user_state_seeds,
                DelegateConfig {
                    validator: None,
                    ..Default::default()
                },
            )
            .map_err(|_| error!(SableError::DelegationFailed))?;

        // Validate remaining accounts count: 4 per mint (balance + buffer + record + metadata)
        let remaining = ctx.remaining_accounts;
        require!(
            remaining.len() == mint_list.len() * 4,
            SableError::InvalidRecipientAccounts
        );

        // Delegate each UserBalance
        for (i, mint) in mint_list.iter().enumerate() {
            let balance_acc = &remaining[i * 4];
            let buffer_acc = &remaining[i * 4 + 1];
            let record_acc = &remaining[i * 4 + 2];
            let metadata_acc = &remaining[i * 4 + 3];

            // Validate balance PDA
            let expected_balance_seeds = &[
                USER_BALANCE_SEED.as_bytes(),
                owner_key.as_ref(),
                mint.as_ref(),
            ];
            let (expected_pda, _) =
                Pubkey::find_program_address(expected_balance_seeds, ctx.program_id);
            require!(
                balance_acc.key() == expected_pda,
                SableError::InvalidRecipientAccounts
            );

            // Ensure balance is not already delegated
            require!(
                balance_acc.owner == ctx.program_id,
                SableError::AlreadyDelegated
            );

            // Validate buffer PDA
            let expected_buffer_seeds = &[
                ephemeral_rollups_sdk::pda::DELEGATE_BUFFER_TAG,
                balance_acc.key.as_ref(),
            ];
            let (expected_buffer, _) =
                Pubkey::find_program_address(expected_buffer_seeds, ctx.program_id);
            require!(
                buffer_acc.key() == expected_buffer,
                SableError::InvalidRecipientAccounts
            );

            // Validate delegation record PDA
            let expected_record_seeds = &[
                ephemeral_rollups_sdk::pda::DELEGATION_RECORD_TAG,
                balance_acc.key.as_ref(),
            ];
            let (expected_record, _) =
                Pubkey::find_program_address(expected_record_seeds, &ephemeral_rollups_sdk::id());
            require!(
                record_acc.key() == expected_record,
                SableError::InvalidRecipientAccounts
            );

            // Validate delegation metadata PDA
            let expected_metadata_seeds = &[
                ephemeral_rollups_sdk::pda::DELEGATION_METADATA_TAG,
                balance_acc.key.as_ref(),
            ];
            let (expected_metadata, _) =
                Pubkey::find_program_address(expected_metadata_seeds, &ephemeral_rollups_sdk::id());
            require!(
                metadata_acc.key() == expected_metadata,
                SableError::InvalidRecipientAccounts
            );

            // CPI delegate the balance
            let balance_seeds = &[
                USER_BALANCE_SEED.as_bytes(),
                owner_key.as_ref(),
                mint.as_ref(),
            ];
            let del_accounts = DelegateAccounts {
                payer: &ctx.accounts.owner.to_account_info(),
                pda: balance_acc,
                owner_program: &ctx.accounts.owner_program,
                buffer: buffer_acc,
                delegation_record: record_acc,
                delegation_metadata: metadata_acc,
                delegation_program: &ctx.accounts.delegation_program,
                system_program: &ctx.accounts.system_program.to_account_info(),
            };
            delegate_account(
                del_accounts,
                balance_seeds,
                DelegateConfig {
                    validator: None,
                    ..Default::default()
                },
            )
            .map_err(|_| error!(SableError::DelegationFailed))?;
        }

        emit!(DelegateEvent {
            owner: owner_key,
            mint_count: mint_list.len() as u8,
            mints: mint_list,
        });

        Ok(())
    }

    /// Commit state from Ephemeral Rollup and undelegate UserState + UserBalance PDAs.
    ///
    /// Remaining accounts (per mint in mint_list, in order):
    ///   [i]: user_balance PDA
    pub fn commit_and_undelegate_user_state_and_balances<'info>(
        ctx: Context<'_, '_, '_, 'info, CommitAndUndelegateUserStateAndBalances<'info>>,
        mint_list: Vec<Pubkey>,
    ) -> Result<()> {
        require!(!mint_list.is_empty(), SableError::EmptyMintList);
        require!(
            mint_list.len() <= MAX_MINTS_PER_DELEGATION,
            SableError::TooManyMints
        );

        // Check for duplicates
        let mut mint_set = std::collections::HashSet::new();
        for mint in &mint_list {
            require!(mint_set.insert(*mint), SableError::DuplicateMint);
        }

        let owner_key = ctx.accounts.owner.key();

        // Ensure UserState is delegated
        let user_state_info = ctx.accounts.user_state.to_account_info();
        require!(
            user_state_info.owner != ctx.program_id,
            SableError::NotDelegated
        );

        // Validate remaining accounts count: 1 per mint (balance PDA)
        let remaining = ctx.remaining_accounts;
        require!(
            remaining.len() == mint_list.len(),
            SableError::InvalidRecipientAccounts
        );

        // Build list of accounts to commit/undelegate
        let mut account_infos = Vec::with_capacity(1 + mint_list.len());
        account_infos.push(user_state_info);

        for (i, mint) in mint_list.iter().enumerate() {
            let balance_acc = &remaining[i];

            // Validate balance PDA
            let expected_balance_seeds = &[
                USER_BALANCE_SEED.as_bytes(),
                owner_key.as_ref(),
                mint.as_ref(),
            ];
            let (expected_pda, _) =
                Pubkey::find_program_address(expected_balance_seeds, ctx.program_id);
            require!(
                balance_acc.key() == expected_pda,
                SableError::InvalidRecipientAccounts
            );

            // Ensure balance is delegated
            require!(
                balance_acc.owner != ctx.program_id,
                SableError::NotDelegated
            );

            account_infos.push(balance_acc.clone());
        }

        let account_refs: Vec<&AccountInfo> = account_infos.iter().collect();

        // CPI commit and undelegate all accounts in one call
        commit_and_undelegate_accounts(
            &ctx.accounts.payer.to_account_info(),
            account_refs,
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program.to_account_info(),
            None,
        )
        .map_err(|_| error!(SableError::CommitFailed))?;

        emit!(CommitUndelegateEvent {
            owner: owner_key,
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

    /// CHECK: MagicBlock PER permission program
    pub permission_program: AccountInfo<'info>,

    /// CHECK: Permission PDA for wsol_balance, validated in instruction
    #[account(mut)]
    pub wsol_permission: AccountInfo<'info>,
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

    /// CHECK: MagicBlock PER permission program
    pub permission_program: AccountInfo<'info>,

    /// CHECK: Permission PDA for user_balance, validated in instruction
    #[account(mut)]
    pub permission: AccountInfo<'info>,
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

#[delegate]
#[derive(Accounts)]
#[instruction(mint_list: Vec<Pubkey>)]
pub struct DelegateUserStateAndBalances<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        del,
        seeds = [USER_STATE_SEED.as_bytes(), owner.key().as_ref()],
        bump = user_state.bump,
    )]
    pub user_state: Account<'info, UserState>,
}

#[commit]
#[derive(Accounts)]
#[instruction(mint_list: Vec<Pubkey>)]
pub struct CommitAndUndelegateUserStateAndBalances<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub owner: SystemAccount<'info>,

    /// CHECK: This account is delegated (owned by delegation program), validated in instruction
    #[account(mut)]
    pub user_state: AccountInfo<'info>,
}

// Constants
pub const CONFIG_SEED: &str = "config";
pub const USER_STATE_SEED: &str = "user_state";
pub const AGENT_STATE_SEED: &str = "agent_state";
pub const USER_BALANCE_SEED: &str = "user_balance";
pub const VAULT_AUTHORITY_SEED: &str = "vault_authority";
pub const MAX_BATCH_TRANSFER_RECIPIENTS: usize = 15;
pub const MAX_MINTS_PER_DELEGATION: usize = 10;
pub const MAX_MINTS_PER_SETUP: usize = 9; // wSOL + 9 additional = 10 total
pub const AGENT_COUNTERS_SEED: &str = "agent_counters";
pub const AGENT_BALANCE_SEED: &str = "agent_balance";
