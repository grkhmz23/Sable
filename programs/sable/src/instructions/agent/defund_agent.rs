use anchor_lang::prelude::*;
use crate::error::SableError;
use crate::events::TransferEvent;
use crate::state::{AgentBalance, AgentState, UserBalance, UserState};

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct DefundAgent<'info> {
    #[account(mut)]
    pub root_owner: Signer<'info>,

    #[account(
        mut,
        seeds = [crate::USER_STATE_SEED.as_bytes(), root_owner.key().as_ref()],
        bump = root_user_state.bump,
    )]
    pub root_user_state: Account<'info, UserState>,

    #[account(
        mut,
        seeds = [
            crate::USER_BALANCE_SEED.as_bytes(),
            root_owner.key().as_ref(),
            mint.key().as_ref()
        ],
        bump = root_user_balance.bump,
    )]
    pub root_user_balance: Account<'info, UserBalance>,

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

    /// CHECK: Mint account validated by balances and PDA seeds
    pub mint: AccountInfo<'info>,
}

/// Defund an agent by debiting the agent's balance and crediting the root user's balance.
/// Only the root_user owner can defund.
pub fn defund_agent(ctx: Context<DefundAgent>, amount: u64) -> Result<()> {
    require!(amount > 0, SableError::InvalidAmount);

    // Verify root_user owner matches signer
    require!(
        ctx.accounts.root_user_state.owner == ctx.accounts.root_owner.key(),
        SableError::NotAgentRoot
    );

    // Verify agent's root_user matches the provided root_user_state
    require!(
        ctx.accounts.agent.root_user == ctx.accounts.root_user_state.key(),
        SableError::InvalidAncestorChain
    );

    // Verify mint consistency
    require!(
        ctx.accounts.root_user_balance.mint == ctx.accounts.mint.key(),
        SableError::InvalidMint
    );
    require!(
        ctx.accounts.agent_balance.mint == ctx.accounts.mint.key(),
        SableError::InvalidMint
    );

    // Debit agent balance
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

    // Credit root user balance
    let root_balance = &mut ctx.accounts.root_user_balance;
    root_balance.amount = root_balance
        .amount
        .checked_add(amount)
        .ok_or(SableError::Overflow)?;

    // Update root user state version
    let root_user_state = &mut ctx.accounts.root_user_state;
    root_user_state.state_version = root_user_state
        .state_version
        .checked_add(1)
        .ok_or(SableError::Overflow)?;

    emit!(TransferEvent {
        from_owner: ctx.accounts.agent.key(),
        mint: ctx.accounts.mint.key(),
        to_owner: root_user_state.owner,
        amount,
    });

    Ok(())
}
