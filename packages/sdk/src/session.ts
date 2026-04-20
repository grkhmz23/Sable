/**
 * Sable PER Session Module
 *
 * Implements the openSession flow for reading private balances from PER.
 *
 * Schema modeled from:
 *   https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/api-reference/per/introduction
 *   https://github.com/magicblock-labs/private-payments-demo
 *
 * In a real deployment, the PER middleware is hosted by MagicBlock.
 * For local development, use the mock middleware in services/per-mock-middleware/.
 */

import { Keypair, PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

export class SessionExpiredError extends Error {
  constructor(message = 'PER session expired') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized PER read') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export interface SessionSigner {
  publicKey: PublicKey;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
}

export interface SableSessionConfig {
  signer: SessionSigner;
  perRpcUrl: string;
  ttlSeconds?: number;
}

export class SableSession {
  /** Ephemeral session keypair issued by PER middleware */
  sessionKey: Keypair;
  /** Session expiry timestamp (unix seconds) */
  expiry: number;
  /** PER middleware endpoint URL */
  perEndpoint: string;

  constructor(sessionKey: Keypair, expiry: number, perEndpoint: string) {
    this.sessionKey = sessionKey;
    this.expiry = expiry;
    this.perEndpoint = perEndpoint;
  }

  /** Check if the session is expired */
  get isExpired(): boolean {
    return Math.floor(Date.now() / 1000) >= this.expiry;
  }

  /**
   * Open a new PER session.
   * 1. Ask middleware for a challenge.
   * 2. Sign challenge with wallet.
   * 3. Exchange signed challenge for session keypair.
   */
  static async openSession({
    signer,
    perRpcUrl,
    ttlSeconds = 3600,
  }: SableSessionConfig): Promise<SableSession> {
    const pubkey = signer.publicKey.toBase58();

    // 1. Get challenge
    const challengeRes = await fetch(
      `${perRpcUrl}/challenge?pubkey=${encodeURIComponent(pubkey)}`
    );
    if (!challengeRes.ok) {
      const err = await challengeRes.json().catch(() => ({})) as any;
      throw new UnauthorizedError(
        `Challenge failed: ${err.error || challengeRes.statusText}`
      );
    }
    const { challenge } = await challengeRes.json() as any;

    // 2. Sign challenge
    const challengeBytes = Buffer.from(challenge, 'base64');
    const signature = await signer.signMessage(challengeBytes);

    // 3. Exchange for session
    const sessionRes = await fetch(`${perRpcUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pubkey,
        challenge,
        signature: Buffer.from(signature).toString('base64'),
        ttlSeconds,
      }),
    });

    if (!sessionRes.ok) {
      const err = await sessionRes.json().catch(() => ({})) as any;
      throw new UnauthorizedError(
        `Session creation failed: ${err.error || sessionRes.statusText}`
      );
    }

    const {
      sessionPubkey,
      sessionSecret,
      expiry,
    }: {
      sessionPubkey: string;
      sessionSecret: string;
      expiry: number;
    } = await sessionRes.json() as any;

    const secretBytes = Buffer.from(sessionSecret, 'base64');
    const sessionKey = Keypair.fromSecretKey(secretBytes);

    // Verify the server returned the correct pubkey
    if (sessionKey.publicKey.toBase58() !== sessionPubkey) {
      throw new UnauthorizedError('Session pubkey mismatch from middleware');
    }

    return new SableSession(sessionKey, expiry, perRpcUrl);
  }

  /**
   * Read a balance PDA via PER session.
   * Throws SessionExpiredError if the session has expired.
   * Throws UnauthorizedError if the middleware rejects the read.
   */
  async getBalance(balancePda: PublicKey): Promise<BN> {
    if (this.isExpired) {
      throw new SessionExpiredError();
    }

    const account = balancePda.toBase58();
    const session = this.sessionKey.publicKey.toBase58();

    // Sign account pubkey with session key
    const signature = Buffer.from(
      (this.sessionKey as any).sign(balancePda.toBytes())
    ).toString('base64');

    const res = await fetch(
      `${this.perEndpoint}/balance?account=${encodeURIComponent(account)}&session=${encodeURIComponent(session)}&signature=${encodeURIComponent(signature)}`
    );

    if (res.status === 401) {
      const err = await res.json().catch(() => ({})) as any;
      throw new UnauthorizedError(err.error || 'Unauthorized');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      throw new Error(`Balance read failed: ${err.error || res.statusText}`);
    }

    const { balance }: { balance: string } = await res.json() as any;
    return new BN(balance);
  }

  /**
   * Read an agent balance PDA via PER session.
   * Alias for getBalance — the middleware doesn't distinguish account types.
   */
  async getAgentBalance(agentBalancePda: PublicKey): Promise<BN> {
    return this.getBalance(agentBalancePda);
  }

  /**
   * Close the session (client-side only — memory is cleared).
   * The server-side session still expires naturally.
   */
  close(): void {
    // Overwrite secret key bytes in memory
    this.sessionKey.secretKey.fill(0);
    (this.sessionKey as any)._keypair?.secretKey?.fill(0);
    this.expiry = 0;
  }
}

