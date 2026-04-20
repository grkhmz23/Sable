/**
 * Sable x402 Facilitator Service
 *
 * HTTP server with two roles:
 *   POST /verify — validate an incoming X-PAYMENT header
 *   POST /settle — execute the payment on-chain via Sable
 *
 * Protocol spec:
 *   https://www.x402.org
 *   https://docs.g402.ai/docs/api/response-format
 */

import express from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { decodePaymentHeader } from './protocol';
import { SableAdapter } from './sable-adapter';

const PORT = process.env.X402_FACILITATOR_PORT
  ? parseInt(process.env.X402_FACILITATOR_PORT, 10)
  : 5555;

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'http://localhost:8899';
const MAGIC_ROUTER_URL = process.env.MAGIC_ROUTER_URL;
const MIN_PRICE_USDC = process.env.SABLE_X402_MIN_PRICE_USDC || '10000'; // 0.01 USDC with 6 decimals
const DEFAULT_RECEIVER = process.env.SABLE_X402_DEFAULT_RECEIVER;

const connection = new Connection(SOLANA_RPC, 'confirmed');
const routerConnection = MAGIC_ROUTER_URL ? new Connection(MAGIC_ROUTER_URL, 'confirmed') : undefined;

const adapter = new SableAdapter({
  connection,
  routerConnection,
  minPrice: new BN(MIN_PRICE_USDC),
  expectedReceiver: DEFAULT_RECEIVER ? new PublicKey(DEFAULT_RECEIVER) : undefined,
});

const app = express();
app.use(express.json());

// CORS
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PAYMENT');
  next();
});

app.options('*', (_req, res) => {
  res.sendStatus(204);
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', network: SOLANA_RPC });
});

// POST /verify — merchant calls this to validate an incoming X-PAYMENT header
app.post('/verify', async (req, res) => {
  const header = req.body.xPaymentHeader || req.body.header || req.headers['x-payment'];

  if (!header || typeof header !== 'string') {
    res.status(400).json({ valid: false, reason: 'Missing X-PAYMENT header' });
    return;
  }

  try {
    const payload = decodePaymentHeader(header);
    const result = await adapter.verify(payload);
    res.status(result.valid ? 200 : 401).json(result);
  } catch (e: any) {
    res.status(400).json({ valid: false, reason: e.message });
  }
});

// POST /settle — merchant calls this to execute the payment on-chain
app.post('/settle', async (req, res) => {
  const header = req.body.xPaymentHeader || req.body.header || req.headers['x-payment'];

  if (!header || typeof header !== 'string') {
    res.status(400).json({ settled: false, error: 'Missing X-PAYMENT header' });
    return;
  }

  try {
    const payload = decodePaymentHeader(header);
    const result = await adapter.settle(payload);
    res.status(result.settled ? 200 : 402).json(result);
  } catch (e: any) {
    res.status(400).json({ settled: false, error: e.message });
  }
});

// POST /verify-and-settle — convenience endpoint that does both in one call
app.post('/verify-and-settle', async (req, res) => {
  const header = req.body.xPaymentHeader || req.body.header || req.headers['x-payment'];

  if (!header || typeof header !== 'string') {
    res.status(400).json({ settled: false, error: 'Missing X-PAYMENT header' });
    return;
  }

  try {
    const payload = decodePaymentHeader(header);

    const verifyResult = await adapter.verify(payload);
    if (!verifyResult.valid) {
      res.status(401).json({ settled: false, error: verifyResult.reason });
      return;
    }

    const settleResult = await adapter.settle(payload);
    res.status(settleResult.settled ? 200 : 402).json(settleResult);
  } catch (e: any) {
    res.status(400).json({ settled: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Sable x402 Facilitator listening on http://localhost:${PORT}`);
  console.log(`Connected to Solana RPC: ${SOLANA_RPC}`);
  console.log(`Min price (USDC base units): ${MIN_PRICE_USDC}`);
  if (DEFAULT_RECEIVER) {
    console.log(`Default receiver: ${DEFAULT_RECEIVER}`);
  }
});
