import { PublicKey } from '@solana/web3.js';

// MagicBlock Delegation Program ID (mainnet)
export const MAGICBLOCK_DELEGATION_PROGRAM_ID = new PublicKey(
  'DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh'
);

// Token Program IDs
export const TOKEN_PROGRAM_ID = new PublicKey(
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
);

export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
);

// Seeds for PDAs
export const SEEDS = {
  CONFIG: Buffer.from('config'),
  USER_STATE: Buffer.from('user_state'),
  USER_BALANCE: Buffer.from('user_balance'),
  VAULT_AUTHORITY: Buffer.from('vault_authority'),
} as const;

// Default values
export const DEFAULT_UPDATE_FREQUENCY_MS = 5000;
export const DEFAULT_TTL_SECONDS = 300; // 5 minutes

// Transaction limits
export const MAX_BATCH_TRANSFER_RECIPIENTS = 15;
export const MAX_MINTS_PER_DELEGATION = 10;

// RPC Endpoints
export const RPC_ENDPOINTS = {
  LOCALNET: 'http://127.0.0.1:8899',
  DEVNET: 'https://api.devnet.solana.com',
  MAINNET: 'https://api.mainnet-beta.solana.com',
} as const;

/**
 * Get the program ID from environment or use default
 * Priority: process.env -> default devnet/localnet value
 */
export function getProgramId(): PublicKey {
  const envProgramId = 
    typeof process !== 'undefined' ? 
    (process.env.REACT_APP_SABLE_PROGRAM_ID || 
     process.env.NEXT_PUBLIC_SABLE_PROGRAM_ID) : 
    undefined;
  
  const programIdStr = envProgramId || 'SABLE_PROGRAM_ID_TBD';
  return new PublicKey(programIdStr);
}
