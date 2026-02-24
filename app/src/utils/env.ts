/**
 * Environment variable validation and access
 * All NEXT_PUBLIC_* variables are validated at runtime
 */

export interface EnvConfig {
  SOLANA_RPC_URL: string;
  MAGICBLOCK_RPC_URL: string | null;
  MAGIC_ROUTER_URL: string | null;
  L2CONCEPTV1_PROGRAM_ID: string;
}

function getEnvVar(key: string, defaultValue?: string): string | null {
  const value = process.env[key];
  if (value) return value;
  if (defaultValue !== undefined) return defaultValue;
  return null;
}

function requireEnvVar(key: string, defaultValue?: string): string {
  const value = getEnvVar(key, defaultValue);
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

export const env: EnvConfig = {
  SOLANA_RPC_URL: requireEnvVar('NEXT_PUBLIC_SOLANA_RPC_URL', 'http://127.0.0.1:8899'),
  MAGICBLOCK_RPC_URL: getEnvVar('NEXT_PUBLIC_MAGICBLOCK_RPC_URL'),
  MAGIC_ROUTER_URL: getEnvVar('NEXT_PUBLIC_MAGIC_ROUTER_URL'),
  L2CONCEPTV1_PROGRAM_ID: requireEnvVar(
    'NEXT_PUBLIC_L2CONCEPTV1_PROGRAM_ID',
    'L2CnccKT1qHNS1wJ7p3wJ3JhCX5s4J5wT5x3h5mH2j1'
  ),
};

// Validate that program ID is a valid public key
try {
  new (require('@solana/web3.js').PublicKey)(env.L2CONCEPTV1_PROGRAM_ID);
} catch (error) {
  console.error('Invalid L2CONCEPTV1_PROGRAM_ID:', env.L2CONCEPTV1_PROGRAM_ID);
  throw new Error('NEXT_PUBLIC_L2CONCEPTV1_PROGRAM_ID must be a valid Solana public key');
}
