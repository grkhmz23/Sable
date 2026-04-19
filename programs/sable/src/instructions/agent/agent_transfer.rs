use anchor_lang::prelude::*;
use crate::error::SableError;
use crate::events::TransferEvent;
use crate::policy::validate_spend;
use crate::state::{AgentBalance, AgentCounters, AgentState, RecipientKind};

#[derive(Accounts)]
#[instruction(amount: u64, recipient: Pubkey, recipient_kind: RecipientKind)]
pub struct AgentTransfer<'info> {
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

    /// CHECK: Destination balance account (UserBalance or AgentBalance), validated in instruction
    #[account(mut)]
    pub dest: AccountInfo<'info>,

    /// CHECK: Mint account validated by agent_balance and PDA seeds
    pub mint: AccountInfo<'info>,

    pub clock: Sysvar<'info, Clock>,
}

/// Transfer from an AgentBalance to a UserBalance or another AgentBalance.
/// Signed by the agent's owner (not root). Enforces spend policy via validate_spend.
pub fn agent_transfer(
    ctx: Context<AgentTransfer>,
    amount: u64,
    recipient: Pubkey,
    recipient_kind: RecipientKind,
) -> Result<()> {
    require!(amount > 0, SableError::InvalidAmount);

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

    // 3. Verify ancestor chain is not frozen/revoked
    crate::instructions::agent::verify_ancestors_not_frozen(
        agent,
        ctx.remaining_accounts,
        ctx.program_id,
    )?;

    // 4. Verify mint consistency
    require!(
        ctx.accounts.agent_balance.mint == ctx.accounts.mint.key(),
        SableError::InvalidMint
    );

    // 5. Verify self-transfer is not allowed
    require!(
        recipient != agent.key(),
        SableError::SelfTransferNotAllowed
    );

    // 6. Validate destination account
    if recipient_kind == RecipientKind::User {
        // Dest must be a valid UserBalance PDA: ["user_balance", recipient, mint]
        let (expected_dest, _) = Pubkey::find_program_address(
            &[
                crate::USER_BALANCE_SEED.as_bytes(),
                recipient.as_ref(),
                ctx.accounts.mint.key().as_ref(),
            ],
            ctx.program_id,
        );
        require!(
            ctx.accounts.dest.key() == expected_dest,
            SableError::InvalidRecipientAccounts
        );
    } else {
        // Dest must be a valid AgentBalance PDA: ["agent_balance", recipient, mint]
        let (expected_dest, _) = Pubkey::find_program_address(
            &[
                crate::AGENT_BALANCE_SEED.as_bytes(),
                recipient.as_ref(),
                ctx.accounts.mint.key().as_ref(),
            ],
            ctx.program_id,
        );
        require!(
            ctx.accounts.dest.key() == expected_dest,
            SableError::InvalidRecipientAccounts
        );
    }

    // 7. Validate spend policy
    let counters = ctx.accounts.agent_counters.clone();
    let updated_counters = validate_spend(
        &agent.policy,
        &counters,
        clock.unix_timestamp,
        amount,
        &ctx.accounts.mint.key(),
        &recipient,
    )?;

    // 8. Debit agent balance
    let agent_balance = &mut ctx.accounts.agent_balance;
    require!(
        agent_balance.amount >= amount,
        SableError::InsufficientAgentBalance
    );
    agent_balance.amount = agent_balance
        .amount
        .checked_sub(amount)
        .ok_or(SableError::Underflow)?;
    agent_balance.version = agent_balance
        .version
        .checked_add(1)
        .ok_or(SableError::Overflow)?;

    // 9. Credit destination balance via direct data manipulation
    {
        let mut dest_data = ctx.accounts.dest.try_borrow_mut_data()?;

        if recipient_kind == RecipientKind::User {
            // UserBalance: discriminator(8) + owner(32) + mint(32) + bump(1) + amount(8) + version(8)
            // amount at offset 73, version at offset 81
            let current_amount = u64::from_le_bytes([
                dest_data[73], dest_data[74], dest_data[75], dest_data[76],
                dest_data[77], dest_data[78], dest_data[79], dest_data[80],
            ]);
            let new_amount = current_amount
                .checked_add(amount)
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
            // AgentBalance: discriminator(8) + agent(32) + mint(32) + amount(8) + version(8) + bump(1)
            // amount at offset 72, version at offset 80
            let current_amount = u64::from_le_bytes([
                dest_data[72], dest_data[73], dest_data[74], dest_data[75],
                dest_data[76], dest_data[77], dest_data[78], dest_data[79],
            ]);
            let new_amount = current_amount
                .checked_add(amount)
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

    // 10. Write back updated counters
    ctx.accounts.agent_counters.spent_total = updated_counters.spent_total;
    ctx.accounts.agent_counters.spent_today = updated_counters.spent_today;
    ctx.accounts.agent_counters.current_day = updated_counters.current_day;

    emit!(TransferEvent {
        from_owner: agent.key(),
        mint: ctx.accounts.mint.key(),
        to_owner: recipient,
        amount,
    });

    Ok(())
}
