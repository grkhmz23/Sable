use anchor_lang::prelude::*;

#[error_code]
pub enum L2ConceptV1Error {
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
}
