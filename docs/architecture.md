# Sable Architecture (Detailed)

## Table of Contents

1. [Overview](#overview)
2. [Account Layout](#account-layout)
3. [Instruction Map](#instruction-map)
4. [Agent Hierarchy](#agent-hierarchy)
5. [Sealed-Bid Auction](#sealed-bid-auction)
6. [x402 Protocol](#x402-protocol)
7. [PER Integration](#per-integration)
8. [Invariants & Conservation](#invariants--conservation)
9. [Security Model](#security-model)

---

## Overview

Sable is an Anchor program on Solana that implements:

- **Treasury management** — user balances and hierarchical agent balances backed by SPL vault ATAs
- **Policy engine** — programmable spend limits per agent with daily rolling windows, total caps, counterparty allowlists, and expiry
- **Sealed-bid auctions** — task marketplace where amounts are hidden until reveal phase
- **x402 payments** — HTTP-level pay-per-request using agent-signed transfers

All agent transfers and balance reads run through MagicBlock's Private Ephemeral Rollup, keeping amounts off-chain.

---

## Account Layout

### PDAs (Program Derived Addresses)

| Account | Seeds | Space | Owner |
|---------|-------|-------|-------|
| `Config` | `["config"]` | ~200 bytes | Program |
| `UserState` | `["user_state", owner]` | ~120 bytes | Program |
| `AgentState` | `["agent_state", parent, nonce_u32]` | ~200 bytes | Program |
| `UserBalance` | `["user_balance", owner, mint]` | ~64 bytes | Program |
| `AgentBalance` | `["agent_balance", agent, mint]` | ~64 bytes | Program |
| `AgentCounters` | `["agent_counters", agent]` | ~128 bytes | Program |
| `VaultAuthority` | `["vault_authority"]` | — (PDA only, no account data) | — |
| `Task` | `["task", poster, task_id_u64]` | ~256 bytes | Program |
| `Bid` | `["bid", task, bidder]` | ~64 bytes | Program |
| `TaskEscrow` | `["task_escrow", task]` | ~64 bytes | Program |

### SPL Token Accounts

| Account | Owner | Mint |
|---------|-------|------|
| Vault ATA (per mint) | `VaultAuthority` PDA | USDC, etc. |

---

## Instruction Map

### Treasury

| Instruction | Accounts | Side Effects |
|---|---|---|
| `initialize` | `Config` (signer = admin) | Sets program authority, delegation program ID |
| `join` | `UserState` | Creates user identity, 1 per wallet |
| `complete_setup` | `Config` (signer = admin) | Finishes setup, locks admin changes |
| `deposit` | `UserBalance`, `Vault ATA` | SPL transfer into vault, credit ledger |
| `withdraw` | `UserBalance`, `Vault ATA` | Debit ledger, SPL transfer out (blocked if delegated) |

### Agents

| Instruction | Accounts | Side Effects |
|---|---|---|
| `spawn_agent` | `AgentState` (parent), `AgentState` (new), `AgentCounters` | Adds child, sets policy |
| `update_policy` | `AgentState` | Mutates policy (only parent) |
| `agent_transfer` | `AgentBalance`, `UserBalance` or `AgentBalance` (dst), `AgentCounters` | Debit source, credit dest, increment counters, run `validate_spend` |
| `freeze_agent` | `AgentState` | Sets `frozen = true` (reversible) |
| `unfreeze_agent` | `AgentState` | Sets `frozen = false` |
| `revoke_agent` | `AgentState` | Sets `revoked = true` (irreversible) |
| `close_agent` | `AgentState`, `AgentCounters` | Requires `child_count == 0`, all balances == 0 |

### Auctions

| Instruction | Accounts | Side Effects |
|---|---|---|
| `create_task` | `Task`, `TaskEscrow` | Locks poster budget |
| `commit_bid` | `Bid` | Stores hash, locks deposit |
| `reveal_bid` | `Bid` | Verifies hash, stores amount |
| `settle_task` | `Task`, `Bid` (winner), `TaskEscrow` | Transfers escrow to winner + returns surplus to poster |
| `forfeit_unrevealed` | `Bid` | After reveal deadline, unrevealed deposits go to poster |

### Delegation

| Instruction | Accounts | Side Effects |
|---|---|---|
| `delegate` | `UserState`, balances | Delegates to ER for fast execution |
| `undelegate` | `UserState`, balances | Commits back to L1 |

---

## Agent Hierarchy

```
UserState (root)
  └─ AgentState #1 (depth 1, nonce 0)
       ├─ AgentState #1.1 (depth 2, nonce 0)
       │     └─ AgentState #1.1.1 (depth 3, nonce 0)
       │           └─ AgentState #1.1.1.1 (depth 4, nonce 0)  ← MAX_DEPTH = 4
       └─ AgentState #1.2 (depth 2, nonce 1)
  └─ AgentState #2 (depth 1, nonce 1)
```

**Constraints:**
- Max depth: 4
- Max children per parent: 64
- Nonce is deterministic per parent (0, 1, 2, ...)
- `child_count` is tracked on every `spawn_agent` and decremented on `close_agent`
- Only root user can `close_agent`; parent can `freeze`, `unfreeze`, `revoke`
- `revoked` agents cannot transfer; `frozen` agents cannot transfer but can be unfrozen

**Policy inheritance:** A child agent's policy is set at spawn time. It can be updated by the parent at any time.

---

## Sealed-Bid Auction

### Lifecycle

```
Phase 1: Open (t < commit_deadline)
  - Poster: create_task
  - Bidders: commit_bid (amount hidden)

Phase 2: Revealing (commit_deadline <= t < reveal_deadline)
  - Bidders: reveal_bid
  - No new commits allowed

Phase 3: Settled (t >= reveal_deadline)
  - Anyone: settle_task
  - Lowest revealed bid wins
  - Unrevealed deposits forfeit to poster
```

### Commit Hash

```
commit_hash = keccak256(
  amount.to_le_bytes(8) ||
  nonce.to_le_bytes(8) ||
  bidder_pubkey(32)
)
```

- `amount`: u64, little-endian
- `nonce`: u64, little-endian, client-generated random
- `bidder_pubkey`: 32 bytes, makes commitment non-transferable

**Important:** The bidder MUST persist `nonce` locally. Loss of nonce = irreversible forfeit.

---

## x402 Protocol

### Merchant Side

```ts
import { sableX402 } from '@sable/x402-facilitator';

app.get('/api/weather', sableX402({
  price: 10000,      // 0.01 USDC (6 decimals)
  receiver: posterPubkey,
  sableClient,
}), (req, res) => {
  res.json({ temp: 22, condition: 'Sunny' });
});
```

1. No `X-PAYMENT` header → `402 Payment Required` + `X-PAYMENT-REQUIRED` JSON
2. `X-PAYMENT` present → verify signature → settle on-chain → allow request

### Agent Side

```ts
import { X402Client } from '@sable/x402-client';

const client = new X402Client({ sableClient: sdk, agent: agentPubkey });
const res = await client.fetch('https://merchant.example/api/weather');
```

1. First request → 402
2. Build `agent_transfer` tx payload
3. Sign with wallet
4. Retry with `X-PAYMENT: base64(payload)`
5. Receive 200 + response body

---

## PER Integration

### Account-Level Permissions

For every balance account, Sable creates a `PermissionMetadata` account via the PER Permission Program:

```
PermissionMetadata seeds: [account_pubkey, "permission_metadata"]
PermissionMetadata program: ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1
```

### Session Keys

When a user delegates balances, a session key is generated:

```ts
const session = await client.openSession({ mints: [USDC_MINT] });
// session.keypair: ephemeral keypair for PER reads
// session.expiry: 24h TTL
```

The session keypair is registered with the PER program so the agent can read its own balances without the main wallet present.

### Delegation Flow

```
1. User calls client.delegate({ mintList })
2. SDK CPIs to delegation program
3. UserState + balances are moved to ER
4. Session key is registered with PER
5. Internal transfers are <500ms
6. To withdraw, call client.undelegate() → commit back to L1
```

---

## Invariants & Conservation

### Conservation of Funds

At all times:

```
Σ(all UserBalance.amounts)
+ Σ(all AgentBalance.amounts)
+ Σ(all TaskEscrow.amounts)
== Σ(all Vault ATA balances)
```

This is checked by the integration test suite after every mutating instruction.

### Policy Enforcement

Every `agent_transfer` runs `validate_spend`:

```rust
fn validate_spend(
    counters: &AgentCounters,
    policy: &Policy,
    amount: u64,
    counterparty: &Pubkey,
    mint: &Pubkey,
    clock: &Clock,
) -> Result<()> {
    // 1. Not frozen
    // 2. Not revoked
    3. amount <= per_tx_limit
    4. daily_spend + amount <= daily_limit
    5. total_spend + amount <= total_limit
    6. counterparty in allowed_list (if counterparty_mode != Any)
    7. mint in allowed_mints
    8. clock.unix_timestamp < expires_at (if set)
}
```

There is no instruction path that debits an agent balance without calling `validate_spend`.

---

## Security Model

### Threat: Agent key compromise

- Mitigation: Parent can `freeze_agent` instantly. `revoke_agent` permanently disables the agent.
- Limitation: A compromised key can still read balances (PER metadata is public). Future work: rotate session keys.

### Threat: Auction front-running

- Mitigation: Commit-reveal scheme hides amounts. Bidder pubkey in hash prevents transferring commitments.
- Limitation: Commit transaction itself is visible. A determined observer can correlate commit timing with wallet activity.

### Threat: x402 replay attacks

- Mitigation: Facilitator maintains a 5-minute TTL nonce cache. Duplicate nonces are rejected.
- Limitation: Facilitator is a trusted party. Decentralized facilitator network is future work.

### Threat: Delegation withdrawal while delegated

- Mitigation: `withdraw` checks `is_delegated` flag on `UserState` and errors if true.
- Limitation: If ER halts, funds are locked until commit/undelegate succeeds.
