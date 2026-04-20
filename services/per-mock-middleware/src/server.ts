/**
 * Mock PER Middleware Service
 *
 * Simulates the MagicBlock PER middleware challenge/auth flow for local development.
 *
 * Endpoints:
 *   GET  /challenge?pubkey=<base58>  → { challenge: string }
 *   POST /session                    → { pubkey, challenge, signature }
 *                                     ← { sessionPubkey, sessionSecret, expiry }
 *   GET  /balance?account=<pda>&session=<pubkey>&signature=<base64>
 *                                     → { balance: string }
 *
 * Modeled after:
 *   https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/api-reference/per/introduction
 *   https://github.com/magicblock-labs/private-payments-demo
 */

import http from 'http';
import { Connection, PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';

const PORT = process.env.PER_MOCK_PORT ? parseInt(process.env.PER_MOCK_PORT, 10) : 3333;
const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'http://localhost:8899';

const connection = new Connection(SOLANA_RPC, 'confirmed');

interface Session {
  sessionPubkey: string; // base58
  sessionSecret: Uint8Array; // 64 bytes — stored server-side for this mock
  ownerPubkey: string; // base58 — the wallet that authenticated
  expiry: number; // unix ms
}

const sessions = new Map<string, Session>(); // key = sessionPubkey base58

function randomChallenge(): string {
  const bytes = new Uint8Array(32);
  (globalThis as any).crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64');
}

function generateKeypair(): { publicKey: Uint8Array; secretKey: Uint8Array } {
  return nacl.sign.keyPair();
}

function parseQuery(url: string): Record<string, string> {
  const query: Record<string, string> = {};
  const idx = url.indexOf('?');
  if (idx === -1) return query;
  const params = new URLSearchParams(url.slice(idx + 1));
  params.forEach((v, k) => {
    query[k] = v;
  });
  return query;
}

async function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, payload: any) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function verifyEd25519(
  message: Uint8Array,
  signature: Uint8Array,
  pubkey: Uint8Array
): boolean {
  try {
    return nacl.sign.detached.verify(message, signature, pubkey);
  } catch {
    return false;
  }
}

function extractBalance(data: Buffer): bigint {
  // Try UserBalance first (amount at offset 73)
  // Then AgentBalance (amount at offset 72)
  // Heuristic: if data length >= 81, try UserBalance; else AgentBalance
  if (data.length >= 81) {
    return data.readBigUInt64LE(73);
  }
  if (data.length >= 80) {
    return data.readBigUInt64LE(72);
  }
  return BigInt(0);
}

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';
  const method = req.method || 'GET';

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (url === '/health' && method === 'GET') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  // GET /challenge?pubkey=<base58>
  if (url.startsWith('/challenge') && method === 'GET') {
    const query = parseQuery(url);
    const pubkey = query.pubkey;
    if (!pubkey) {
      sendJson(res, 400, { error: 'Missing pubkey query param' });
      return;
    }
    try {
      new PublicKey(pubkey); // validate
    } catch {
      sendJson(res, 400, { error: 'Invalid pubkey' });
      return;
    }
    const challenge = randomChallenge();
    sendJson(res, 200, { challenge });
    return;
  }

  // POST /session
  if (url === '/session' && method === 'POST') {
    const body = await readBody(req);
    const { pubkey, challenge, signature } = body;

    if (!pubkey || !challenge || !signature) {
      sendJson(res, 400, { error: 'Missing pubkey, challenge, or signature' });
      return;
    }

    let ownerPubkeyBytes: Uint8Array;
    try {
      ownerPubkeyBytes = new PublicKey(pubkey).toBytes();
    } catch {
      sendJson(res, 400, { error: 'Invalid pubkey' });
      return;
    }

    let sigBytes: Uint8Array;
    try {
      sigBytes = Buffer.from(signature, 'base64');
    } catch {
      sendJson(res, 400, { error: 'Invalid signature encoding' });
      return;
    }

    const valid = verifyEd25519(
      Buffer.from(challenge, 'base64'),
      sigBytes,
      ownerPubkeyBytes
    );

    if (!valid) {
      sendJson(res, 401, { error: 'Invalid signature' });
      return;
    }

    // Generate session keypair
    const kp = generateKeypair();
    const sessionPubkey = new PublicKey(kp.publicKey).toBase58();
    const ttlSeconds = body.ttlSeconds ? parseInt(body.ttlSeconds, 10) : 3600;
    const expiry = Date.now() + ttlSeconds * 1000;

    sessions.set(sessionPubkey, {
      sessionPubkey,
      sessionSecret: kp.secretKey,
      ownerPubkey: pubkey,
      expiry,
    });

    sendJson(res, 200, {
      sessionPubkey,
      sessionSecret: Buffer.from(kp.secretKey).toString('base64'),
      expiry: Math.floor(expiry / 1000),
      wsEndpoint: `ws://localhost:${PORT}`,
    });
    return;
  }

  // DELETE /session
  if (url === '/session' && method === 'DELETE') {
    const body = await readBody(req);
    const sessionPubkey = body.session;
    if (!sessionPubkey) {
      sendJson(res, 400, { error: 'Missing session' });
      return;
    }
    const deleted = sessions.delete(sessionPubkey);
    sendJson(res, deleted ? 200 : 404, { ok: deleted });
    return;
  }

  // GET /balance?account=<pda>&session=<pubkey>&signature=<base64>
  if (url.startsWith('/balance') && method === 'GET') {
    const query = parseQuery(url);
    const account = query.account;
    const sessionPubkey = query.session;
    const signature = query.signature;

    if (!account || !sessionPubkey || !signature) {
      sendJson(res, 400, { error: 'Missing account, session, or signature' });
      return;
    }

    // Verify session exists and is not expired
    const session = sessions.get(sessionPubkey);
    if (!session) {
      sendJson(res, 401, { error: 'Unknown session' });
      return;
    }
    if (Date.now() > session.expiry) {
      sendJson(res, 401, { error: 'Session expired' });
      return;
    }

    // Verify session signature over account pubkey
    let sessionPubkeyBytes: Uint8Array;
    try {
      sessionPubkeyBytes = new PublicKey(sessionPubkey).toBytes();
    } catch {
      sendJson(res, 400, { error: 'Invalid session pubkey' });
      return;
    }

    let sigBytes: Uint8Array;
    try {
      sigBytes = Buffer.from(signature, 'base64');
    } catch {
      sendJson(res, 400, { error: 'Invalid signature encoding' });
      return;
    }

    const accountBytes = new PublicKey(account).toBytes();
    const valid = verifyEd25519(accountBytes, sigBytes, sessionPubkeyBytes);

    if (!valid) {
      sendJson(res, 401, { error: 'Invalid session signature' });
      return;
    }

    // Read balance from local validator
    try {
      const info = await connection.getAccountInfo(new PublicKey(account));
      if (!info) {
        sendJson(res, 404, { error: 'Account not found' });
        return;
      }
      const balance = extractBalance(info.data);
      sendJson(res, 200, {
        balance: balance.toString(),
        account,
        session: sessionPubkey,
      });
    } catch (e: any) {
      sendJson(res, 500, { error: 'RPC error: ' + e.message });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`PER Mock Middleware listening on http://localhost:${PORT}`);
  console.log(`Connected to Solana RPC: ${SOLANA_RPC}`);
});
