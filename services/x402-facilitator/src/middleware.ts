/**
 * Sable x402 Express Middleware
 *
 * Drop-in middleware for merchants using Express:
 *
 *   app.use(sableX402({ price, receiver, asset, network }));
 *
 * When a request arrives without an X-PAYMENT header, responds with
 * HTTP 402 and payment requirements. When X-PAYMENT is present,
 * verifies and settles via the internal SableAdapter before allowing
 * the request to proceed.
 *
 * Protocol spec:
 *   https://www.x402.org
 *   https://docs.g402.ai/docs/api/response-format
 */

import type { Request, Response, NextFunction } from 'express';
import { PublicKey } from '@solana/web3.js';
import { encodePaymentRequirements, decodePaymentHeader } from './protocol';
import { SableAdapter } from './sable-adapter';

export interface SableX402Options {
  /** Price in token base units (e.g., 10000 for 0.01 USDC with 6 decimals) */
  price: string;
  /** Receiver pubkey (merchant's UserState or AgentState) */
  receiver: PublicKey;
  /** Token mint (default: USDC devnet) */
  asset?: PublicKey;
  /** Network identifier */
  network?: string;
  /** Optional external facilitator URL. If omitted, uses internal SableAdapter. */
  facilitatorUrl?: string;
  /** Solana RPC connection (required if using internal adapter) */
  solanaRpcUrl?: string;
}

export function sableX402(options: SableX402Options) {
  const asset = options.asset || new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
  const network = options.network || 'solana:devnet';
  const resource = 'unknown';

  // Create internal adapter if no external facilitator is specified
  let adapter: SableAdapter | undefined;
  if (!options.facilitatorUrl && options.solanaRpcUrl) {
    const { Connection } = require('@solana/web3.js');
    const connection = new Connection(options.solanaRpcUrl, 'confirmed');
    adapter = new SableAdapter({
      connection,
      expectedReceiver: options.receiver,
      expectedMint: asset,
    });
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    const xPayment = req.headers['x-payment'] as string | undefined;

    // No payment header → return 402 with requirements
    if (!xPayment) {
      const requirements = encodePaymentRequirements(
        options.price,
        options.receiver,
        asset,
        `${req.protocol}://${req.get('host')}${req.originalUrl}`,
        network
      );
      res.status(402).json(requirements);
      return;
    }

    // Payment header present → verify (and optionally settle)
    try {
      let verifyResult: { valid: boolean; reason?: string };

      if (adapter) {
        const payload = decodePaymentHeader(xPayment);
        const result = await adapter.verify(payload);
        verifyResult = { valid: result.valid, reason: result.reason };

        if (result.valid) {
          // Settle synchronously before serving content
          const settleResult = await adapter.settle(payload);
          if (!settleResult.settled) {
            res.status(402).json({ error: settleResult.error || 'Settlement failed' });
            return;
          }
          // Attach settlement info to request for the handler
          (req as any).x402Settlement = settleResult;
        }
      } else if (options.facilitatorUrl) {
        const verifyRes = await fetch(`${options.facilitatorUrl}/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ header: xPayment }),
        });
        verifyResult = (await verifyRes.json()) as any;

        if (verifyResult.valid) {
          const settleRes = await fetch(`${options.facilitatorUrl}/settle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ header: xPayment }),
          });
          const settleResult = (await settleRes.json()) as any;
          if (!settleResult.settled) {
            res.status(402).json({ error: settleResult.error || 'Settlement failed' });
            return;
          }
          (req as any).x402Settlement = settleResult;
        }
      } else {
        res.status(500).json({ error: 'No facilitator configured' });
        return;
      }

      if (!verifyResult.valid) {
        res.status(401).json({ error: verifyResult.reason || 'Invalid payment' });
        return;
      }

      next();
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  };
}
