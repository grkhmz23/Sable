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

### PER

| Protocol | Devnet URL |
|---|---|
| HTTP | `https://devnet-tee.magicblock.app` |
| WebSocket | `wss://tee.magicblock.app` |

Auth token appended to WebSocket URL: `wss://tee.magicblock.app?token={token}`

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

## Permission Account CPIs

Sable uses 5 `CpiBuilder`s from `ephemeral_rollups_sdk::access_control`:

| CpiBuilder | When Called | Purpose |
|---|---|---|
| `CreatePermissionCpiBuilder` | `complete_setup`, `add_mint`, `fund_agent`, `create_task` | Create permission PDA alongside every balance PDA |
| `DelegatePermissionCpiBuilder` | `delegate_user_state_and_balances` | Delegate permission PDA to ER alongside balance PDA |
| `UpdatePermissionCpiBuilder` | `update_per_permissions` instruction | Add/remove members (auditors, temporary public mode) |
| `CommitAndUndelegatePermissionCpiBuilder` | `commit_and_undelegate_user_state_and_balances` | Commit permission PDA back to L1 |
| `ClosePermissionCpiBuilder` | `close_per_permissions` instruction | Close permission PDA when balance PDA is closed |

### Default Access Control

`MembersArgs { members: Some(vec![]) }` (empty member list) triggers the **owner-only default**: only the owner of the permissioned account can modify it. Fully private. This is Sable's default for all balances.

## Compliance

AML/OFAC screening is enforced by MagicBlock's PER infrastructure at ingress (IP geofencing + sanctions list). Sable does **not** screen transactions at the app layer. For allowed claims, see `KIMI_PROMPTS_AMENDMENT_03.md` Section E.
