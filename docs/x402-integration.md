# x402 Integration Guide

Accept Sable agent payments in your API with two lines of code.

## Installation

```bash
npm install @sable/x402-facilitator
```

## Express / Node.js

```ts
import express from 'express';
import { sableX402, SableAdapter } from '@sable/x402-facilitator';
import { SableClient } from '@sable/sdk';

const app = express();

// Initialize Sable SDK
const sable = new SableClient({
  connection,
  wallet,
  programId: SABLE_PROGRAM_ID,
});

// Create adapter
const adapter = new SableAdapter({
  sableClient: sable,
  programId: SABLE_PROGRAM_ID,
});

// Protect a route
app.get('/api/weather',
  sableX402({
    price: 10000,           // 0.01 USDC (6 decimals)
    receiver: YOUR_PUBKEY,  // Your Sable UserState or AgentState
    adapter,
  }),
  (req, res) => {
    res.json({ city: 'Berlin', temp: 22 });
  }
);

app.listen(3000);
```

## Next.js App Router

```ts
// app/api/weather/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sableX402 } from '@sable/x402-facilitator';
import { adapter } from '@/lib/sable-adapter';

const withX402 = sableX402({
  price: 10000,
  receiver: process.env.RECEIVER_PUBKEY!,
  adapter,
});

export const GET = withX402(async (req: NextRequest) => {
  const city = req.nextUrl.searchParams.get('city') || 'Berlin';
  return NextResponse.json({ city, temp: 22, condition: 'Sunny' });
});
```

## How It Works

### 1. No Payment Header

```http
GET /api/weather HTTP/1.1

HTTP/1.1 402 Payment Required
X-PAYMENT-REQUIRED: {"price":10000,"receiver":"SaSAX...","network":"solana"}
```

### 2. Agent Retries with Payment

```http
GET /api/weather HTTP/1.1
X-PAYMENT: eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9...

HTTP/1.1 200 OK
{"city":"Berlin","temp":22}
```

### 3. Facilitator Verifies

The facilitator:
1. Decodes the `X-PAYMENT` header
2. Verifies the agent's signature on the `agent_transfer` transaction
3. Checks the nonce against a 5-minute TTL cache (replay protection)
4. Submits the transaction via Sable's PER settlement path
5. Returns 200 if all checks pass

## Configuration Options

```ts
interface SableX402Options {
  price: number;           // Price in base units (e.g. 10000 = 0.01 USDC)
  receiver: string;        // Base58 pubkey of recipient UserState or AgentState
  adapter: SableAdapter;   // Initialized adapter instance
  network?: string;        // Default: "solana"
}
```

## Pricing Examples

| Use Case | Price (base units) | USD (6 decimals) |
|---|---|---|
| Single API call | 1_000 | $0.001 |
| Image generation | 50_000 | $0.05 |
| LLM prompt (1K tokens) | 10_000 | $0.01 |
| Data lookup | 500 | $0.0005 |

## Replay Protection

The facilitator maintains an in-memory nonce cache with a 5-minute TTL. If an agent reuses a payment header within 5 minutes, the request is rejected with `409 Conflict`.

For production, replace the in-memory cache with Redis:

```ts
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

const adapter = new SableAdapter({
  sableClient: sable,
  programId: SABLE_PROGRAM_ID,
  nonceStore: {
    get: async (nonce) => redis.get(`x402:nonce:${nonce}`),
    set: async (nonce, ttlMs) => redis.setex(`x402:nonce:${nonce}`, ttlMs / 1000, '1'),
  },
});
```

## Error Responses

| Status | Meaning |
|---|---|
| `402` | Payment required (first call) |
| `400` | Invalid X-PAYMENT header |
| `403` | Signature verification failed |
| `409` | Nonce replay detected |
| `500` | Settlement failed (on-chain error) |

## Testing

Use the x402 client to test your integration:

```ts
import { X402Client } from '@sable/x402-client';

const client = new X402Client({ sableClient, agent: agentPubkey });
const res = await client.fetch('http://localhost:3000/api/weather');
console.log(await res.json());
```

## Support

Open an issue in the [Sable repo](https://github.com/your-org/sable) or ping us in the MagicBlock Discord.
