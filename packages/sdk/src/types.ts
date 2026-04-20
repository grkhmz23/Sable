import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { Connection, TransactionSignature } from '@solana/web3.js';

// wSOL mint address - always included by default
export const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

export interface TransferItem {
  toOwner: PublicKey;
  amount: BN;
}

export interface BatchTransferInput {
  recipient: string;
  amount: string | number;
}

export interface SdkConfig {
  programId?: PublicKey;
  connection: Connection;
  wallet?: {
    publicKey: PublicKey;
    signTransaction: any;
    signAllTransactions: any;
    signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
  };
}

export interface DepositParams {
  mint: PublicKey;
  amount: BN;
}

export interface WithdrawParams {
  mint: PublicKey;
  amount: BN;
  destinationAta?: PublicKey;
}

export interface TransferBatchParams {
  mint: PublicKey;
  items: TransferItem[];
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

export interface DelegationStatus {
  account: PublicKey;
  isDelegated: boolean;
}

export interface TransactionResult {
  signature: TransactionSignature;
  confirmation?: any;
}

export interface PdaDerivations {
  userState: [PublicKey, number];
  userBalance: [PublicKey, number];
  vaultAuthority: [PublicKey, number];
  vaultAta: PublicKey;
}

// Default values
export const DEFAULT_UPDATE_FREQUENCY_MS = 5000;
export const DEFAULT_TTL_SECONDS = 300;
export const MAX_BATCH_TRANSFER_RECIPIENTS = 15;
export const MAX_MINTS_PER_DELEGATION = 10;
