use anchor_lang::prelude::*;

#[error_code]
pub enum SableError {
    #[msg("Program not initialized")]
    NotInitialized,

    #[msg("User has not joined")]
    NotJoined,

    #[msg("Balance account not found")]
    BalanceNotFound,

    #[msg("Insufficient balance")]
    InsufficientBalance,

    #[msg("Invalid recipient accounts provided")]
    InvalidRecipientAccounts,

    #[msg("Invalid mint account")]
    InvalidMint,

    #[msg("Invalid amount")]
    InvalidAmount,

    #[msg("Withdrawal not allowed while account is delegated")]
    WithdrawWhileDelegated,

    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("Arithmetic underflow")]
    Underflow,

    #[msg("Not authorized")]
    NotAuthorized,

    #[msg("Too many recipients in batch transfer")]
    TooManyRecipients,

    #[msg("Self transfer not allowed")]
    SelfTransferNotAllowed,

    #[msg("Duplicate recipient in batch transfer")]
    DuplicateRecipient,

    #[msg("Invalid mint list")]
    InvalidMintList,

    #[msg("Account is already delegated")]
    AlreadyDelegated,

    #[msg("Account is not delegated")]
    NotDelegated,

    #[msg("Too many mints in setup")]
    TooManyMints,

    #[msg("Duplicate mint in setup")]
    DuplicateMint,

    #[msg("Empty mint list")]
    EmptyMintList,

    #[msg("Invalid destination token account")]
    InvalidDestinationTokenAccount,

    #[msg("Delegation CPI failed")]
    DelegationFailed,

    #[msg("Commit/undelegate CPI failed")]
    CommitFailed,

    #[msg("Too many balances for delegation")]
    TooManyBalancesForDelegation,

    #[msg("Agent depth exceeded maximum allowed")]
    AgentDepthExceeded,

    #[msg("Agent has children and cannot be closed")]
    AgentHasChildren,

    #[msg("Not the root user owner")]
    NotAgentRoot,

    #[msg("Agent is frozen or revoked")]
    AgentFrozenOrRevoked,

    #[msg("Invalid ancestor chain")]
    InvalidAncestorChain,

    #[msg("Too many agents for this parent")]
    TooManyAgents,

    #[msg("Spend policy has expired")]
    PolicyExpired,

    #[msg("Counterparty not allowed by policy")]
    CounterpartyNotAllowed,

    #[msg("Mint not allowed by policy")]
    MintNotAllowed,

    #[msg("Per-transaction limit exceeded")]
    PerTxLimitExceeded,

    #[msg("Daily spend limit exceeded")]
    DailyLimitExceeded,

    #[msg("Total lifetime spend limit exceeded")]
    TotalLimitExceeded,

    #[msg("Agent owner not authorized")]
    AgentNotAuthorized,

    #[msg("Insufficient agent balance")]
    InsufficientAgentBalance,

    #[msg("Agent still has balances and cannot be closed")]
    AgentHasBalances,

    #[msg("Task deadline is invalid")]
    TaskDeadlineInvalid,

    #[msg("Task cannot be cancelled")]
    TaskNotCancellable,

    #[msg("Task escrow does not match task")]
    TaskEscrowMismatch,

    #[msg("Task is in wrong state for this operation")]
    TaskWrongState,

    #[msg("Deposit is below the task minimum")]
    DepositBelowMinimum,

    #[msg("Bid reveal hash does not match commitment")]
    InvalidReveal,

    #[msg("Permission metadata initialization failed")]
    PermissionInitFailed,
}
