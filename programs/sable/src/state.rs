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

/// Spend policy for an agent
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct SpendPolicy {
    pub per_tx_limit: u64,          // 0 = no cap
    pub daily_limit: u64,           // 0 = no cap
    pub total_limit: u64,           // lifetime cap, 0 = no cap
    pub counterparty_mode: CounterpartyMode,  // enum: Any | AllowlistOnly
    pub allowed_counterparties: [Pubkey; 4], // zero pubkey = slot unused
    pub allowed_mints: [Pubkey; 4], // zero pubkey = slot unused; max 4
    pub expires_at: i64,            // unix seconds, 0 = never
}

impl SpendPolicy {
    pub const SIZE: usize = 8 + 8 + 8 + 1 + 128 + 128 + 8;
}

/// Counterparty mode for spend policy
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum CounterpartyMode {
    Any = 0,
    AllowlistOnly = 1,
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
    pub policy: SpendPolicy,
}

impl AgentState {
    pub const SIZE: usize = 1 + 1 + 1 + 32 + 32 + 32 + 32 + 4 + 4 + 1 + 1 + 8 + SpendPolicy::SIZE;
}

/// Agent counters PDA - running spend counters (keeps AgentState small)
#[account]
#[derive(Debug)]
pub struct AgentCounters {
    pub agent: Pubkey,
    pub bump: u8,
    pub spent_total: u64,
    pub spent_today: u64,
    pub current_day: i64,           // unix day index (block_time / 86400)
}

impl AgentCounters {
    pub const SIZE: usize = 32 + 1 + 8 + 8 + 8;
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

/// Agent balance PDA - tracks balance per mint for an agent
#[account]
pub struct AgentBalance {
    pub agent: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub version: u64,
    pub bump: u8,
}

impl AgentBalance {
    pub const SIZE: usize = 32 + 32 + 8 + 8 + 1;
}

/// Recipient kind for transfers
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum RecipientKind {
    User = 0,
    Agent = 1,
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
    pub kind: RecipientKind,
}
