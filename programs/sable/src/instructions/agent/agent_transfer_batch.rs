use anchor_lang::prelude::*;
use crate::error::SableError;
use crate::events::{TransferBatchEvent, TransferEvent};
use crate::policy::validate_spend;
use crate::state::{AgentBalance, AgentCounters, AgentState, RecipientKind, TransferItem};

#[derive(Accounts)]
#[instruction(items: Vec<TransferItem>, ancestor_count: u8)]
pub struct AgentTransferBatch<'info> {
    #[account(mut)]
    pub agent_owner: Signer<'info>,

    #[account(mut)]
    pub agent: Account<'info, AgentState>,

    #[account(
        mut,
        seeds = [
            crate::AGENT_BALANCE_SEED.as_bytes(),
            agent.key().as_ref(),
            mint.key().as_ref()
        ],
        bump = agent_balance.bump,
    )]
    pub agent_balance: Account<'info, AgentBalance>,

    #[account(
        mut,
        seeds = [
            crate::AGENT_COUNTERS_SEED.as_bytes(),
            agent.key().as_ref()
        ],
        bump = agent_counters.bump,
    )]
    pub agent_counters: Account<'info, AgentCounters>,

    /// CHECK: Mint account validated by agent_balance and PDA seeds
    pub mint: AccountInfo<'info>,

    pub clock: Sysvar<'info, Clock>,
}

/// Batch transfer from an AgentBalance to multiple UserBalances or AgentBalances.
/// Signed by the agent's owner. Each recipient is validated independently against policy.
/// If any recipient fails policy, the entire transaction reverts atomically.
///
/// `ancestor_count` is the number of ancestor accounts passed in remaining_accounts
/// before the destination accounts (0 for depth-1 agents).
pub fn agent_transfer_batch(
    ctx: Context<AgentTransferBatch>,
    items: Vec<TransferItem>,
    ancestor_count: u8,
) -> Result<()> {
    require!(!items.is_empty(), SableError::InvalidAmount);
    require!(
        items.len() <= crate::MAX_BATCH_TRANSFER_RECIPIENTS,
        SableError::TooManyRecipients
    );

    let agent = &ctx.accounts.agent;
    let clock = &ctx.accounts.clock;

    // 1. Verify signer is the agent owner
    require!(
        agent.owner == ctx.accounts.agent_owner.key(),
        SableError::AgentNotAuthorized
    );

    // 2. Reject if agent is frozen or revoked
    require!(
        !agent.frozen && !agent.revoked,
        SableError::AgentFrozenOrRevoked
    );

    // Split remaining_accounts into ancestors and destinations
    let ancestor_count = ancestor_count as usize;
    let remaining = ctx.remaining_accounts;
    require!(
        remaining.len() == ancestor_count + items.len(),
        SableError::InvalidRecipientAccounts
    );

    let ancestors = &remaining[..ancestor_count];
    let dest_accounts = &remaining[ancestor_count..];

    // 2. Verify ancestor chain is not frozen/revoked
    if ancestor_count > 0 {
        crate::instructions::agent::verify_ancestors_not_frozen(
            agent,
            &agent.key(),
            ancestors,
            ctx.program_id,
        )?;
    }

    // 4. Verify mint consistency
    require!(
        ctx.accounts.agent_balance.mint == ctx.accounts.mint.key(),
        SableError::InvalidMint
    );

    // 5. Calculate total debit and validate recipients
    let mut total_debit: u64 = 0;
    let mut recipient_map: std::collections::HashSet<Pubkey> = std::collections::HashSet::new();

    for item in &items {
        require!(item.amount > 0, SableError::InvalidAmount);
        require!(
            item.to_owner != agent.key(),
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
        ctx.accounts.agent_balance.amount >= total_debit,
        SableError::InsufficientAgentBalance
    );

    // 6. Validate each recipient against policy and update balances
    let mut counters = AgentCounters {
        agent: ctx.accounts.agent_counters.agent,
        bump: ctx.accounts.agent_counters.bump,
        spent_total: ctx.accounts.agent_counters.spent_total,
        spent_today: ctx.accounts.agent_counters.spent_today,
        current_day: ctx.accounts.agent_counters.current_day,
    };
    let mut transfer_events = Vec::with_capacity(items.len());

    for (i, item) in items.iter().enumerate() {
        // Validate spend policy for this recipient
        counters = validate_spend(
            &agent.policy,
            &counters,
            clock.unix_timestamp,
            item.amount,
            &ctx.accounts.mint.key(),
            &item.to_owner,
        )?;

        // Validate destination account
        let dest_info = &dest_accounts[i];

        if item.kind == RecipientKind::User {
            let (expected_dest, _) = Pubkey::find_program_address(
                &[
                    crate::USER_BALANCE_SEED.as_bytes(),
                    item.to_owner.as_ref(),
                    ctx.accounts.mint.key().as_ref(),
                ],
                ctx.program_id,
            );
            require!(
                dest_info.key() == expected_dest,
                SableError::InvalidRecipientAccounts
            );
        } else {
            let (expected_dest, _) = Pubkey::find_program_address(
                &[
                    crate::AGENT_BALANCE_SEED.as_bytes(),
                    item.to_owner.as_ref(),
                    ctx.accounts.mint.key().as_ref(),
                ],
                ctx.program_id,
            );
            require!(
                dest_info.key() == expected_dest,
                SableError::InvalidRecipientAccounts
            );
        }

        // Credit destination balance via direct data manipulation
        {
            let mut dest_data = dest_info.try_borrow_mut_data()?;

            if item.kind == RecipientKind::User {
                // UserBalance: amount at offset 73, version at offset 81
                let current_amount = u64::from_le_bytes([
                    dest_data[73], dest_data[74], dest_data[75], dest_data[76],
                    dest_data[77], dest_data[78], dest_data[79], dest_data[80],
                ]);
                let new_amount = current_amount
                    .checked_add(item.amount)
                    .ok_or(SableError::Overflow)?;
                dest_data[73..81].copy_from_slice(&new_amount.to_le_bytes());

                let current_version = u64::from_le_bytes([
                    dest_data[81], dest_data[82], dest_data[83], dest_data[84],
                    dest_data[85], dest_data[86], dest_data[87], dest_data[88],
                ]);
                let new_version = current_version
                    .checked_add(1)
                    .ok_or(SableError::Overflow)?;
                dest_data[81..89].copy_from_slice(&new_version.to_le_bytes());
            } else {
                // AgentBalance: amount at offset 72, version at offset 80
                let current_amount = u64::from_le_bytes([
                    dest_data[72], dest_data[73], dest_data[74], dest_data[75],
                    dest_data[76], dest_data[77], dest_data[78], dest_data[79],
                ]);
                let new_amount = current_amount
                    .checked_add(item.amount)
                    .ok_or(SableError::Overflow)?;
                dest_data[72..80].copy_from_slice(&new_amount.to_le_bytes());

                let current_version = u64::from_le_bytes([
                    dest_data[80], dest_data[81], dest_data[82], dest_data[83],
                    dest_data[84], dest_data[85], dest_data[86], dest_data[87],
                ]);
                let new_version = current_version
                    .checked_add(1)
                    .ok_or(SableError::Overflow)?;
                dest_data[80..88].copy_from_slice(&new_version.to_le_bytes());
            }
        }

        transfer_events.push(TransferEvent {
            from_owner: agent.key(),
            mint: ctx.accounts.mint.key(),
            to_owner: item.to_owner,
            amount: item.amount,
        });
    }

    // 7. Debit agent balance
    let agent_balance = &mut ctx.accounts.agent_balance;
    agent_balance.amount = agent_balance
        .amount
        .checked_sub(total_debit)
        .ok_or(SableError::Underflow)?;
    agent_balance.version = agent_balance
        .version
        .checked_add(1)
        .ok_or(SableError::Overflow)?;

    // 8. Write back updated counters
    ctx.accounts.agent_counters.spent_total = counters.spent_total;
    ctx.accounts.agent_counters.spent_today = counters.spent_today;
    ctx.accounts.agent_counters.current_day = counters.current_day;

    emit!(TransferBatchEvent {
        from_owner: agent.key(),
        mint: ctx.accounts.mint.key(),
        recipient_count: items.len() as u16,
        total_amount: total_debit,
        state_version: agent_balance.version,
        transfers: transfer_events,
    });

    Ok(())
}
