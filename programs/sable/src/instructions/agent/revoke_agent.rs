use anchor_lang::prelude::*;
use crate::error::SableError;
use crate::events::AgentRevoked;
use crate::state::{AgentState, UserState};

#[derive(Accounts)]
pub struct RevokeAgent<'info> {
    #[account(mut)]
    pub agent: Account<'info, AgentState>,

    #[account(
        seeds = [crate::USER_STATE_SEED.as_bytes(), agent.root_user.as_ref()],
        bump = root_user.bump,
    )]
    pub root_user: Account<'info, UserState>,

    pub root_owner: Signer<'info>,
}

/// Revoke an agent. Only the root_user owner can revoke. Irreversible.
/// Revoked agents cannot transfer funds and cannot be unfrozen.
pub fn revoke_agent(ctx: Context<RevokeAgent>) -> Result<()> {
    let agent = &mut ctx.accounts.agent;

    // Verify root_user matches agent's recorded root_user
    require!(
        agent.root_user == ctx.accounts.root_user.key(),
        SableError::InvalidAncestorChain
    );

    // Verify signer is the root_user owner
    require!(
        ctx.accounts.root_user.owner == ctx.accounts.root_owner.key(),
        SableError::NotAgentRoot
    );

    agent.revoked = true;
    // Also freeze — a revoked agent is implicitly frozen
    agent.frozen = true;

    emit!(AgentRevoked {
        agent: agent.key(),
        revoked_by: ctx.accounts.root_owner.key(),
    });

    Ok(())
}
