pub mod agent_transfer;
pub mod agent_transfer_batch;
pub mod close_agent;
pub mod defund_agent;
pub mod fund_agent;
pub mod set_policy;
pub mod spawn_agent;

pub use agent_transfer::*;
pub use agent_transfer_batch::*;
pub use close_agent::*;
pub use defund_agent::*;
pub use fund_agent::*;
pub use set_policy::*;
pub use spawn_agent::*;

use anchor_lang::prelude::*;
use crate::error::SableError;
use crate::state::{AgentState, UserState};

/// Verify an agent's ancestor chain and ensure no ancestor is frozen or revoked.
///
/// `ancestors` must be ordered from root UserState to the immediate parent
/// of the agent (same convention as `verify_ancestor_chain` in spawn_agent).
///
/// Returns `Ok(())` if the chain is valid and no ancestor is frozen/revoked.
pub fn verify_ancestors_not_frozen(
    agent: &Account<'_, AgentState>,
    ancestors: &[AccountInfo],
    program_id: &Pubkey,
) -> Result<()> {
    // Depth-1 agents have a UserState parent — no ancestor chain to walk
    if agent.parent_kind == crate::state::ParentKind::User {
        return Ok(());
    }

    // Must have at least the root UserState
    require!(
        !ancestors.is_empty(),
        SableError::InvalidAncestorChain
    );

    // Verify root is a valid UserState and matches agent's root_user
    let root = &ancestors[0];
    let _root_user = UserState::try_deserialize(&mut &root.try_borrow_data()?[..])
        .map_err(|_| error!(SableError::InvalidAncestorChain))?;
    require!(
        root.key() == agent.root_user,
        SableError::InvalidAncestorChain
    );

    // Verify the agent's own PDA (defense in depth)
    let (expected_agent_pda, _) = Pubkey::find_program_address(
        &[
            crate::AGENT_STATE_SEED.as_bytes(),
            agent.parent.as_ref(),
            &agent.nonce.to_le_bytes(),
        ],
        program_id,
    );
    require!(
        agent.key() == expected_agent_pda,
        SableError::InvalidAncestorChain
    );

    // The last ancestor must be the agent's immediate parent
    let last_ancestor = ancestors.last().unwrap();
    require!(
        last_ancestor.key() == agent.parent,
        SableError::InvalidAncestorChain
    );

    // Walk backwards through AgentState ancestors (skip index 0 which is root UserState),
    // verifying each link and frozen/revoked status
    for i in (1..ancestors.len()).rev() {
        let ancestor = &ancestors[i];
        let ancestor_agent = AgentState::try_deserialize(
            &mut &ancestor.try_borrow_data()?[..]
        )
        .map_err(|_| error!(SableError::InvalidAncestorChain))?;

        // Verify ancestor PDA
        let (expected_ancestor_pda, _) = Pubkey::find_program_address(
            &[
                crate::AGENT_STATE_SEED.as_bytes(),
                ancestor_agent.parent.as_ref(),
                &ancestor_agent.nonce.to_le_bytes(),
            ],
            program_id,
        );
        require!(
            ancestor.key() == expected_ancestor_pda,
            SableError::InvalidAncestorChain
        );

        // Verify ancestor's parent is the previous account in the chain
        let expected_parent = &ancestors[i - 1];
        require!(
            ancestor_agent.parent == expected_parent.key(),
            SableError::InvalidAncestorChain
        );

        // CRITICAL: Check frozen / revoked
        require!(
            !ancestor_agent.frozen && !ancestor_agent.revoked,
            SableError::AgentFrozenOrRevoked
        );
    }

    Ok(())
}
