# MagicBlock Integration Reference

Verified facts for Sable's integration with MagicBlock Ephemeral Rollups (ER), Private Ephemeral Rollups (PER), and the Magic Router.

## DelegateConfig Fields

**Source:** `ephemeral-rollups-sdk` v0.10.9, confirmed via source inspection.

```rust
pub struct DelegateConfig {
    pub commit_frequency_ms: u32,
    pub validator: Option<Pubkey>,
}
```

| Field | Type | Default | Purpose |
|---|---|---|---|
| `commit_frequency_ms` | `u32` | From `DelegateAccountArgs::default()` | How often the ER commits state back to L1 |
| `validator` | `Option<Pubkey>` | `None` | Specific ER validator to delegate to. `None` lets the system pick. |

**Sable defaults:**
- `validator`: `Some(ER_VALIDATOR_TEE)` — Sable is privacy-first, so all delegations route to the TEE validator.
- `commit_frequency_ms`: `60_000` (1 minute) — Sable overrides the SDK default for faster commit cadence.

### Usage in Sable

```rust
// programs/sable/src/lib.rs
use ephemeral_rollups_sdk::cpi::DelegateConfig;

const ER_VALIDATOR_TEE: Pubkey = pubkey!("MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo");

// Balance delegation
DelegateConfig {
    validator: Some(ER_VALIDATOR_TEE),
    commit_frequency_ms: 60_000,
}
```

## ER Validator Pubkeys

Identical across mainnet and devnet for the same region.

| Region | Pubkey |
|---|---|
| Asia | `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57` |
| EU | `MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e` |
| US | `MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd` |
| TEE | `MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo` |

## Endpoints

### Magic Router (Primary SDK RPC)

| Network | URL |
|---|---|
| Devnet | `https://devnet-router.magicblock.app` |
| Mainnet | `https://router.magicblock.app` |

The router auto-routes transactions to the correct ER validator. Use it as the default connection for all SDK reads and standard writes.

### Regional ER (Direct)

Use only when a specific region is required (e.g., latency optimization, compliance jurisdiction).

| Network | Asia | EU | US | TEE |
|---|---|---|---|---|
| Devnet | `https://devnet-as.magicblock.app/` | `https://devnet-eu.magicblock.app/` | `https://devnet-us.magicblock.app/` | `https://devnet-tee.magicblock.app/` |
| Mainnet | `https://as.magicblock.app/` | `https://eu.magicblock.app/` | `https://us.magicblock.app/` | `https://mainnet-tee.magicblock.app/` |

### PER (Private Ephemeral Rollup)

| Protocol | Devnet URL |
|---|---|
| HTTP | `https://devnet-tee.magicblock.app` |
| WebSocket | `wss://tee.magicblock.app` |

Auth token appended to WebSocket URL: `wss://tee.magicblock.app?token={token}`

## PER Session Integration

### Opening a session

```ts
const session = await sdk.openSession('https://devnet-tee.magicblock.app', 3600);
```

### Reading private balances

```ts
const [balancePda] = sdk.pda.deriveUserBalance(owner, mint);
const amount = await session.getBalance(balancePda);
```

### Proactive refresh

```ts
// Refresh before expiry to extend the session
await session.refresh(walletSigner, 3600);

// Listen for events
session.on('refresh', (s) => console.log('Session refreshed'));
session.on('expire', () => console.log('Session expired'));
session.on('close', () => console.log('Session closed'));
```

### WebSocket streaming

```ts
const wsUrl = session.getWebSocketUrl();
// Or with token:
const wsUrlWithToken = session.getWebSocketUrl(myAuthToken);
```

### Closing a session

```ts
await sdk.closeSession(); // Server-side + client-side cleanup
```

### Private Payments API

| Endpoint | URL |
|---|---|
| Base | `https://payments.magicblock.app` |
| Reference docs | `https://payments.magicblock.app/reference` |

Unauthenticated. All endpoints are public.

## Router-Specific JSON-RPC Methods

### `getBlockhashForAccounts`

Takes `[[pubkey1, pubkey2, ...]]` (1–100 accounts). Returns a blockhash valid on the ER node that owns those delegated accounts.

**Critical:** Every ER-bound transaction must build its blockhash via this method. `getLatestBlockhash` from base layer returns a stale blockhash for ER txs.

### `getDelegationStatus`

Takes `[pubkey]` (single account). Returns:

```ts
{
  isDelegated: boolean;
  fqdn?: string;                  // URL of the ER hosting this account
  delegationRecord?: {
    authority: string;            // validator pubkey
    owner: string;                // program that owns the account
    delegationSlot: number;
    lamports: number;
  };
}
```

Replaces client-side owner-checking for delegation detection.

### `getRoutes`

Returns all ER validators the router knows about, with FQDNs, block times, country codes.

Use in Sable Settings view for manual region selection. Default is "Auto" (let router pick).

### `getIdentity`

Returns the identity of the ER validator the router currently routes to.

Use in Sable Treasury view status bar to show "connected validator".

## SDK Router Integration

### Configuring the SDK

```ts
import { SableSdk } from '@sable/sdk';
import { Connection } from '@solana/web3.js';

const baseConnection = new Connection('https://api.devnet.solana.com');
const routerConnection = new Connection('https://devnet-router.magicblock.app');

const sdk = new SableSdk({
  programId: new PublicKey('SaSAXcdWhyr1KD8TKRg6K7WPuxcPLZJHKEwsjQgL5Di'),
  connection: baseConnection,
  routerConnection,
  wallet: { publicKey, signTransaction, signAllTransactions },
});
```

### Sending ER-bound transactions

For transactions that operate on delegated accounts (transfers, reads, etc.), pass `useRouter: true` and the list of delegated accounts:

```ts
const result = await sdk.sendTransaction(tx, {
  useRouter: true,
  delegatedAccounts: [senderBalance, recipientBalance],
});
```

The SDK will:
1. Call `getBlockhashForAccounts(delegatedAccounts)` on the router
2. Use the ER-valid blockhash
3. Send the transaction through the router connection

### Router RPC helpers

```ts
// Check delegation status via router (more accurate than client-side)
const status = await sdk.delegation.getDelegationStatusViaRouter(accountPubkey);

// List available ER validators
const routes = await sdk.delegation.getRoutes();

// Get current routed validator identity
const identity = await sdk.delegation.getIdentity();
```

## Private Payments API Integration

### Building payment transactions

The Private Payments API returns unsigned transactions with routing metadata (`sendTo: 'base' | 'ephemeral'`). Use the payload API to access this metadata:

```ts
// Build deposit payload (includes tx + routing info)
const { tx, payload } = await sdk.payments.buildDepositPayload({
  from: publicKey,
  amount: new BN(1_000_000),
});

// Sign
const signed = await wallet.signTransaction(tx);

// Submit via the correct route (auto-detected from payload)
const result = await sdk.payments.submit(signed, payload, sdk.config.connection);
console.log('Routed to:', result.sendTo); // 'base' or 'ephemeral'
```

### Legacy API (backward-compatible)

```ts
// Returns Transaction only — throws on v0 transactions
const tx = await sdk.payments.buildDeposit({ from, amount });
const result = await sdk.sendTransaction(tx);
```

### x402 Facilitator with Router

The x402 facilitator supports an optional `MAGIC_ROUTER_URL` environment variable. When set, settlements are submitted through the Magic Router instead of the base Solana RPC:

```bash
MAGIC_ROUTER_URL=https://devnet-router.magicblock.app
SOLANA_RPC_URL=https://api.devnet.solana.com
```

## Permission Account CPIs

Sable uses raw manual CPIs to the MagicBlock permission program instead of the SDK's `CpiBuilder`s. This is necessary because `ephemeral_rollups-sdk` v0.10.9 has a borsh version conflict between its `anchor` and `access-control` features.

All permission CPIs are implemented in `programs/sable/src/lib.rs` inside the `permission_cpi` module:

| Function | Discriminator | When Called | Purpose |
|---|---|---|---|
| `create_permission` | `0` | `complete_setup`, `add_mint`, `fund_agent`, `create_task` | Create permission PDA alongside every balance PDA |
| `update_permission` | `1` | `update_per_permissions` instruction | Add/remove members (auditors, temporary public mode) |
| `close_permission` | `2` | `close_per_permissions` instruction | Close permission PDA when balance PDA is closed |
| `delegate_permission` | `3` | *(deferred)* | Delegate permission PDA to ER alongside balance PDA |
| `commit_and_undelegate_permission` | `5` | *(deferred)* | Commit permission PDA back to L1 |

### Default Access Control

`MembersArgs { members: Some(vec![]) }` (empty member list) triggers the **owner-only default**: only the owner of the permissioned account can modify it. Fully private. This is Sable's default for all balances.

## Compliance

AML/OFAC screening is enforced by MagicBlock's PER infrastructure at ingress (IP geofencing + sanctions list). Sable does **not** screen transactions at the app layer. For allowed claims, see `KIMI_PROMPTS_AMENDMENT_03.md` Section E.
