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
