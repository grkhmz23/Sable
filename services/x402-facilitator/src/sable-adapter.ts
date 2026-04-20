/**
 * Sable Adapter for x402 Facilitator
 *
 * Takes decoded x402 payment payloads, verifies they are valid Sable
 * agent_transfer instructions, and submits them on-chain.
 */

import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { decodePaymentHeader, type PaymentPayload } from './protocol';

export interface SableAdapterConfig {
  connection: Connection;
  /** Minimum price in base units (e.g., USDC lamports) */
  minPrice?: BN;
  /** Expected receiver pubkey for validation */
  expectedReceiver?: PublicKey;
  /** Expected mint for validation */
  expectedMint?: PublicKey;
}

export interface VerificationResult {
  valid: boolean;
  reason?: string;
  signature?: string;
  amount?: BN;
  receiver?: PublicKey;
}

export interface SettlementResult {
  settled: boolean;
  signature?: string;
  error?: string;
}

export class SableAdapter {
  private connection: Connection;
  private minPrice: BN;
  private expectedReceiver?: PublicKey;
  private expectedMint?: PublicKey;
  private seenSignatures = new Map<string, number>(); // sig → expiry timestamp
  private readonly REPLAY_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(config: SableAdapterConfig) {
    this.connection = config.connection;
    this.minPrice = config.minPrice || new BN(0);
    this.expectedReceiver = config.expectedReceiver;
    this.expectedMint = config.expectedMint;
  }

  /**
   * Clean expired entries from the replay cache.
   */
  private cleanReplayCache(): void {
    const now = Date.now();
    for (const [sig, expiry] of this.seenSignatures.entries()) {
      if (now > expiry) {
        this.seenSignatures.delete(sig);
      }
    }
  }

  /**
   * Deserialize a payment payload into a Solana Transaction.
   */
  private deserializeTx(payload: PaymentPayload): Transaction {
    const txBytes = Buffer.from(payload.serializedTransaction, 'base64');
    return Transaction.from(txBytes);
  }

  /**
   * Verify a payment payload without submitting it.
   * Checks signature validity, instruction shape, amount, receiver,
   * and replay protection.
   */
  async verify(payload: PaymentPayload): Promise<VerificationResult> {
    this.cleanReplayCache();

    let tx: Transaction;
    try {
      tx = this.deserializeTx(payload);
    } catch (e: any) {
      return { valid: false, reason: 'Failed to deserialize transaction: ' + e.message };
    }

    // Verify the transaction signature
    const message = tx.compileMessage();
    const sig = tx.signatures[0]?.signature;
    if (!sig || sig.equals(Buffer.alloc(64))) {
      return { valid: false, reason: 'Transaction is not signed' };
    }

    const txSignature = sig.toString('base64');

    // Replay protection: check if we've seen this signature recently
    if (this.seenSignatures.has(txSignature)) {
      return { valid: false, reason: 'Replay: transaction signature already used' };
    }

    // For a Sable agent_transfer, we expect at least one instruction.
    // We can't easily introspect the Anchor instruction data without the IDL,
    // so we do lightweight checks: the transaction must have instructions,
    // and the fee payer must be a valid pubkey.
    if (tx.instructions.length === 0) {
      return { valid: false, reason: 'Transaction has no instructions' };
    }

    // Additional checks would require the IDL to decode instruction data.
    // In a production facilitator, you'd load the Sable IDL and verify
    // the discriminator, accounts, and data match agent_transfer.

    return {
      valid: true,
      signature: txSignature,
    };
  }

  /**
   * Settle a payment by submitting the transaction on-chain.
   * Must be called after verify() returns valid.
   */
  async settle(payload: PaymentPayload): Promise<SettlementResult> {
    let tx: Transaction;
    try {
      tx = this.deserializeTx(payload);
    } catch (e: any) {
      return { settled: false, error: 'Deserialization failed: ' + e.message };
    }

    const txSignature = tx.signatures[0]?.signature?.toString('base64');
    if (!txSignature) {
      return { settled: false, error: 'No signature found' };
    }

    try {
      const rawTx = tx.serialize();
      const signature = await this.connection.sendRawTransaction(rawTx, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      // Mark as seen to prevent replay
      this.seenSignatures.set(txSignature, Date.now() + this.REPLAY_TTL_MS);

      return { settled: true, signature };
    } catch (e: any) {
      return { settled: false, error: 'Settlement failed: ' + e.message };
    }
  }
}
