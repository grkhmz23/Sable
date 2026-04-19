use anchor_lang::prelude::*;
use crate::error::SableError;
use crate::state::{AgentState, UserState};

#[derive(Accounts)]
pub struct CloseAgent<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        close = payer,
        has_one = parent @ SableError::InvalidRecipientAccounts,
    )]
    pub agent: Account<'info, AgentState>,

    /// CHECK: Parent account (UserState or AgentState), validated in instruction
    #[account(mut)]
    pub parent: AccountInfo<'info>,

    pub root_user: Account<'info, UserState>,

    pub root_owner: Signer<'info>,
}

/// Close an agent. Only the root_user owner can close.
/// The agent must have no children.
pub fn close_agent(ctx: Context<CloseAgent>) -> Result<()> {
    let agent = &ctx.accounts.agent;

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

    // Agent must have no children
    require!(
        agent.child_count == 0,
        SableError::AgentHasChildren
    );

    // Decrement parent's count by trying to deserialize as each type
    {
        let mut parent_data = ctx.accounts.parent.try_borrow_mut_data()?;

        // Try UserState first
        if let Ok(mut parent_state) = UserState::try_deserialize(&mut &parent_data[..]) {
            parent_state.agent_count = parent_state
                .agent_count
                .checked_sub(1)
                .ok_or(SableError::Underflow)?;
            parent_state.serialize(&mut &mut parent_data[..])?;
        } else if let Ok(mut parent_state) = AgentState::try_deserialize(&mut &parent_data[..]) {
            parent_state.child_count = parent_state
                .child_count
                .checked_sub(1)
                .ok_or(SableError::Underflow)?;
            parent_state.serialize(&mut &mut parent_data[..])?;
        } else {
            return Err(error!(SableError::InvalidRecipientAccounts));
        }
    }

    // Account is automatically closed by Anchor's `close = payer` constraint

    Ok(())
}
