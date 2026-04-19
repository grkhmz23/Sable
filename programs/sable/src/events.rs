use anchor_lang::prelude::*;

#[event]
pub struct InitializeEvent {
    pub admin: Pubkey,
    pub delegation_program_id: Pubkey,
}

#[event]
pub struct JoinEvent {
    pub owner: Pubkey,
}

#[event]
pub struct CompleteSetupEvent {
    pub owner: Pubkey,
    pub wsol_included: bool,
    pub additional_mints: Vec<Pubkey>,
    pub total_balances: u8,
}

#[event]
pub struct AddMintEvent {
    pub owner: Pubkey,
    pub mint: Pubkey,
}

#[event]
pub struct DepositEvent {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub new_balance: u64,
    pub state_version: u64,
}

#[event]
pub struct TransferEvent {
    pub from_owner: Pubkey,
    pub mint: Pubkey,
    pub to_owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct TransferBatchEvent {
    pub from_owner: Pubkey,
    pub mint: Pubkey,
    pub recipient_count: u16,
    pub total_amount: u64,
    pub state_version: u64,
    pub transfers: Vec<TransferEvent>,
}

#[event]
pub struct ExternalSendBatchEvent {
    pub from_owner: Pubkey,
    pub mint: Pubkey,
    pub recipient_count: u16,
    pub total_amount: u64,
    pub state_version: u64,
    pub transfers: Vec<TransferEvent>,
}

#[event]
pub struct WithdrawEvent {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub new_balance: u64,
    pub state_version: u64,
}

#[event]
pub struct DelegateEvent {
    pub owner: Pubkey,
    pub mint_count: u8,
    pub mints: Vec<Pubkey>,
}

#[event]
pub struct CommitUndelegateEvent {
    pub owner: Pubkey,
    pub mint_count: u8,
    pub mints: Vec<Pubkey>,
}
