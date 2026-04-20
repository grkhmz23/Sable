/**
 * Sable x402 Client
 *
 * Agent-side client for the x402 HTTP payment protocol.
 * Automatically handles 402 Payment Required responses by building
 * signed Sable agent_transfer transactions and retrying with the
 * X-PAYMENT header.
 *
 * Protocol spec:
 *   https://www.x402.org
 *   https://docs.g402.ai/docs/api/response-format
 */

import { PublicKey, Transaction, SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import type { SableClient } from '@sable/sdk';

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

export interface X402ClientConfig {
  sableClient: SableClient;
  agent: PublicKey;
  /** Default recipient kind when not specified */
  defaultRecipientKind?: 'user' | 'agent';
}

export class X402Client {
  private sableClient: SableClient;
  private agent: PublicKey;
  private defaultRecipientKind: 'user' | 'agent';

  constructor(config: X402ClientConfig) {
    this.sableClient = config.sableClient;
    this.agent = config.agent;
    this.defaultRecipientKind = config.defaultRecipientKind || 'user';
  }

  /**
   * Parse a 402 response body into PaymentRequirements.
   */
  parseRequirements(body: unknown): PaymentRequirements {
    const req = body as PaymentRequirements;
    if (!req || typeof req.x402Version !== 'number' || !Array.isArray(req.accepts)) {
      throw new Error('Invalid x402 payment requirements');
    }
    return req;
  }

  /**
   * Build a PaymentPayload (X-PAYMENT header content) from payment requirements.
   * This constructs and signs a Sable agent_transfer transaction.
   */
  async buildPaymentPayload(
    requirements: PaymentRequirements,
    optionIndex = 0
  ): Promise<PaymentPayload> {
    const option = requirements.accepts[optionIndex];
    if (!option) {
      throw new Error('No payment option available at index ' + optionIndex);
    }

    const amount = new BN(option.maxAmountRequired);
    const mint = new PublicKey(option.asset);
    const receiver = new PublicKey(option.payTo);

    // Build the agent_transfer transaction using Sable SDK
    const tx = await this.sableClient.program.methods
      .agentTransfer(
        amount,
        receiver,
        this.defaultRecipientKind === 'user' ? { user: {} } : { agent: {} }
      )
      .accounts({
        agentOwner: this.sableClient.walletPublicKey!,
        agent: this.agent,
        agentBalance: this.sableClient.pda.deriveAgentBalance(this.agent, mint)[0],
        agentCounters: this.sableClient.pda.deriveAgentCounters(this.agent)[0],
        dest:
          this.defaultRecipientKind === 'user'
            ? this.sableClient.pda.deriveUserBalance(receiver, mint)[0]
            : this.sableClient.pda.deriveAgentBalance(receiver, mint)[0],
        mint,
        clock: SYSVAR_CLOCK_PUBKEY,
      })
      .transaction();

    // Add recent blockhash and fee payer
    const { blockhash } = await this.sableClient.config.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = this.sableClient.walletPublicKey!;

    // Sign with the agent owner wallet
    const signed = await this.sableClient.config.wallet!.signTransaction(tx);

    return {
      x402Version: requirements.x402Version,
      scheme: option.scheme,
      network: option.network,
      serializedTransaction: signed.serialize().toString('base64'),
    };
  }

  /**
   * Encode a PaymentPayload into the X-PAYMENT header string.
   */
  encodeHeader(payload: PaymentPayload): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  /**
   * Convenience method: fetch a URL with automatic x402 payment handling.
   *
   * 1. Makes the request.
   * 2. If 402, parses requirements, builds payment, retries.
   * 3. Returns the final response.
   */
  async fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const first = await fetch(input, init);

    if (first.status !== 402) {
      return first;
    }

    const body = await first.json();
    const requirements = this.parseRequirements(body);
    const payload = await this.buildPaymentPayload(requirements);
    const header = this.encodeHeader(payload);

    const retryInit: RequestInit = {
      ...init,
      headers: {
        ...(init?.headers || {}),
        'X-PAYMENT': header,
      },
    };

    return fetch(input, retryInit);
  }
}
