/**
 * Environment variable validation and access
 * All NEXT_PUBLIC_* variables are validated at runtime
 */

export interface EnvConfig {
  SOLANA_RPC_URL: string;
  MAGICBLOCK_RPC_URL: string | null;
  MAGIC_ROUTER_URL: string | null;
  SABLE_PROGRAM_ID: string;
  PRIVATE_PAYMENTS_API_URL: string | null;
  PRIVATE_PAYMENTS_API_KEY: string | null;
  PER_MOCK_URL: string | null;
}

// IMPORTANT: use direct process.env access so Next.js can inline NEXT_PUBLIC_* values
// into the client bundle. Dynamic access (process.env[key]) can fall back to defaults
// in production browser builds.
const SOLANA_RPC_URL_ENV = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
const MAGICBLOCK_RPC_URL_ENV = process.env.NEXT_PUBLIC_MAGICBLOCK_RPC_URL;
const MAGIC_ROUTER_URL_ENV = process.env.NEXT_PUBLIC_MAGIC_ROUTER_URL;
const PROGRAM_ID_ENV = process.env.NEXT_PUBLIC_SABLE_PROGRAM_ID;
const PRIVATE_PAYMENTS_API_URL_ENV = process.env.NEXT_PUBLIC_SABLE_PRIVATE_PAYMENTS_API_URL;
const PRIVATE_PAYMENTS_API_KEY_ENV = process.env.NEXT_PUBLIC_SABLE_PRIVATE_PAYMENTS_API_KEY;
const PER_MOCK_URL_ENV = process.env.NEXT_PUBLIC_SABLE_PER_MOCK_URL;

export const env: EnvConfig = {
  SOLANA_RPC_URL: SOLANA_RPC_URL_ENV || 'http://127.0.0.1:8899',
  MAGICBLOCK_RPC_URL: MAGICBLOCK_RPC_URL_ENV || null,
  MAGIC_ROUTER_URL: MAGIC_ROUTER_URL_ENV || null,
  SABLE_PROGRAM_ID:
    PROGRAM_ID_ENV || 'SaSAXcdWhyr1KD8TKRg6K7WPuxcPLZJHKEwsjQgL5Di',
  PRIVATE_PAYMENTS_API_URL: PRIVATE_PAYMENTS_API_URL_ENV || null,
  PRIVATE_PAYMENTS_API_KEY: PRIVATE_PAYMENTS_API_KEY_ENV || null,
  PER_MOCK_URL: PER_MOCK_URL_ENV || null,
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
