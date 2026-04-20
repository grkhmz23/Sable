import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

// Account Types
export interface ConfigAccount {
  admin: PublicKey;
  delegationProgramId: PublicKey;
  bump: number;
}

export interface UserStateAccount {
  owner: PublicKey;
  bump: number;
  stateVersion: BN;
}

export interface UserBalanceAccount {
  owner: PublicKey;
  mint: PublicKey;
  bump: number;
  amount: BN;
  version: BN;
}

export interface VaultAuthorityAccount {
  bump: number;
}

// Instruction Parameters
export interface InitializeParams {
  configAdmin: PublicKey;
  delegationProgramId?: PublicKey;
}

export interface DepositParams {
  mint: PublicKey;
  amount: BN;
}

export interface TransferItem {
  toOwner: PublicKey;
  amount: BN;
}

export interface TransferBatchParams {
  mint: PublicKey;
  items: TransferItem[];
}

export interface WithdrawParams {
  mint: PublicKey;
  amount: BN;
  destinationAta?: PublicKey;
}

export interface DelegateParams {
  mintList: PublicKey[];
  erValidator?: PublicKey;
  updateFrequencyMs?: number;
  ttlSeconds?: number;
}

export interface CommitUndelegateParams {
  mintList: PublicKey[];
}

// Events
export interface DepositEvent {
  owner: PublicKey;
  mint: PublicKey;
  amount: BN;
  newBalance: BN;
  stateVersion: BN;
}

export interface TransferEvent {
  fromOwner: PublicKey;
  mint: PublicKey;
  toOwner: PublicKey;
  amount: BN;
}

export interface TransferBatchEvent {
  fromOwner: PublicKey;
  mint: PublicKey;
  recipientCount: number;
  totalAmount: BN;
  stateVersion: BN;
}

export interface WithdrawEvent {
  owner: PublicKey;
  mint: PublicKey;
  amount: BN;
  newBalance: BN;
  stateVersion: BN;
}

export interface DelegateEvent {
  owner: PublicKey;
  mintCount: number;
  mints: PublicKey[];
}

export interface CommitUndelegateEvent {
  owner: PublicKey;
  mintCount: number;
  mints: PublicKey[];
}

// SDK Types
export interface SdkConfig {
  programId: PublicKey;
  connection: any; // Connection
  wallet?: any; // WalletContextState
}

export interface BatchTransferInput {
  recipient: string;
  amount: string | number;
}

export interface PdaDerivations {
  userState: [PublicKey, number];
  userBalance: [PublicKey, number];
  vaultAuthority: [PublicKey, number];
  vaultAta: PublicKey;
}

// Agent Types
export interface AgentStateAccount {
  version: number;
  bump: number;
  parentKind: 'user' | 'agent';
  parent: PublicKey;
  owner: PublicKey;
  rootUser: PublicKey;
  label: string;
  nonce: number;
  childCount: number;
  frozen: boolean;
  revoked: boolean;
  createdAt: BN;
  policy: SpendPolicy;
}

export interface AgentCountersAccount {
  agent: PublicKey;
  bump: number;
  spentTotal: BN;
  spentToday: BN;
  currentDay: BN;
}

export interface SpendPolicy {
  perTxLimit: BN;
  dailyLimit: BN;
  totalLimit: BN;
  counterpartyMode: 'any' | 'allowlistOnly';
  allowedCounterparties: PublicKey[];
  allowedMints: PublicKey[];
  expiresAt: BN;
}

// Auction Types
export interface TaskAccount {
  version: number;
  bump: number;
  poster: PublicKey;
  posterKind: 'user' | 'agent';
  mint: PublicKey;
  budget: BN;
  minDeposit: BN;
  specHash: number[];
  bidCommitDeadline: BN;
  bidRevealDeadline: BN;
  state: 'open' | 'revealing' | 'settled' | 'cancelled';
  winningBidder: PublicKey;
  winningBid: BN;
  bidCount: number;
  taskId: BN;
}

export interface TaskEscrowAccount {
  task: PublicKey;
  mint: PublicKey;
  amount: BN;
  bump: number;
}

export interface BidAccount {
  version: number;
  bump: number;
  task: PublicKey;
  bidder: PublicKey;
  bidderKind: 'user' | 'agent';
  commitHash: number[];
  deposit: BN;
  revealedAmount: BN;
  revealed: boolean;
  submittedAt: BN;
}

// Agent Events
export interface AgentSpawnedEvent {
  agent: PublicKey;
  parent: PublicKey;
  rootUser: PublicKey;
  label: string;
  owner: PublicKey;
}

export interface PolicyUpdatedEvent {
  agent: PublicKey;
  policy: SpendPolicy;
}

export interface AgentFrozenEvent {
  agent: PublicKey;
  frozenBy: PublicKey;
}

export interface AgentUnfrozenEvent {
  agent: PublicKey;
  unfrozenBy: PublicKey;
}

export interface AgentRevokedEvent {
  agent: PublicKey;
  revokedBy: PublicKey;
}

// Auction Events
export interface TaskCreatedEvent {
  task: PublicKey;
  poster: PublicKey;
  mint: PublicKey;
  budget: BN;
  bidCommitDeadline: BN;
  bidRevealDeadline: BN;
  specHash: number[];
}

export interface TaskCancelledEvent {
  task: PublicKey;
  poster: PublicKey;
  refund: BN;
}

export interface BidCommittedEvent {
  task: PublicKey;
  bidder: PublicKey;
  deposit: BN;
}

export interface BidRevealedEvent {
  task: PublicKey;
  bidder: PublicKey;
  amount: BN;
}

export interface AuctionSettledEvent {
  task: PublicKey;
  winner: PublicKey;
  amount: BN;
  participants: number;
  forfeitCount: number;
}
