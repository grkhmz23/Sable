/**
 * Sable Private Payments API Adapter
 *
 * HTTP client against MagicBlock's hosted Private Payments API.
 * Builds unsigned SPL token transactions for deposits, transfers, withdrawals,
 * and mint initialization across Solana and MagicBlock ephemeral rollups.
 *
 * Schema modeled from:
 *   https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/api-reference/per/introduction
 *   Response format documented at payments.magicblock.app/reference
 *
 * In a real deployment, the Private Payments API is hosted by MagicBlock.
 * For local development, use the mock server in services/payments-api-mock/.
 */

import {
  PublicKey,
  Transaction,
  VersionedTransaction,
  Connection,
  TransactionSignature,
} from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

export class AmlRejectedError extends Error {
  constructor(public reason: string) {
    super(`AML screening rejected: ${reason}`);
    this.name = 'AmlRejectedError';
  }
}

export class PaymentsApiError extends Error {
  constructor(public status: number, message: string) {
    super(`Payments API error (${status}): ${message}`);
    this.name = 'PaymentsApiError';
  }
}

export interface UnsignedTransactionPayload {
  kind: 'deposit' | 'transfer' | 'withdraw' | 'initMint';
  version: 'legacy' | 'v0';
  transactionBase64: string;
  sendTo: 'base' | 'ephemeral';
  recentBlockhash: string;
  lastValidBlockHeight: number;
  instructionCount: number;
  requiredSigners: string[];
}

export interface SablePaymentsConfig {
  apiUrl: string;
  apiKey?: string;
  /** Optional Magic Router connection for routing ephemeral transactions */
  routerConnection?: Connection;
}

export interface PaymentTransaction {
  /** The deserialized Solana transaction (legacy or versioned) */
  tx: Transaction | VersionedTransaction;
  /** The raw payload from the Private Payments API */
  payload: UnsignedTransactionPayload;
}

export interface PaymentSubmissionResult {
  signature: TransactionSignature;
  sendTo: 'base' | 'ephemeral';
}

export class SablePayments {
  private apiUrl: string;
  private apiKey?: string;
  private routerConnection?: Connection;

  constructor(config: SablePaymentsConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.routerConnection = config.routerConnection;
  }

  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.apiKey ? { 'X-API-Key': this.apiKey } : {}),
      ...((options.headers as Record<string, string>) || {}),
    };

    const res = await fetch(`${this.apiUrl}${path}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as any;
      throw new PaymentsApiError(res.status, body.error || res.statusText);
    }

    return res.json();
  }

  /**
   * Deserialize an unsigned transaction payload into a Solana Transaction.
   * Supports both legacy and versioned (v0) transactions.
   */
  private deserializeTx(payload: UnsignedTransactionPayload): Transaction | VersionedTransaction {
    const txBytes = Buffer.from(payload.transactionBase64, 'base64');

    if (payload.version === 'v0') {
      return VersionedTransaction.deserialize(txBytes);
    }

    return Transaction.from(txBytes);
  }

  /**
   * Submit a signed payment transaction to the correct destination.
   *
   * - If `payload.sendTo === 'ephemeral'` and a router connection is configured,
   *   submits via the Magic Router.
   * - Otherwise submits via the provided base connection.
   */
  async submit(
    signedTx: Transaction | VersionedTransaction,
    payload: UnsignedTransactionPayload,
    baseConnection: Connection
  ): Promise<PaymentSubmissionResult> {
    const rawTx = signedTx.serialize();
    const isEphemeral = payload.sendTo === 'ephemeral';
    const connection = isEphemeral && this.routerConnection ? this.routerConnection : baseConnection;

    const signature = await connection.sendRawTransaction(rawTx, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    // Confirm using the payload's block info
    await connection.confirmTransaction(
      {
        signature,
        blockhash: payload.recentBlockhash,
        lastValidBlockHeight: payload.lastValidBlockHeight,
      },
      'confirmed'
    );

    return { signature, sendTo: payload.sendTo };
  }

  /**
   * Build an unsigned deposit transaction from Solana base layer into an ephemeral rollup.
   * Returns both the deserialized transaction and the raw payload for routing.
   */
  async buildDepositPayload({
    from,
    amount,
    mint,
  }: {
    from: PublicKey;
    amount: BN;
    mint?: PublicKey;
  }): Promise<PaymentTransaction> {
    const payload: UnsignedTransactionPayload = await this.request('/deposit', {
      method: 'POST',
      body: JSON.stringify({
        from: from.toBase58(),
        amount: amount.toString(),
        mint: mint?.toBase58(),
      }),
    });
    return { tx: this.deserializeTx(payload), payload };
  }

  /**
   * Build an unsigned deposit transaction (legacy API — returns Transaction only).
   * Use `buildDepositPayload` if you need routing info.
   */
  async buildDeposit({
    from,
    amount,
    mint,
  }: {
    from: PublicKey;
    amount: BN;
    mint?: PublicKey;
  }): Promise<Transaction> {
    const { tx } = await this.buildDepositPayload({ from, amount, mint });
    if (tx instanceof VersionedTransaction) {
      throw new PaymentsApiError(
        500,
        'Versioned transactions (v0) are not supported by this legacy API. Use buildDepositPayload instead.'
      );
    }
    return tx;
  }

  /**
   * Build an unsigned SPL transfer transaction.
   */
  async buildTransferPayload({
    from,
    to,
    amount,
    mint,
  }: {
    from: PublicKey;
    to: PublicKey;
    amount: BN;
    mint?: PublicKey;
  }): Promise<PaymentTransaction> {
    const payload: UnsignedTransactionPayload = await this.request('/transfer', {
      method: 'POST',
      body: JSON.stringify({
        from: from.toBase58(),
        to: to.toBase58(),
        amount: amount.toString(),
        mint: mint?.toBase58(),
      }),
    });
    return { tx: this.deserializeTx(payload), payload };
  }

  /**
   * Build an unsigned SPL transfer transaction (legacy API).
   */
  async buildTransfer({
    from,
    to,
    amount,
    mint,
  }: {
    from: PublicKey;
    to: PublicKey;
    amount: BN;
    mint?: PublicKey;
  }): Promise<Transaction> {
    const { tx } = await this.buildTransferPayload({ from, to, amount, mint });
    if (tx instanceof VersionedTransaction) {
      throw new PaymentsApiError(500, 'Versioned transactions (v0) not supported by legacy API');
    }
    return tx;
  }

  /**
   * Build an unsigned withdrawal transaction back to Solana base layer.
   */
  async buildWithdrawPayload({
    from,
    to,
    amount,
    mint,
  }: {
    from: PublicKey;
    to: PublicKey;
    amount: BN;
    mint?: PublicKey;
  }): Promise<PaymentTransaction> {
    const payload: UnsignedTransactionPayload = await this.request('/withdraw', {
      method: 'POST',
      body: JSON.stringify({
        from: from.toBase58(),
        to: to.toBase58(),
        amount: amount.toString(),
        mint: mint?.toBase58(),
      }),
    });
    return { tx: this.deserializeTx(payload), payload };
  }

  /**
   * Build an unsigned withdrawal transaction (legacy API).
   */
  async buildWithdraw({
    from,
    to,
    amount,
    mint,
  }: {
    from: PublicKey;
    to: PublicKey;
    amount: BN;
    mint?: PublicKey;
  }): Promise<Transaction> {
    const { tx } = await this.buildWithdrawPayload({ from, to, amount, mint });
    if (tx instanceof VersionedTransaction) {
      throw new PaymentsApiError(500, 'Versioned transactions (v0) not supported by legacy API');
    }
    return tx;
  }

  /**
   * Get the base-chain SPL token balance for an address.
   */
  async getBalance({
    owner,
    mint,
  }: {
    owner: PublicKey;
    mint?: PublicKey;
  }): Promise<BN> {
    const params = new URLSearchParams();
    params.append('owner', owner.toBase58());
    if (mint) params.append('mint', mint.toBase58());

    const { balance }: { balance: string } = await this.request(`/balance?${params.toString()}`);
    return new BN(balance);
  }

  /**
   * Check whether a mint has a validator-scoped transfer queue on the ephemeral RPC.
   */
  async getMintInitStatus({ mint }: { mint: PublicKey }): Promise<boolean> {
    const { initialized }: { initialized: boolean } = await this.request(
      `/mint-init-status?mint=${mint.toBase58()}`
    );
    return initialized;
  }

  /**
   * Build an unsigned transaction that initializes a validator-scoped transfer queue for a mint.
   */
  async initMintPayload({ mint }: { mint: PublicKey }): Promise<PaymentTransaction> {
    const payload: UnsignedTransactionPayload = await this.request('/init-mint', {
      method: 'POST',
      body: JSON.stringify({
        mint: mint.toBase58(),
      }),
    });
    return { tx: this.deserializeTx(payload), payload };
  }

  /**
   * Build an unsigned init-mint transaction (legacy API).
   */
  async initMint({ mint }: { mint: PublicKey }): Promise<Transaction> {
    const { tx } = await this.initMintPayload({ mint });
    if (tx instanceof VersionedTransaction) {
      throw new PaymentsApiError(500, 'Versioned transactions (v0) not supported by legacy API');
    }
    return tx;
  }

  /**
   * AML / compliance screening.
   */
  aml = {
    screen: async ({ address }: { address: string }): Promise<{ ok: boolean; reason?: string }> => {
      const { ok, reason }: { ok: boolean; reason?: string } = await this.request('/aml-screen', {
        method: 'POST',
        body: JSON.stringify({ address }),
      });

      if (!ok) {
        throw new AmlRejectedError(reason || 'Address blocked by compliance screening');
      }

      return { ok, reason };
    },
  };
}
