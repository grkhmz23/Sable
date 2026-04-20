use anchor_lang::prelude::*;
use crate::error::SableError;
use crate::events::TaskCreated;
use crate::policy::validate_spend;
use crate::state::{
    AgentBalance, AgentCounters, AgentState, ParentKind, PosterKind, Task, TaskEscrow,
    TaskState, UserBalance, UserState,
};

pub const TASK_SEED: &str = "task";
pub const TASK_ESCROW_SEED: &str = "task_escrow";

#[derive(Accounts)]
#[instruction(poster_kind: PosterKind, task_id: u64)]
pub struct CreateTask<'info> {
    #[account(mut)]
    pub poster_owner: Signer<'info>,

    /// CHECK: Poster account (UserState or AgentState), validated in instruction
    #[account(mut)]
    pub poster: AccountInfo<'info>,

    /// CHECK: Poster balance account (UserBalance or AgentBalance), validated in instruction
    #[account(mut)]
    pub poster_balance: AccountInfo<'info>,

    #[account(
        init,
        payer = poster_owner,
        space = 8 + Task::SIZE,
        seeds = [
            TASK_SEED.as_bytes(),
            poster.key().as_ref(),
            &task_id.to_le_bytes(),
        ],
        bump
    )]
    pub task: Account<'info, Task>,

    #[account(
        init,
        payer = poster_owner,
        space = 8 + TaskEscrow::SIZE,
        seeds = [
            TASK_ESCROW_SEED.as_bytes(),
            task.key().as_ref(),
        ],
        bump
    )]
    pub task_escrow: Account<'info, TaskEscrow>,

    /// CHECK: Mint account validated against poster_balance
    pub mint: AccountInfo<'info>,

    /// CHECK: Agent counters, only used/validated when poster is an Agent
    #[account(mut)]
    pub agent_counters: AccountInfo<'info>,

    pub system_program: Program<'info, System>,

    /// CHECK: MagicBlock PER permission program
    pub permission_program: AccountInfo<'info>,

    /// CHECK: Permission PDA for task_escrow, validated in instruction
    #[account(mut)]
    pub permission: AccountInfo<'info>,
}

/// Create a new task (auction listing).
///
/// * `poster_kind` — User or Agent.
/// * `task_id` — must equal the poster's current task_count.
/// * `budget` — max amount locked in escrow.
/// * `min_deposit` — minimum bidder deposit.
/// * `spec_hash` — SHA-256 of off-chain spec.
/// * `bid_commit_deadline` — unix seconds, must be in the future.
/// * `bid_reveal_deadline` — unix seconds, must be after commit deadline.
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
    require!(budget > 0, SableError::InvalidAmount);

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    // Deadline validations
    require!(bid_commit_deadline > now, SableError::TaskDeadlineInvalid);
    require!(
        bid_reveal_deadline > bid_commit_deadline,
        SableError::TaskDeadlineInvalid
    );
    require!(
        bid_reveal_deadline <= now + 7 * 86400,
        SableError::TaskDeadlineInvalid
    );

    let poster_key = ctx.accounts.poster.key();
    let signer = ctx.accounts.poster_owner.key();
    let mint_key = ctx.accounts.mint.key();

    // Validate poster, debit balance, and compute next task_id
    let mut poster_data = ctx.accounts.poster.try_borrow_mut_data()?;

    let next_task_id = if poster_kind == PosterKind::User {
        // --- Human poster ---
        let mut poster_state = UserState::try_deserialize(&mut &poster_data[..])
            .map_err(|_| error!(SableError::InvalidRecipientAccounts))?;

        require!(poster_state.owner == signer, SableError::NotAuthorized);
        require!(task_id == poster_state.task_count, SableError::InvalidAmount);

        // Validate and debit UserBalance
        debit_user_balance(&ctx.accounts.poster_balance, poster_key, mint_key, budget)?;

        poster_state.task_count = poster_state
            .task_count
            .checked_add(1)
            .ok_or(SableError::Overflow)?;
        poster_state.serialize(&mut &mut poster_data[..])?;
        poster_state.task_count
    } else {
        // --- Agent poster ---
        let mut poster_state = AgentState::try_deserialize(&mut &poster_data[..])
            .map_err(|_| error!(SableError::InvalidRecipientAccounts))?;

        require!(poster_state.owner == signer, SableError::AgentNotAuthorized);
        require!(
            !poster_state.frozen && !poster_state.revoked,
            SableError::AgentFrozenOrRevoked
        );
        require!(task_id == poster_state.task_count, SableError::InvalidAmount);

        // Verify ancestor chain is not frozen/revoked (depth > 1 only)
        if poster_state.parent_kind == ParentKind::Agent {
            crate::instructions::agent::verify_ancestors_not_frozen(
                &poster_state,
                &poster_key,
                ctx.remaining_accounts,
                ctx.program_id,
            )?;
        }

        // Validate agent_counters PDA
        let (expected_counters, _) = Pubkey::find_program_address(
            &[
                crate::AGENT_COUNTERS_SEED.as_bytes(),
                poster_key.as_ref(),
            ],
            ctx.program_id,
        );
        require!(
            ctx.accounts.agent_counters.key() == expected_counters,
            SableError::InvalidRecipientAccounts
        );

        let mut counters_data = ctx.accounts.agent_counters.try_borrow_mut_data()?;
        let mut counters = AgentCounters::try_deserialize(&mut &counters_data[..])
            .map_err(|_| error!(SableError::InvalidRecipientAccounts))?;

        // Policy check: budget is treated as an outbound transfer
        let updated_counters = validate_spend(
            &poster_state.policy,
            &counters,
            now,
            budget,
            &mint_key,
            &ctx.accounts.task.key(),
        )?;

        // Validate and debit AgentBalance
        debit_agent_balance(
            &ctx.accounts.poster_balance,
            poster_key,
            mint_key,
            budget,
        )?;

        // Write back updated counters
        counters.spent_total = updated_counters.spent_total;
        counters.spent_today = updated_counters.spent_today;
        counters.current_day = updated_counters.current_day;
        counters.serialize(&mut &mut counters_data[..])?;
        drop(counters_data);

        poster_state.task_count = poster_state
            .task_count
            .checked_add(1)
            .ok_or(SableError::Overflow)?;
        poster_state.serialize(&mut &mut poster_data[..])?;
        poster_state.task_count
    };
    drop(poster_data);

    // Initialize TaskEscrow
    let task_escrow = &mut ctx.accounts.task_escrow;
    task_escrow.task = ctx.accounts.task.key();
    task_escrow.mint = mint_key;
    task_escrow.amount = budget;
    task_escrow.bump = ctx.bumps.task_escrow;

    // Create PER permission for task_escrow
    let task_key = ctx.accounts.task.key();
    let escrow_signer_seeds: &[&[&[u8]]] = &[&[
        TASK_ESCROW_SEED.as_bytes(),
        task_key.as_ref(),
        &[ctx.bumps.task_escrow],
    ]];
    crate::permission_cpi::create_permission(
        &ctx.accounts.permission_program.to_account_info(),
        &ctx.accounts.task_escrow.to_account_info(),
        &ctx.accounts.permission.to_account_info(),
        &ctx.accounts.poster_owner.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        escrow_signer_seeds,
    )?;

    // Initialize Task
    let task = &mut ctx.accounts.task;
    task.version = 1;
    task.bump = ctx.bumps.task;
    task.poster = poster_key;
    task.poster_kind = poster_kind;
    task.mint = mint_key;
    task.budget = budget;
    task.min_deposit = min_deposit;
    task.spec_hash = spec_hash;
    task.bid_commit_deadline = bid_commit_deadline;
    task.bid_reveal_deadline = bid_reveal_deadline;
    task.state = TaskState::Open;
    task.winning_bidder = Pubkey::default();
    task.winning_bid = 0;
    task.bid_count = 0;
    task.task_id = task_id;

    emit!(TaskCreated {
        task: task.key(),
        poster: poster_key,
        mint: mint_key,
        budget,
        bid_commit_deadline,
        bid_reveal_deadline,
        spec_hash,
    });

    // Defensive: task_id used in PDA must match the one we stored
    assert!(next_task_id == task_id + 1);

    Ok(())
}

/// Debit a UserBalance by `amount`. Validates PDA and mint.
fn debit_user_balance(
    balance_acc_info: &AccountInfo,
    expected_owner: Pubkey,
    expected_mint: Pubkey,
    amount: u64,
) -> Result<()> {
    let balance_data = balance_acc_info.try_borrow_data()?;
    let balance = UserBalance::try_deserialize(&mut &balance_data[..])
        .map_err(|_| error!(SableError::InvalidRecipientAccounts))?;
    require!(balance.owner == expected_owner, SableError::InvalidRecipientAccounts);
    require!(balance.mint == expected_mint, SableError::InvalidMint);
    require!(balance.amount >= amount, SableError::InsufficientBalance);
    drop(balance_data);

    let mut data = balance_acc_info.try_borrow_mut_data()?;
    // UserBalance: discriminator(8) + owner(32) + mint(32) + bump(1) + amount(8) + version(8)
    // amount at offset 73, version at offset 81
    let current_amount = u64::from_le_bytes([
        data[73], data[74], data[75], data[76],
        data[77], data[78], data[79], data[80],
    ]);
    let new_amount = current_amount.checked_sub(amount).ok_or(SableError::Underflow)?;
    data[73..81].copy_from_slice(&new_amount.to_le_bytes());

    let current_version = u64::from_le_bytes([
        data[81], data[82], data[83], data[84],
        data[85], data[86], data[87], data[88],
    ]);
    let new_version = current_version.checked_add(1).ok_or(SableError::Overflow)?;
    data[81..89].copy_from_slice(&new_version.to_le_bytes());

    Ok(())
}

/// Debit an AgentBalance by `amount`. Validates PDA and mint.
fn debit_agent_balance(
    balance_acc_info: &AccountInfo,
    expected_agent: Pubkey,
    expected_mint: Pubkey,
    amount: u64,
) -> Result<()> {
    let balance_data = balance_acc_info.try_borrow_data()?;
    let balance = AgentBalance::try_deserialize(&mut &balance_data[..])
        .map_err(|_| error!(SableError::InvalidRecipientAccounts))?;
    require!(balance.agent == expected_agent, SableError::InvalidRecipientAccounts);
    require!(balance.mint == expected_mint, SableError::InvalidMint);
    require!(balance.amount >= amount, SableError::InsufficientAgentBalance);
    drop(balance_data);

    let mut data = balance_acc_info.try_borrow_mut_data()?;
    // AgentBalance: discriminator(8) + agent(32) + mint(32) + amount(8) + version(8) + bump(1)
    // amount at offset 72, version at offset 80
    let current_amount = u64::from_le_bytes([
        data[72], data[73], data[74], data[75],
        data[76], data[77], data[78], data[79],
    ]);
    let new_amount = current_amount.checked_sub(amount).ok_or(SableError::Underflow)?;
    data[72..80].copy_from_slice(&new_amount.to_le_bytes());

    let current_version = u64::from_le_bytes([
        data[80], data[81], data[82], data[83],
        data[84], data[85], data[86], data[87],
    ]);
    let new_version = current_version.checked_add(1).ok_or(SableError::Overflow)?;
    data[80..88].copy_from_slice(&new_version.to_le_bytes());

    Ok(())
}
