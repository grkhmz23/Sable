use anchor_lang::prelude::*;
use crate::error::SableError;
use crate::events::AgentFrozen;
use crate::state::{AgentState, ParentKind, UserState};

#[derive(Accounts)]
pub struct FreezeAgent<'info> {
    #[account(mut)]
    pub agent: Account<'info, AgentState>,

    #[account(
        seeds = [crate::USER_STATE_SEED.as_bytes(), agent.root_user.as_ref()],
        bump = root_user.bump,
    )]
    pub root_user: Account<'info, UserState>,

    pub signer: Signer<'info>,
}

/// Freeze an agent. Callable by root_user owner OR by any ancestor agent's owner.
/// Frozen agents cannot transfer funds.
pub fn freeze_agent(ctx: Context<FreezeAgent>) -> Result<()> {
    let agent = &mut ctx.accounts.agent;
    let signer = ctx.accounts.signer.key();

    // Authorization: root_user owner is always allowed
    let is_root = ctx.accounts.root_user.owner == signer;

    if !is_root {
        // If not root, signer must be an ancestor agent's owner
        if agent.parent_kind == ParentKind::User {
            // Depth-1 agents have no ancestors — only root can freeze
            return Err(error!(SableError::NotAgentRoot));
        }

        // Verify ancestor chain and check if any ancestor's owner matches signer
        crate::instructions::agent::verify_ancestor_chain_for_auth(
            agent,
            ctx.remaining_accounts,
            ctx.program_id,
            &signer,
        )?;
    }

    agent.frozen = true;

    emit!(AgentFrozen {
        agent: agent.key(),
        frozen_by: signer,
    });

    Ok(())
}
