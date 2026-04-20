/**
 * Amount formatting utilities for Solana SPL tokens.
 *
 * Different mints have different decimal places:
 * - USDC: 6 decimals
 * - wSOL: 9 decimals
 * - Most SPL tokens: 6 or 9 decimals
 */

export const DECIMALS_USDC = 6;
export const DECIMALS_WSOL = 9;
export const DEFAULT_DECIMALS = 6;

/**
 * Parse a human-readable amount string into base units (lamports).
 * e.g. parseAmount("1.5", 6) → 1500000
 */
export function parseAmount(amount: string, decimals: number = DEFAULT_DECIMALS): bigint {
  const trimmed = amount.trim();
  if (!trimmed || isNaN(Number(trimmed))) {
    throw new Error(`Invalid amount: ${amount}`);
  }

  const [whole, fraction = ''] = trimmed.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  const value = BigInt(whole.replace(/^0+/, '') || '0') * BigInt(10 ** decimals) + BigInt(paddedFraction);
  return value;
}

/**
 * Format base units (lamports) into a human-readable string.
 * e.g. formatAmount(1500000n, 6) → "1.5"
 */
export function formatAmount(lamports: bigint, decimals: number = DEFAULT_DECIMALS): string {
  const divisor = BigInt(10 ** decimals);
  const whole = (lamports / divisor).toString();
  const fraction = (lamports % divisor).toString().padStart(decimals, '0');
  const trimmedFraction = fraction.replace(/0+$/, '');
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
}

/**
 * Format a base-unit amount with a symbol suffix.
 * e.g. formatAmountWithSymbol(1500000n, 6, 'USDC') → "1.5 USDC"
 */
export function formatAmountWithSymbol(
  lamports: bigint,
  decimals: number = DEFAULT_DECIMALS,
  symbol: string = ''
): string {
  const formatted = formatAmount(lamports, decimals);
  return symbol ? `${formatted} ${symbol}` : formatted;
}

/**
 * Guess decimal places for a known mint.
 */
export function getDecimalsForMint(mintAddress: string): number {
  // wSOL
  if (mintAddress === 'So11111111111111111111111111111111111111112') {
    return DECIMALS_WSOL;
  }
  // Devnet / mainnet USDC
  if (
    mintAddress === '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' ||
    mintAddress === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  ) {
    return DECIMALS_USDC;
  }
  return DEFAULT_DECIMALS;
}
