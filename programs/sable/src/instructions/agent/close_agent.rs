use anchor_lang::prelude::*;
use crate::error::SableError;
use crate::state::{AgentBalance, AgentState, UserState};

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
/// The agent must have no children and all provided AgentBalance accounts must have amount == 0.
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

    // Verify all provided AgentBalance accounts have amount == 0 and belong to this agent
    for balance_acc_info in ctx.remaining_accounts.iter() {
        let balance_data = balance_acc_info.try_borrow_data()?;
        
        // Deserialize as AgentBalance
        let balance = AgentBalance::try_deserialize(
            &mut &balance_data[..]
        )
        .map_err(|_| error!(SableError::InvalidRecipientAccounts))?;

        // Must belong to the agent being closed
        require!(
            balance.agent == agent.key(),
            SableError::InvalidRecipientAccounts
        );

        // Must have zero balance
        require!(
            balance.amount == 0,
            SableError::AgentHasBalances
        );

        // Verify PDA derivation using the mint from the account data
        let (expected_pda, _) = Pubkey::find_program_address(
            &[
                crate::AGENT_BALANCE_SEED.as_bytes(),
                agent.key().as_ref(),
                balance.mint.as_ref(),
            ],
            ctx.program_id,
        );
        require!(
            balance_acc_info.key() == expected_pda,
            SableError::InvalidRecipientAccounts
        );
    }

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
