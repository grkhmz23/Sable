use anchor_lang::prelude::*;
use crate::error::SableError;
use crate::events::AgentSpawned;
use crate::state::{AgentCounters, AgentState, CounterpartyMode, ParentKind, SpendPolicy, UserState};

pub const MAX_AGENTS_PER_PARENT: usize = 64;
pub const MAX_DEPTH: u32 = 4;
pub const AGENT_STATE_SEED: &str = "agent_state";
pub const AGENT_COUNTERS_SEED: &str = "agent_counters";

#[derive(Accounts)]
#[instruction(parent_kind: ParentKind, label: String, nonce: u32)]
pub struct SpawnAgent<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Parent account (UserState or AgentState), validated in instruction
    pub parent: AccountInfo<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + AgentState::SIZE,
        seeds = [
            AGENT_STATE_SEED.as_bytes(),
            parent.key().as_ref(),
            &nonce.to_le_bytes(),
        ],
        bump
    )]
    pub new_agent: Account<'info, AgentState>,

    #[account(
        init,
        payer = payer,
        space = 8 + AgentCounters::SIZE,
        seeds = [
            AGENT_COUNTERS_SEED.as_bytes(),
            new_agent.key().as_ref(),
        ],
        bump
    )]
    pub new_agent_counters: Account<'info, AgentCounters>,

    #[account(mut)]
    pub parent_owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// Spawn a new agent under a UserState or existing AgentState.
///
/// * `parent_kind` — User or Agent, must match the actual parent account type.
/// * `label` — UTF-8 label, max 32 bytes.
/// * `nonce` — must equal the parent's current count (agent_count for UserState,
///   child_count for AgentState). The instruction increments the count after validating.
pub fn spawn_agent(
    ctx: Context<SpawnAgent>,
    parent_kind: ParentKind,
    label: String,
    nonce: u32,
) -> Result<()> {
    // Validate label length
    let label_bytes = label.as_bytes();
    require!(
        label_bytes.len() <= 32,
        SableError::InvalidAmount
    );
    let mut label_arr = [0u8; 32];
    label_arr[..label_bytes.len()].copy_from_slice(label_bytes);

    let clock = Clock::get()?;

    // Disambiguate and validate parent
    let (root_user, depth) = if parent_kind == ParentKind::User {
        // Parent must be a UserState
        let parent_state = UserState::try_deserialize(
            &mut &ctx.accounts.parent.try_borrow_data()?[..]
        )
        .map_err(|_| error!(SableError::InvalidRecipientAccounts))?;

        require!(
            parent_state.owner == ctx.accounts.parent_owner.key(),
            SableError::NotAuthorized
        );
        require!(
            parent_state.agent_count < MAX_AGENTS_PER_PARENT as u32,
            SableError::TooManyAgents
        );
        require!(nonce == parent_state.agent_count, SableError::InvalidAmount);

        // No ancestor chain for UserState parent
        require!(
            ctx.remaining_accounts.is_empty(),
            SableError::InvalidAncestorChain
        );

        (ctx.accounts.parent.key(), 1u32)
    } else {
        // Parent must be an AgentState
        let parent_state = AgentState::try_deserialize(
            &mut &ctx.accounts.parent.try_borrow_data()?[..]
        )
        .map_err(|_| error!(SableError::InvalidRecipientAccounts))?;

        require!(
            parent_state.owner == ctx.accounts.parent_owner.key(),
            SableError::NotAuthorized
        );
        require!(
            !parent_state.frozen && !parent_state.revoked,
            SableError::AgentFrozenOrRevoked
        );
        require!(
            parent_state.child_count < MAX_AGENTS_PER_PARENT as u32,
            SableError::TooManyAgents
        );
        require!(nonce == parent_state.child_count, SableError::InvalidAmount);

        // Verify parent's own PDA
        let (expected_parent_pda, _) = Pubkey::find_program_address(
            &[
                AGENT_STATE_SEED.as_bytes(),
                parent_state.parent.as_ref(),
                &parent_state.nonce.to_le_bytes(),
            ],
            ctx.program_id,
        );
        require!(
            ctx.accounts.parent.key() == expected_parent_pda,
            SableError::InvalidAncestorChain
        );

        // Walk ancestor chain from remaining_accounts
        let depth = verify_ancestor_chain(
            &ctx.accounts.parent,
            ctx.remaining_accounts,
            ctx.program_id,
            parent_state.root_user,
        )?;

        (parent_state.root_user, depth)
    };

    // Depth check
    require!(
        depth < MAX_DEPTH,
        SableError::AgentDepthExceeded
    );

    // Increment parent's count
    {
        let mut parent_data = ctx.accounts.parent.try_borrow_mut_data()?;
        if parent_kind == ParentKind::User {
            // agent_count is at offset 49 (8 disc + 32 owner + 1 bump + 8 version)
            let count_bytes = &mut parent_data[49..53];
            let current = u32::from_le_bytes([
                count_bytes[0], count_bytes[1], count_bytes[2], count_bytes[3],
            ]);
            let next = current.checked_add(1).ok_or(SableError::Overflow)?;
            count_bytes.copy_from_slice(&next.to_le_bytes());
        } else {
            // child_count is at offset 143 (8 disc + 1 version + 1 bump + 1 parent_kind +
            // 32 parent + 32 owner + 32 root_user + 32 label + 4 nonce)
            let count_bytes = &mut parent_data[143..147];
            let current = u32::from_le_bytes([
                count_bytes[0], count_bytes[1], count_bytes[2], count_bytes[3],
            ]);
            let next = current.checked_add(1).ok_or(SableError::Overflow)?;
            count_bytes.copy_from_slice(&next.to_le_bytes());
        }
    }

    // Default policy: fully open
    let default_policy = SpendPolicy {
        per_tx_limit: 0,
        daily_limit: 0,
        total_limit: 0,
        counterparty_mode: CounterpartyMode::Any,
        allowed_counterparties: [Pubkey::default(); 4],
        allowed_mints: [Pubkey::default(); 4],
        expires_at: 0,
    };

    // Initialize new agent
    let new_agent = &mut ctx.accounts.new_agent;
    new_agent.version = 1;
    new_agent.bump = ctx.bumps.new_agent;
    new_agent.parent_kind = parent_kind;
    new_agent.parent = ctx.accounts.parent.key();
    new_agent.owner = ctx.accounts.parent_owner.key();
    new_agent.root_user = root_user;
    new_agent.label = label_arr;
    new_agent.nonce = nonce;
    new_agent.child_count = 0;
    new_agent.frozen = false;
    new_agent.revoked = false;
    new_agent.created_at = clock.unix_timestamp;
    new_agent.policy = default_policy;

    // Initialize agent counters
    let new_agent_counters = &mut ctx.accounts.new_agent_counters;
    new_agent_counters.agent = new_agent.key();
    new_agent_counters.bump = ctx.bumps.new_agent_counters;
    new_agent_counters.spent_total = 0;
    new_agent_counters.spent_today = 0;
    new_agent_counters.current_day = 0;

    emit!(AgentSpawned {
        agent: new_agent.key(),
        parent: new_agent.parent,
        root_user: new_agent.root_user,
        label: new_agent.label,
        owner: new_agent.owner,
    });

    Ok(())
}

/// Verify the ancestor chain for an AgentState parent.
///
/// `ancestors` must be ordered from root UserState to the immediate parent.
/// Returns the depth of the new agent (parent's depth + 1).
pub fn verify_ancestor_chain(
    parent_account: &AccountInfo,
    ancestors: &[AccountInfo],
    program_id: &Pubkey,
    expected_root_user: Pubkey,
) -> Result<u32> {
    // Must have at least the root UserState
    require!(
        !ancestors.is_empty(),
        SableError::InvalidAncestorChain
    );

    // Verify root is a valid UserState
    let root = &ancestors[0];
    let _root_user = UserState::try_deserialize(&mut &root.try_borrow_data()?[..])
        .map_err(|_| error!(SableError::InvalidAncestorChain))?;
    require!(
        root.key() == expected_root_user,
        SableError::InvalidAncestorChain
    );

    // Parse parent agent
    let parent_agent = AgentState::try_deserialize(
        &mut &parent_account.try_borrow_data()?[..]
    )
    .map_err(|_| error!(SableError::InvalidAncestorChain))?;

    // Verify parent's PDA
    let (expected_parent_pda, _) = Pubkey::find_program_address(
        &[
            AGENT_STATE_SEED.as_bytes(),
            parent_agent.parent.as_ref(),
            &parent_agent.nonce.to_le_bytes(),
        ],
        program_id,
    );
    require!(
        parent_account.key() == expected_parent_pda,
        SableError::InvalidAncestorChain
    );

    // The last ancestor must be the parent of the parent_account
    let last_ancestor = ancestors.last().unwrap();
    require!(
        last_ancestor.key() == parent_agent.parent,
        SableError::InvalidAncestorChain
    );

    // Walk backwards through ancestors, verifying each link
    let mut current_depth = 2u32; // parent is at least depth 2

    for i in (1..ancestors.len()).rev() {
        let ancestor = &ancestors[i];
        let ancestor_agent = AgentState::try_deserialize(
            &mut &ancestor.try_borrow_data()?[..]
        )
        .map_err(|_| error!(SableError::InvalidAncestorChain))?;

        // Verify ancestor PDA
        let (expected_ancestor_pda, _) = Pubkey::find_program_address(
            &[
                AGENT_STATE_SEED.as_bytes(),
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

        current_depth += 1;
    }

    Ok(current_depth)
}
