use anchor_lang::prelude::*;

/// Global program configuration
#[account]
pub struct Config {
    pub admin: Pubkey,
    pub delegation_program_id: Pubkey,
    pub bump: u8,
}

impl Config {
    pub const SIZE: usize = 32 + 32 + 1;
}

/// User state PDA - tracks user-level state
#[account]
pub struct UserState {
    pub owner: Pubkey,
    pub bump: u8,
    pub state_version: u64,
    pub agent_count: u32,
}

impl UserState {
    pub const SIZE: usize = 32 + 1 + 8 + 4;
}

/// Agent state PDA - hierarchical agent subaccount
#[account]
pub struct AgentState {
    pub version: u8,
    pub bump: u8,
    pub parent_kind: ParentKind,
    pub parent: Pubkey,
    pub owner: Pubkey,
    pub root_user: Pubkey,
    pub label: [u8; 32],
    pub nonce: u32,
    pub child_count: u32,
    pub frozen: bool,
    pub revoked: bool,
    pub created_at: i64,
}

impl AgentState {
    pub const SIZE: usize = 1 + 1 + 1 + 32 + 32 + 32 + 32 + 4 + 4 + 1 + 1 + 8;
}

/// Kind of parent account for an agent
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum ParentKind {
    User = 0,
    Agent = 1,
}

/// User balance PDA - tracks balance per mint
#[account]
pub struct UserBalance {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub bump: u8,
    pub amount: u64,
    pub version: u64,
}

impl UserBalance {
    pub const SIZE: usize = 32 + 32 + 1 + 8 + 8;
}

/// Vault authority PDA - owns all vault ATAs
#[account]
pub struct VaultAuthority {
    pub bump: u8,
}

impl VaultAuthority {
    pub const SIZE: usize = 1;
}

/// Transfer item for batch transfers
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct TransferItem {
    pub to_owner: Pubkey,
    pub amount: u64,
}
