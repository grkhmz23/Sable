import { PublicKey } from '@solana/web3.js';

// ─── Sable Program ID ───
export const PROGRAM_ID_DEVNET = new PublicKey(
  'SaSAXcdWhyr1KD8TKRg6K7WPuxcPLZJHKEwsjQgL5Di'
);

// ─── MagicBlock Program IDs ───
export const MAGICBLOCK_DELEGATION_PROGRAM_ID = new PublicKey(
  'DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh'
);

export const PERMISSION_PROGRAM_ID = new PublicKey(
  'ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1'
);

// ─── SPL Program IDs ───
export const TOKEN_PROGRAM_ID = new PublicKey(
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
);

export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
);

// ─── Token Mints ───
export const USDC_MINT_DEVNET = new PublicKey(
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
);

export const USDC_MINT_MAINNET = new PublicKey(
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
);

export const WSOL_MINT = new PublicKey(
  'So11111111111111111111111111111111111111112'
);

// ─── PDA Seeds ───
export const SEEDS = {
  CONFIG: Buffer.from('config'),
  USER_STATE: Buffer.from('user_state'),
  AGENT_STATE: Buffer.from('agent_state'),
  USER_BALANCE: Buffer.from('user_balance'),
  VAULT_AUTHORITY: Buffer.from('vault_authority'),
} as const;

// ─── Default Timing ───
export const DEFAULT_UPDATE_FREQUENCY_MS = 5000;
export const DEFAULT_TTL_SECONDS = 300; // 5 minutes

// ─── Limits ───
export const MAX_BATCH_TRANSFER_RECIPIENTS = 15;
export const MAX_MINTS_PER_DELEGATION = 10;

// ─── MagicBlock Endpoints ───
export const MAGICBLOCK_ENDPOINTS = {
  // Magic Router (primary SDK RPC)
  routerDevnet: 'https://devnet-router.magicblock.app',
  routerMainnet: 'https://router.magicblock.app',

  // Regional ER (use only when a specific region is required)
  erDevnetAsia: 'https://devnet-as.magicblock.app/',
  erDevnetEu: 'https://devnet-eu.magicblock.app/',
  erDevnetUs: 'https://devnet-us.magicblock.app/',
  erDevnetTee: 'https://devnet-tee.magicblock.app/',
  erMainnetAsia: 'https://as.magicblock.app/',
  erMainnetEu: 'https://eu.magicblock.app/',
  erMainnetUs: 'https://us.magicblock.app/',
  erMainnetTee: 'https://mainnet-tee.magicblock.app/',

  // PER WebSocket
  perDevnetHttp: 'https://devnet-tee.magicblock.app',
  perDevnetWs: 'wss://tee.magicblock.app',

  // Private Payments API
  paymentsApi: 'https://payments.magicblock.app',
} as const;

// ─── ER Validator Pubkeys ───
// Identical across mainnet and devnet for the same region
export const ER_VALIDATOR_AS = new PublicKey(
  'MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57'
);
export const ER_VALIDATOR_EU = new PublicKey(
  'MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e'
);
export const ER_VALIDATOR_US = new PublicKey(
  'MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd'
);
export const ER_VALIDATOR_TEE = new PublicKey(
  'MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo'
);

// Sable defaults to TEE validator because the project is privacy-first
export const DEFAULT_ER_VALIDATOR = ER_VALIDATOR_TEE;

// ─── Solana Base Layer Endpoints ───
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

  const programIdStr = envProgramId || PROGRAM_ID_DEVNET.toBase58();
  return new PublicKey(programIdStr);
}
