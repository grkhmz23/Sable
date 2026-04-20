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
import nacl from 'tweetnacl';

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

export interface SessionEventMap {
  expire: [];
  refresh: [SableSession];
  close: [];
}

export type SessionEventCallback<K extends keyof SessionEventMap> = (
  ...args: SessionEventMap[K]
) => void;

type AnySessionEventCallback = SessionEventCallback<keyof SessionEventMap>;

export class SableSession {
  /** Ephemeral session keypair issued by PER middleware */
  sessionKey: Keypair;
  /** Session expiry timestamp (unix seconds) */
  expiry: number;
  /** PER middleware HTTP endpoint URL */
  perEndpoint: string;
  /** PER middleware WebSocket endpoint URL (optional) */
  perWsEndpoint?: string;

  private eventListeners: Partial<Record<keyof SessionEventMap, Set<AnySessionEventCallback>>> = {};
  private closed = false;

  constructor(
    sessionKey: Keypair,
    expiry: number,
    perEndpoint: string,
    perWsEndpoint?: string
  ) {
    this.sessionKey = sessionKey;
    this.expiry = expiry;
    this.perEndpoint = perEndpoint;
    this.perWsEndpoint = perWsEndpoint;
  }

  /** Check if the session is expired */
  get isExpired(): boolean {
    return this.closed || Math.floor(Date.now() / 1000) >= this.expiry;
  }

  /** Time remaining in seconds (0 if expired) */
  get timeRemaining(): number {
    const remaining = this.expiry - Math.floor(Date.now() / 1000);
    return Math.max(0, remaining);
  }

  private emit<K extends keyof SessionEventMap>(event: K, ...args: SessionEventMap[K]) {
    const listeners = this.eventListeners[event] as Set<AnySessionEventCallback> | undefined;
    listeners?.forEach((cb) => {
      try {
        (cb as SessionEventCallback<K>)(...args);
      } catch {
        // ignore listener errors
      }
    });
  }

  on<K extends keyof SessionEventMap>(event: K, callback: SessionEventCallback<K>): () => void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = new Set();
    }
    (this.eventListeners[event] as Set<AnySessionEventCallback>).add(callback as AnySessionEventCallback);
    return () => {
      (this.eventListeners[event] as Set<AnySessionEventCallback>).delete(callback as AnySessionEventCallback);
    };
  }

  off<K extends keyof SessionEventMap>(event: K, callback: SessionEventCallback<K>): void {
    (this.eventListeners[event] as Set<AnySessionEventCallback> | undefined)?.delete(callback as AnySessionEventCallback);
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
      const err = (await challengeRes.json().catch(() => ({}))) as any;
      throw new UnauthorizedError(
        `Challenge failed: ${err.error || challengeRes.statusText}`
      );
    }
    const { challenge } = (await challengeRes.json()) as any;

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
      const err = (await sessionRes.json().catch(() => ({}))) as any;
      throw new UnauthorizedError(
        `Session creation failed: ${err.error || sessionRes.statusText}`
      );
    }

    const {
      sessionPubkey,
      sessionSecret,
      expiry,
      wsEndpoint,
    }: {
      sessionPubkey: string;
      sessionSecret: string;
      expiry: number;
      wsEndpoint?: string;
    } = (await sessionRes.json()) as any;

    const secretBytes = Buffer.from(sessionSecret, 'base64');
    const sessionKey = Keypair.fromSecretKey(secretBytes);

    // Verify the server returned the correct pubkey
    if (sessionKey.publicKey.toBase58() !== sessionPubkey) {
      throw new UnauthorizedError('Session pubkey mismatch from middleware');
    }

    return new SableSession(sessionKey, expiry, perRpcUrl, wsEndpoint);
  }

  /**
   * Refresh the session before it expires.
   * Proactively exchanges the current session for a new one with extended TTL.
   * Emits 'refresh' event on success, 'expire' on failure.
   */
  async refresh(signer: SessionSigner, ttlSeconds = 3600): Promise<SableSession> {
    if (this.closed) {
      throw new SessionExpiredError('Session has been closed');
    }

    try {
      const fresh = await SableSession.openSession({
        signer,
        perRpcUrl: this.perEndpoint,
        ttlSeconds,
      });

      // Copy WS endpoint if server didn't return a new one
      if (!fresh.perWsEndpoint && this.perWsEndpoint) {
        fresh.perWsEndpoint = this.perWsEndpoint;
      }

      // Wipe old key
      this.sessionKey.secretKey.fill(0);

      // Update self in-place so existing references stay valid
      this.sessionKey = fresh.sessionKey;
      this.expiry = fresh.expiry;
      this.perWsEndpoint = fresh.perWsEndpoint;
      this.closed = false;

      this.emit('refresh', this);
      return this;
    } catch (err) {
      this.emit('expire');
      throw err;
    }
  }

  /**
   * Sign data with the session key using Ed25519.
   */
  private sign(data: Uint8Array): Uint8Array {
    return nacl.sign.detached(data, this.sessionKey.secretKey);
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
    const signature = Buffer.from(this.sign(balancePda.toBytes())).toString('base64');

    const res = await fetch(
      `${this.perEndpoint}/balance?account=${encodeURIComponent(account)}&session=${encodeURIComponent(session)}&signature=${encodeURIComponent(signature)}`
    );

    if (res.status === 401) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new UnauthorizedError(err.error || 'Unauthorized');
    }
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(`Balance read failed: ${err.error || res.statusText}`);
    }

    const { balance }: { balance: string } = (await res.json()) as any;
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
   * Build the WebSocket URL for streaming PER reads.
   * If the server provided a wsEndpoint during session creation, uses that.
   * Otherwise derives from the HTTP endpoint.
   */
  getWebSocketUrl(token?: string): string {
    let base = this.perWsEndpoint;
    if (!base) {
      // Derive WS from HTTP endpoint (replace http/https with ws/wss)
      base = this.perEndpoint.replace(/^http/, 'ws');
    }
    if (token) {
      const sep = base.includes('?') ? '&' : '?';
      return `${base}${sep}token=${encodeURIComponent(token)}`;
    }
    return base;
  }

  /**
   * Close the session client-side and notify the server.
   * After calling close(), all reads will throw SessionExpiredError.
   */
  async close(): Promise<void> {
    if (this.closed) return;

    // Notify server (best-effort)
    try {
      await fetch(`${this.perEndpoint}/session`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: this.sessionKey.publicKey.toBase58(),
        }),
      });
    } catch {
      // Server may not support DELETE /session; ignore
    }

    // Overwrite secret key bytes in memory
    this.sessionKey.secretKey.fill(0);
    this.expiry = 0;
    this.closed = true;
    this.emit('close');
  }
}
