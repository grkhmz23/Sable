export const env = {
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || 'http://127.0.0.1:8899',
  SABLE_PROGRAM_ID: process.env.SABLE_PROGRAM_ID || 'SaSAXcdWhyr1KD8TKRg6K7WPuxcPLZJHKEwsjQgL5Di',
  SABLE_PRIVATE_PAYMENTS_API_URL: process.env.SABLE_PRIVATE_PAYMENTS_API_URL || 'http://localhost:4444',
  SABLE_PER_MOCK_URL: process.env.SABLE_PER_MOCK_URL || 'http://localhost:3333',
  SABLE_X402_FACILITATOR_URL: process.env.SABLE_X402_FACILITATOR_URL || 'http://localhost:5555',
};
