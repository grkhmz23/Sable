use anchor_lang::prelude::*;
use crate::error::SableError;
use crate::events::TaskCancelled;
use crate::state::{
    AgentBalance, AgentState, PosterKind, Task, TaskEscrow, TaskState, UserBalance, UserState,
};

#[derive(Accounts)]
pub struct CancelTask<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(mut)]
    pub task: Account<'info, Task>,

    #[account(
        mut,
        seeds = [
            crate::instructions::auction::create_task::TASK_ESCROW_SEED.as_bytes(),
            task.key().as_ref(),
        ],
        bump = task_escrow.bump,
    )]
    pub task_escrow: Account<'info, TaskEscrow>,

    /// CHECK: Poster account (UserState or AgentState), validated in instruction
    #[account(mut)]
    pub poster: AccountInfo<'info>,

    /// CHECK: Poster balance account (UserBalance or AgentBalance), validated in instruction
    #[account(mut)]
    pub poster_balance: AccountInfo<'info>,
}

/// Cancel a task. Only callable by the poster owner when:
/// - state == Open
/// - now < bid_commit_deadline
/// - bid_count == 0
/// Refunds the escrowed budget back to the poster's balance.
pub fn cancel_task(ctx: Context<CancelTask>) -> Result<()> {
    let task = &mut ctx.accounts.task;
    let task_escrow = &mut ctx.accounts.task_escrow;
    let now = Clock::get()?.unix_timestamp;

    // State checks
    require!(task.state == TaskState::Open, SableError::TaskWrongState);
    require!(now < task.bid_commit_deadline, SableError::TaskNotCancellable);
    require!(task.bid_count == 0, SableError::TaskNotCancellable);

    // Verify escrow matches task
    require!(
        task_escrow.task == task.key(),
        SableError::TaskEscrowMismatch
    );

    let poster_key = task.poster;
    let refund = task_escrow.amount;
    let mint_key = task.mint;

    // Verify signer is the poster owner
    let poster_data = ctx.accounts.poster.try_borrow_data()?;
    if task.poster_kind == PosterKind::User {
        let poster_state = UserState::try_deserialize(&mut &poster_data[..])
            .map_err(|_| error!(SableError::InvalidRecipientAccounts))?;
        require!(poster_state.owner == ctx.accounts.signer.key(), SableError::NotAuthorized);
    } else {
        let poster_state = AgentState::try_deserialize(&mut &poster_data[..])
            .map_err(|_| error!(SableError::InvalidRecipientAccounts))?;
        require!(poster_state.owner == ctx.accounts.signer.key(), SableError::AgentNotAuthorized);
    }
    drop(poster_data);

    // Defense in depth: ensure the poster account provided matches the task's recorded poster
    require!(
        ctx.accounts.poster.key() == poster_key,
        SableError::InvalidRecipientAccounts
    );

    // Credit refund back to poster balance
    if task.poster_kind == PosterKind::User {
        credit_user_balance(&ctx.accounts.poster_balance, poster_key, mint_key, refund)?;
    } else {
        credit_agent_balance(&ctx.accounts.poster_balance, poster_key, mint_key, refund)?;
    }

    // Zero out escrow
    task_escrow.amount = 0;

    // Mark task as cancelled
    task.state = TaskState::Cancelled;

    emit!(TaskCancelled {
        task: task.key(),
        poster: poster_key,
        refund,
    });

    Ok(())
}

/// Credit a UserBalance by `amount`. Validates PDA and mint.
fn credit_user_balance(
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
    drop(balance_data);

    let mut data = balance_acc_info.try_borrow_mut_data()?;
    // UserBalance: amount at offset 73, version at offset 81
    let current_amount = u64::from_le_bytes([
        data[73], data[74], data[75], data[76],
        data[77], data[78], data[79], data[80],
    ]);
    let new_amount = current_amount.checked_add(amount).ok_or(SableError::Overflow)?;
    data[73..81].copy_from_slice(&new_amount.to_le_bytes());

    let current_version = u64::from_le_bytes([
        data[81], data[82], data[83], data[84],
        data[85], data[86], data[87], data[88],
    ]);
    let new_version = current_version.checked_add(1).ok_or(SableError::Overflow)?;
    data[81..89].copy_from_slice(&new_version.to_le_bytes());

    Ok(())
}

/// Credit an AgentBalance by `amount`. Validates PDA and mint.
fn credit_agent_balance(
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
    drop(balance_data);

    let mut data = balance_acc_info.try_borrow_mut_data()?;
    // AgentBalance: amount at offset 72, version at offset 80
    let current_amount = u64::from_le_bytes([
        data[72], data[73], data[74], data[75],
        data[76], data[77], data[78], data[79],
    ]);
    let new_amount = current_amount.checked_add(amount).ok_or(SableError::Overflow)?;
    data[72..80].copy_from_slice(&new_amount.to_le_bytes());

    let current_version = u64::from_le_bytes([
        data[80], data[81], data[82], data[83],
        data[84], data[85], data[86], data[87],
    ]);
    let new_version = current_version.checked_add(1).ok_or(SableError::Overflow)?;
    data[80..88].copy_from_slice(&new_version.to_le_bytes());

    Ok(())
}
