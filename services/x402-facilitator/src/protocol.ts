/**
 * x402 Protocol Implementation
 *
 * Encode/decode x402 headers exactly per the spec.
 *
 * Spec references:
 *   https://www.x402.org
 *   https://docs.g402.ai/docs/api/response-format
 */

import { PublicKey } from '@solana/web3.js';

export interface PaymentRequirements {
  x402Version: number;
  error?: string;
  accepts: PaymentOption[];
}

export interface PaymentOption {
  scheme: 'exact';
  network: string;
  maxAmountRequired: string;
  asset: string;
  payTo: string;
  resource: string;
  description?: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
  extra?: Record<string, any>;
}

export interface PaymentPayload {
  x402Version: number;
  scheme: 'exact';
  network: string;
  serializedTransaction: string;
}

/**
 * Decode an X-PAYMENT header string into a PaymentPayload.
 */
export function decodePaymentHeader(header: string): PaymentPayload {
  const json = Buffer.from(header, 'base64').toString('utf8');
  const payload = JSON.parse(json) as PaymentPayload;

  if (typeof payload.x402Version !== 'number') {
    throw new Error('Invalid x402 payload: missing x402Version');
  }
  if (payload.scheme !== 'exact') {
    throw new Error('Invalid x402 payload: unsupported scheme ' + payload.scheme);
  }
  if (!payload.serializedTransaction) {
    throw new Error('Invalid x402 payload: missing serializedTransaction');
  }

  return payload;
}

/**
 * Encode payment requirements into a 402 response body.
 */
export function encodePaymentRequirements(
  price: string,
  receiver: PublicKey,
  asset: PublicKey,
  resource: string,
  network = 'solana:devnet'
): PaymentRequirements {
  return {
    x402Version: 1,
    error: 'X-PAYMENT header is required',
    accepts: [
      {
        scheme: 'exact',
        network,
        maxAmountRequired: price,
        asset: asset.toBase58(),
        payTo: receiver.toBase58(),
        resource,
        description: 'Sable agent payment',
        mimeType: 'application/json',
        maxTimeoutSeconds: 60,
      },
    ],
  };
}
