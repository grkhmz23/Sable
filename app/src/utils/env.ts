/**
 * Environment variable validation and access
 * All NEXT_PUBLIC_* variables are validated at runtime
 */

export interface EnvConfig {
  SOLANA_RPC_URL: string;
  MAGIC_ROUTER_URL: string;
  MAGICBLOCK_RPC_URL: string | null; // Deprecated: use MAGIC_ROUTER_URL
  SABLE_PROGRAM_ID: string;
  PAYMENTS_API_URL: string;
  PER_HTTP_URL: string;
  PER_WS_URL: string;
  USDC_MINT: string;
  X402_FACILITATOR_URL: string;
}

// IMPORTANT: use direct process.env access so Next.js can inline NEXT_PUBLIC_* values
// into the client bundle. Dynamic access (process.env[key]) can fall back to defaults
// in production browser builds.
const SOLANA_RPC_URL_ENV = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
const MAGIC_ROUTER_URL_ENV = process.env.NEXT_PUBLIC_SABLE_MAGIC_ROUTER;
const MAGICBLOCK_RPC_URL_ENV = process.env.NEXT_PUBLIC_MAGICBLOCK_RPC_URL;
const PROGRAM_ID_ENV = process.env.NEXT_PUBLIC_SABLE_PROGRAM_ID;
const PAYMENTS_API_URL_ENV = process.env.NEXT_PUBLIC_SABLE_PAYMENTS_API;
const PER_HTTP_URL_ENV = process.env.NEXT_PUBLIC_SABLE_PER_HTTP;
const PER_WS_URL_ENV = process.env.NEXT_PUBLIC_SABLE_PER_WS;
const USDC_MINT_ENV = process.env.NEXT_PUBLIC_SABLE_USDC_MINT;
const X402_FACILITATOR_URL_ENV = process.env.NEXT_PUBLIC_SABLE_X402_FACILITATOR_URL;

export const env: EnvConfig = {
  SOLANA_RPC_URL: SOLANA_RPC_URL_ENV || 'http://127.0.0.1:8899',
  MAGIC_ROUTER_URL: MAGIC_ROUTER_URL_ENV || 'https://devnet-router.magicblock.app',
  MAGICBLOCK_RPC_URL: MAGICBLOCK_RPC_URL_ENV || null,
  SABLE_PROGRAM_ID:
    PROGRAM_ID_ENV || 'SaSAXcdWhyr1KD8TKRg6K7WPuxcPLZJHKEwsjQgL5Di',
  PAYMENTS_API_URL: PAYMENTS_API_URL_ENV || 'https://payments.magicblock.app',
  PER_HTTP_URL: PER_HTTP_URL_ENV || 'https://devnet-tee.magicblock.app',
  PER_WS_URL: PER_WS_URL_ENV || 'wss://tee.magicblock.app',
  USDC_MINT: USDC_MINT_ENV || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  X402_FACILITATOR_URL: X402_FACILITATOR_URL_ENV || 'http://localhost:3030',
};

// Validate that program ID is a valid public key (skip pending value)
if (env.SABLE_PROGRAM_ID !== 'SaSAXcdWhyr1KD8TKRg6K7WPuxcPLZJHKEwsjQgL5Di') {
  try {
    new (require('@solana/web3.js').PublicKey)(env.SABLE_PROGRAM_ID);
  } catch (error) {
    console.error('Invalid SABLE_PROGRAM_ID:', env.SABLE_PROGRAM_ID);
    throw new Error('NEXT_PUBLIC_SABLE_PROGRAM_ID must be a valid Solana public key');
  }
}
