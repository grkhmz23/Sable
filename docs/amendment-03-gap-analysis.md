# Amendment 03 Gap Analysis

**Date:** 2026-04-20  
**Baseline:** Commit `0d1f2df` (Prompt 25 complete)  
**Reference:** `KIMI_PROMPTS_AMENDMENT_03.md` (final external spec)

---

## Section 1 — Endpoints & Constants

For each value in Amendment 03 Section A, the table below shows whether the codebase hardcodes the **correct** value, a **different** value, or **no value**.

### A.1 — Endpoints

| Endpoint | Amendment 03 Value | Codebase Status | Location |
|---|---|---|---|
| Magic Router (devnet) | `https://devnet-router.magicblock.app` | **NO VALUE** | Not referenced anywhere in source. `.env` / `packages/common/src/constants.ts` only define `https://api.devnet.solana.com`. |
| Regional ER — Devnet Asia | `https://devnet-as.magicblock.app/` | **NO VALUE** | Not referenced. |
| Regional ER — Devnet EU | `https://devnet-eu.magicblock.app/` | **NO VALUE** | Not referenced. |
| Regional ER — Devnet US | `https://devnet-us.magicblock.app/` | **NO VALUE** | Not referenced. |
| Regional ER — Devnet TEE | `https://devnet-tee.magicblock.app/` | **NO VALUE** | Not referenced. |
| PER WebSocket (devnet) | `wss://tee.magicblock.app` | **NO VALUE** | Not referenced in code. Only appears in the amendment file itself. |
| Private Payments API | `https://payments.magicblock.app` | **NO VALUE** | SDK `payments.ts` takes `apiUrl` as constructor arg. Mock server runs on `localhost:4444`. No default to live endpoint. |
| Solana base (devnet) | `https://api.devnet.solana.com` | **CORRECT** | `packages/common/src/constants.ts:42`, `.env:8`, `.env.example:6,22` |

### A.2 — Program IDs

| Program ID | Amendment 03 Value | Codebase Status | Location |
|---|---|---|---|
| Sable program | `SaSAXcdWhyr1KD8TKRg6K7WPuxcPLZJHKEwsjQgL5Di` | **CORRECT** | `programs/sable/src/lib.rs:116` (`declare_id!`), `packages/common/src/constants.ts:4`, `packages/sdk/src/client.ts:48`, etc. |
| Delegation program | `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh` | **CORRECT** | `programs/sable/src/lib.rs:37`, `packages/common/src/constants.ts:9`, `packages/sdk/src/delegation.ts:12` |
| Permission program | `ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1` | **CORRECT** | `programs/sable/src/lib.rs:36` (`permission_cpi` module), `packages/sdk/src/pda.ts:20` |
| Local ER validator | `mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev` | **NO VALUE** | Not referenced. Only used for `mb-test-validator` local testing. |

### A.3 — ER Validator Identities

| Validator | Amendment 03 Value | Codebase Status | Location |
|---|---|---|---|
| ER_VALIDATOR_AS | `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57` | **NO VALUE** | Not referenced anywhere. |
| ER_VALIDATOR_EU | `MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e` | **NO VALUE** | Not referenced anywhere. |
| ER_VALIDATOR_US | `MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd` | **NO VALUE** | Not referenced anywhere. |
| ER_VALIDATOR_TEE | `MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo` | **NO VALUE** | Not referenced anywhere. |

### A.4 — Token Mints

| Mint | Amendment 03 Value | Codebase Status | Location |
|---|---|---|---|
| Devnet USDC | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | **CORRECT** (one place) | `app/src/components/BalanceList.tsx:163` (decimal lookup). |
| Devnet USDC | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | **WRONG VALUE** | `services/x402-facilitator/src/middleware.ts:39`, `app/src/app/api/demo/weather/route.ts:4`, `app/src/components/X402DemoView.tsx:81`, `app/src/components/CompleteSetupModal.tsx:182`, `app/src/components/ActionPanel.tsx:731` all use **mainnet USDC** (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`). |
| Mainnet USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | **HARDCODED** (see above) | Should only appear for mainnet builds, not devnet defaults. |
| wSOL | `So11111111111111111111111111111111111111112` | **CORRECT** | `programs/sable/src/lib.rs:119`, `packages/sdk/src/client.ts:31`, `packages/common/src/types.ts:6` |

---

## Section 2 — Private Payments API Adapter

**File:** `packages/sdk/src/payments.ts` (228 lines)

Amendment 03 Section A.8 specifies these exact field names. The adapter's current fields vs. required fields:

| Endpoint | Amendment 03 Field | Current Code Field | Status | Line |
|---|---|---|---|---|
| `POST /v1/spl/deposit` | `owner` | `from` | **WRONG** | `payments.ts:110` — sends `{ from, amount, mint }` |
| `POST /v1/spl/deposit` | `amount` | `amount` | **CORRECT** | `payments.ts:111` |
| `POST /v1/spl/deposit` | `cluster` | *(missing)* | **MISSING** | Not sent |
| `POST /v1/spl/deposit` | `mint` | `mint` | **CORRECT** | `payments.ts:112` |
| `POST /v1/spl/deposit` | `validator` | *(missing)* | **MISSING** | Not sent |
| `POST /v1/spl/deposit` | `initIfMissing` | *(missing)* | **MISSING** | Not sent |
| `POST /v1/spl/deposit` | `initVaultIfMissing` | *(missing)* | **MISSING** | Not sent |
| `POST /v1/spl/transfer` | `owner` | `from` | **WRONG** | `payments.ts:135` — sends `{ from, to, amount, mint }` |
| `POST /v1/spl/transfer` | `destination` | `to` | **WRONG** | `payments.ts:136` — should be `destination` |
| `POST /v1/spl/transfer` | `privacy` | *(missing)* | **MISSING** | Not sent; should default to `"private"` |
| `POST /v1/spl/transfer` | `memo` | *(missing)* | **MISSING** | Not sent |
| `POST /v1/spl/withdraw` | `owner` | `from` | **WRONG** | `payments.ts:161` — sends `{ from, to, amount, mint }` |
| `POST /v1/spl/withdraw` | `amount` | `amount` | **CORRECT** | `payments.ts:163` |
| `POST /v1/spl/withdraw` | `cluster` | *(missing)* | **MISSING** | Not sent |
| `GET /v1/spl/balance` | `owner` | `owner` | **CORRECT** | `payments.ts:181` |
| `GET /v1/spl/balance` | `cluster` | *(missing)* | **MISSING** | Not sent |
| `GET /v1/spl/private-balance` | *(entire endpoint)* | *(missing)* | **MISSING** | No method exists for ER-side balance reads |
| `GET /v1/spl/is-mint-initialized` | `mint` | `mint` | **CORRECT** | `payments.ts:192` — but endpoint path is `/mint-init-status` instead of `/is-mint-initialized` |
| `POST /v1/spl/initialize-mint` | `owner` | *(missing)* | **MISSING** | `initMint` sends `{ mint }` only; missing `owner`, `cluster`, `validator` |
| `POST /v1/spl/initialize-mint` | `mint` | `mint` | **CORRECT** | `payments.ts:205` |

**Additional mismatches:**

- **Path prefixes:** Amendment 03 requires `/v1/spl/` prefix on all endpoints. Current code uses bare paths (`/deposit`, `/transfer`, `/withdraw`, `/balance`, `/mint-init-status`, `/init-mint`).
- **Response type:** Current code defines `UnsignedTransactionPayload` with fields `version`, `sendTo`, `instructionCount` — none of which are in Amendment 03's `UnsignedTransactionResponse`. The `kind` field is present but typed as a narrowed literal union instead of `string`.
- **Types file:** Amendment 03 specifies creating `packages/sdk/src/payments/types.ts` with formal TypeScript types (`DepositRequest`, `TransferRequest`, etc.). **This file does not exist.** Types are inlined as ad-hoc object literals and a single `UnsignedTransactionPayload` interface.
- **AML endpoint:** Current code defines `/aml-screen` endpoint. Amendment 03 does **not** document this endpoint. The live Payments API handles compliance at the infrastructure level, not via an app-screening endpoint.

---

## Section 3 — PER Session Flow

**File:** `packages/sdk/src/session.ts` (184 lines)

### Current Implementation

The `SableSession` class **does NOT** use `verifyTeeRpcIntegrity` or `getAuthToken` from `@magicblock-labs/ephemeral-rollups-sdk`. Instead, it implements a **custom challenge-response protocol** that matches the mock middleware in `services/per-mock-middleware/`:

```typescript
// Lines 67–128 — custom challenge/response against a mock-compatible endpoint
static async openSession({ signer, perRpcUrl, ttlSeconds = 3600 }: SableSessionConfig) {
  // 1. GET /challenge?pubkey=...
  const challengeRes = await fetch(`${perRpcUrl}/challenge?pubkey=${...}`);
  // 2. Sign challenge
  const signature = await signer.signMessage(challengeBytes);
  // 3. POST /session with challenge + signature
  const sessionRes = await fetch(`${perRpcUrl}/session`, { ... });
  // 4. Receive sessionKeypair from server
  const { sessionPubkey, sessionSecret, expiry } = await sessionRes.json();
  const sessionKey = Keypair.fromSecretKey(secretBytes);
}
```

The `getBalance` method (lines 135–163) also uses a mock-compatible endpoint:
```typescript
// GET /balance?account=...&session=...&signature=...
const res = await fetch(
  `${this.perEndpoint}/balance?account=${account}&session=${session}&signature=${signature}`
);
```

### Amendment 03 Required Implementation (A.11)

Amendment 03 requires:
1. `verifyTeeRpcIntegrity(teeUrl)` — **NOT present**. Must abort session if returns false.
2. `getAuthToken(teeUrl, userPubkey, signFn)` — **NOT present**. Replaces the entire challenge/response flow.
3. `Connection.create(teeUserUrl, teeUserWsUrl)` from `@magicblock-labs/ephemeral-rollups-kit` — **NOT present**. Current code uses raw `fetch` calls.
4. `nacl.sign.detached` for signing — **NOT imported**.

### TEE Integrity Check

**Does the code abort on failed TEE integrity?**  
**NO.** There is no TEE integrity verification at all. The current flow trusts the `perRpcUrl` endpoint implicitly.

---

## Section 4 — Permission Account CPIs

### Current State

The codebase has a **single raw-manual CPI helper** in `programs/sable/src/lib.rs:28–114` (`permission_cpi` module):

```rust
mod permission_cpi {
    // Defines PERMISSION_PROGRAM_ID, PERMISSION_SEED, flag constants
    // Implements ONE function: create_permission()
    // Manually borsh-serializes MembersArgs with a single Member (authority + all flags)
}
```

### CpiBuilder Audit

| CpiBuilder | Amendment 03 A.6 | Present in Code? | Location |
|---|---|---|---|
| `CreatePermissionCpiBuilder` | Required | **NO** — raw manual CPI used instead | `lib.rs:49–113` (manual `invoke_signed`) |
| `DelegatePermissionCpiBuilder` | Required | **NO** | Not referenced anywhere |
| `UpdatePermissionCpiBuilder` | Required | **NO** | Not referenced anywhere |
| `CommitAndUndelegatePermissionCpiBuilder` | Required | **NO** | Not referenced anywhere |
| `ClosePermissionCpiBuilder` | Required | **NO** | Not referenced anywhere |

### Where Permission Accounts Are Managed Today

| Operation | File | Line | What Happens | What's Missing |
|---|---|---|---|---|
| **Create** | `programs/sable/src/lib.rs` (inside `complete_setup`) | ~156–176 | Calls `permission_cpi::create_permission()` with a single authority member + all flags | Should use `CreatePermissionCpiBuilder` with `members: Some(vec![])` (empty = owner-only default) |
| **Create** | `programs/sable/src/lib.rs` (inside `add_mint`) | ~187–207 | Same raw `create_permission()` call | Same gap |
| **Create** | `programs/sable/src/lib.rs` (inside `fund_agent`) | ~750–770 | Same raw `create_permission()` call for AgentBalance | Same gap |
| **Create** | `programs/sable/src/lib.rs` (inside `create_task`) | ~850–870 | Same raw `create_permission()` call for TaskEscrow | Same gap |
| **Delegate** | *nowhere* | — | Permission PDAs are **never delegated** | Must call `DelegatePermissionCpiBuilder` alongside each balance delegation |
| **Commit/Undelegate** | *nowhere* | — | Permission PDAs are **never committed/undelegated** | Must call `CommitAndUndelegatePermissionCpiBuilder` alongside balance commit/undelegate |
| **Update** | *nowhere* | — | No `update_per_permissions` instruction exists | Must add instruction using `UpdatePermissionCpiBuilder` |
| **Close** | *nowhere* | — | No `close_per_permissions` instruction exists | Must add instruction using `ClosePermissionCpiBuilder` |

### Rust Import Gap

Amendment 03 A.6 specifies these imports:
```rust
use ephemeral_rollups_sdk::access_control::{
    instructions::{CreatePermissionCpiBuilder, DelegatePermissionCpiBuilder, ...},
    structs::{Member, MembersArgs, AUTHORITY_FLAG, ...},
};
```

Current code imports **none** of these. It only has:
```rust
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::{delegate_account, DelegateAccounts, DelegateConfig};
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;
```

---

## Section 5 — ER Delegation

### DelegateConfig Validator Field

**Yes, `DelegateConfig` includes a `validator` field.** The installed SDK version is `0.10.9` (per `Cargo.toml:21`). The struct definition is:

```rust
pub struct DelegateConfig {
    pub commit_frequency_ms: u32,
    pub validator: Option<Pubkey>,
}
```

### Which Validator Is Used?

**`None`** — hardcoded in both call sites:

```rust
// programs/sable/src/lib.rs:961–964
DelegateConfig {
    validator: None,
    ..Default::default()
}

// programs/sable/src/lib.rs:1056–1059
DelegateConfig {
    validator: None,
    ..Default::default()
}
```

The SDK TypeScript layer (`packages/sdk/src/delegation.ts`) also does **not** expose a validator parameter. It builds remaining accounts and calls the program instruction directly without any validator configuration.

### Gap

Amendment 03 A.3 specifies Sable should default to `ER_VALIDATOR_TEE` (`MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo`). The validator pubkey is **not hardcoded anywhere** in the codebase, and `DelegateConfig.validator` is always `None`.

---

## Section 6 — Magic Router Usage

### Does the SDK default to `https://devnet-router.magicblock.app`?

**NO.** The SDK (`packages/sdk/src/client.ts`) does **not** define a default connection URL at all. It accepts `config.connection` from the caller:

```typescript
// packages/sdk/src/client.ts:46–56
constructor(config: SdkConfig) {
  this.config = config;
  // ...
  this.provider = new AnchorProvider(
    config.connection,   // ← caller-supplied, no default
    wallet,
    AnchorProvider.defaultOptions()
  );
}
```

The constants file defines RPC endpoints but they are **not used** as the SDK default:
```typescript
// packages/common/src/constants.ts:40–44
export const RPC_ENDPOINTS = {
  LOCALNET: 'http://127.0.0.1:8899',
  DEVNET: 'https://api.devnet.solana.com',
  MAINNET: 'https://api.mainnet-beta.solana.com',
};
```

### Does the SDK use `getBlockhashForAccounts`?

**NO.** Not present in any source file. All transactions use standard `getLatestBlockhash` via the base-layer connection.

### Does the SDK use `getDelegationStatus` (the Magic Router RPC method)?

**PARTIAL — but not the router method.** The SDK has a `getDelegationStatus` method (`packages/sdk/src/delegation.ts:126`), but it implements the check **client-side** by reading `accountInfo.owner` and comparing to the delegation program ID. It does **not** call the Magic Router's `getDelegationStatus` JSON-RPC method which returns `isDelegated`, `fqdn`, and `delegationRecord`.

### App-Level Connection

The Next.js app (`app/src/contexts/WalletContext.tsx:57–69`) uses a routing mode switch:
- `'solana'` mode → uses `@solana/wallet-adapter-react`'s base connection
- `'er'` mode → falls back to `env.MAGICBLOCK_RPC_URL` if set, otherwise back to base

There is no reference to `devnet-router.magicblock.app` anywhere in the app code.

---

## Section 7 — Mock Services to Delete

### Complete Service Inventory

| Service | Files | Type | Still Needed? |
|---|---|---|---|
| **payments-api-mock** | `src/server.ts`, `package.json`, `tsconfig.json` | **Mock** — simulates MagicBlock Private Payments API | **DELETE** — Amendment 03 switches to live `https://payments.magicblock.app` |
| **per-mock-middleware** | `src/server.ts`, `package.json`, `tsconfig.json`, `package-lock.json` | **Mock** — simulates MagicBlock PER middleware with custom challenge/response | **DELETE** — Amendment 03 uses real SDK helpers (`verifyTeeRpcIntegrity`, `getAuthToken`) against live `https://devnet-tee.magicblock.app` |
| **x402-facilitator** | `src/index.ts`, `src/middleware.ts`, `src/protocol.ts`, `src/sable-adapter.ts`, `src/server.ts`, `tests/x402-e2e.test.ts`, `package.json`, `tsconfig.json` | **Real** — actual merchant-side x402 settlement service | **KEEP** — This is Sable's own service, not a mock of external infrastructure. It verifies signatures and settles on-chain. |

### Mock Service Details

#### `services/payments-api-mock/`
- Implements endpoints: `/deposit`, `/transfer`, `/withdraw`, `/balance`, `/mint-init-status`, `/init-mint`, `/aml-screen`
- Runs on `localhost:4444` (configurable)
- Mirrors MagicBlock's API shape but with **wrong field names** (`from`/`to` instead of `owner`/`destination`)
- **Delete entire directory.**

#### `services/per-mock-middleware/`
- Implements endpoints: `/challenge`, `/session`, `/balance`
- Runs on `localhost:3333` (configurable)
- Simulates PER session keypair exchange — **completely different protocol** from Amendment 03's `verifyTeeRpcIntegrity` + `getAuthToken`
- **Delete entire directory.**

### References to Mock Services That Must Be Updated

| File | Line | Reference | Action |
|---|---|---|---|
| `.env.example` | 32 | `NEXT_PUBLIC_SABLE_PRIVATE_PAYMENTS_API_URL=http://localhost:4444` | Replace with `https://payments.magicblock.app` |
| `.env.example` | 37 | `NEXT_PUBLIC_SABLE_PER_MOCK_URL=http://localhost:3333` | Remove — no mock needed |
| `tests/integration/helpers/env.ts` | 4 | `SABLE_PRIVATE_PAYMENTS_API_URL` fallback to `localhost:4444` | Replace with live endpoint |
| `tests/integration/helpers/env.ts` | 5 | `SABLE_PER_MOCK_URL` fallback to `localhost:3333` | Remove |
| `scripts/test-integration.sh` | 11 | `PAYMENTS_MOCK_URL=http://localhost:4444` | Remove startup of mock server |
| `scripts/test-integration.sh` | 10 | `PER_MOCK_URL=http://localhost:3333` | Remove startup of mock server |
| `packages/sdk/tests/sdk-payments.test.ts` | 15–16 | Spins up mock server on dynamic port | Rewrite to hit live endpoint (gated by env var) |
| `packages/sdk/tests/sdk-session.test.ts` | 15–21 | Spins up mock server on dynamic port | Rewrite to use real TEE flow (gated by env var) |

---

## Section 8 — What's Correct and Must Stay

The following components do **not** touch MagicBlock-specific endpoints, program IDs, or SDK helpers. They implement Sable's core business logic and require **no changes** for Amendment 03 compliance.

### Program Instructions (Rust)

| Instruction | Why It Stays |
|---|---|
| `initialize` | Sets admin + delegation program ID. Delegation program ID is already correct. |
| `join` | Creates UserState. No MagicBlock specifics. |
| `complete_setup` | Creates Config + vault. Only needs permission CPI swap (Section 4), but the instruction scaffold stays. |
| `deposit` | SPL token transfer into vault. No MagicBlock specifics. |
| `withdraw` | SPL token transfer out of vault. No MagicBlock specifics. |
| `spawn_agent` | Creates AgentState. No MagicBlock specifics. |
| `update_policy` | Mutates AgentState policy. No MagicBlock specifics. |
| `agent_transfer` | Debits/credits balances with policy checks. No MagicBlock specifics. |
| `freeze_agent` / `unfreeze_agent` / `revoke_agent` | State machine transitions. No MagicBlock specifics. |
| `close_agent` | Cleanup. No MagicBlock specifics. |
| `create_task` / `cancel_task` | Auction lifecycle. Only needs permission CPI swap. |
| `commit_bid` / `reveal_bid` / `settle_task` | Sealed-bid auction. No MagicBlock specifics. |
| `delegate_user_state_and_balances` | **Scaffold stays**, but needs: (a) validator pubkey in DelegateConfig, (b) DelegatePermissionCpiBuilder calls. |
| `commit_and_undelegate_user_state_and_balances` | **Scaffold stays**, but needs CommitAndUndelegatePermissionCpiBuilder calls. |

### SDK Modules (TypeScript)

| Module | File | Why It Stays |
|---|---|---|
| `TreasuryModule` | `packages/sdk/src/treasury.ts` | Vanilla Anchor program calls. |
| `TransferModule` | `packages/sdk/src/transfer.ts` | Vanilla Anchor program calls. |
| `AgentsModule` | `packages/sdk/src/agents.ts` | Vanilla Anchor program calls + PDA derivation. |
| `AuctionsModule` | `packages/sdk/src/auctions.ts` | Vanilla Anchor program calls + keccak256 helper. |
| `X402Client` | `packages/x402-client/src/index.ts` | x402 protocol client. No MagicBlock endpoint deps. |
| `PdaHelper` | `packages/sdk/src/pda.ts` | PDA derivation logic. Already has correct permission program ID. |

### UI Views (React/Next.js)

| View | File | Why It Stays |
|---|---|---|
| `TreasuryView` | `app/src/components/TreasuryView.tsx` | Uses SDK modules. No direct MagicBlock deps. |
| `AgentsView` | `app/src/components/AgentsView.tsx` | Uses SDK modules. No direct MagicBlock deps. |
| `TasksView` | `app/src/components/TasksView.tsx` | Uses SDK modules. No direct MagicBlock deps. |
| `X402DemoView` | `app/src/components/X402DemoView.tsx` | Uses `X402Client`. No direct MagicBlock deps. |
| `FundModal` | `app/src/components/FundModal.tsx` | Uses `payments.buildDeposit`. Stays; adapter changes underneath. |

### Tests That Stay (With Live Gating)

| Test | File | Why It Stays |
|---|---|---|
| Integration specs 01–06 | `tests/integration/01-treasury.spec.ts` through `06-per-permissions.spec.ts` | Test core program logic against local validator. No MagicBlock endpoint deps. |
| Integration spec 07 (x402) | `tests/integration/07-x402.spec.ts` | Tests x402 flow against local facilitator. Stays. |

---

## Section 9 — Proposed Migration PRs

These are ordered so each PR is independently testable and early PRs don't break later ones.

### PR 1 — Constants & Environment Update
**Scope:** Add all Amendment 03 endpoints, validator pubkeys, and token mints to constants and `.env.example`. No functional code changes.

- Add `MAGICBLOCK_ENDPOINTS` to `packages/common/src/constants.ts` (router, PER HTTP/WS, Payments API, regional ER URLs)
- Add `ER_VALIDATOR_TEE` and other validator pubkeys to `packages/common/src/constants.ts`
- Fix devnet USDC mint references in app/x402 (replace mainnet `EPjFW...` with devnet `4zMMC...`)
- Rewrite `.env.example` to match Amendment 03 Section C exactly
- Update `docs/magicblock-integration.md` with discovered `DelegateConfig` fields (from `cargo doc`)

**Testable:** Build passes, no runtime changes.

---

### PR 2 — Permission CPI Migration + Validator Config (Rust)
**Scope:** Replace raw manual CPI with formal `CpiBuilder`s from `ephemeral-rollups-sdk::access_control`, AND configure the TEE validator pubkey in the same PR. These two changes must land together because `DelegatePermissionCpiBuilder.validator(&validator)` needs the same TEE validator pubkey that `DelegateConfig.validator` needs.

- Add `ephemeral-rollups-sdk` access_control imports to `programs/sable/src/lib.rs`
- Replace `permission_cpi::create_permission()` with `CreatePermissionCpiBuilder` in `complete_setup`, `add_mint`, `fund_agent`, `create_task`
- Use `MembersArgs { members: Some(vec![]) }` for default private state (owner-only by default)
- Add `DelegatePermissionCpiBuilder` calls inside `delegate_user_state_and_balances` (one per balance + one per permission PDA), with `.validator(&ER_VALIDATOR_TEE)`
- Add `CommitAndUndelegatePermissionCpiBuilder` calls inside `commit_and_undelegate_user_state_and_balances`
- Add new `update_per_permissions` instruction using `UpdatePermissionCpiBuilder`
- Add new `close_per_permissions` instruction using `ClosePermissionCpiBuilder`
- Add `ER_VALIDATOR_TEE` constant to Rust (`programs/sable/src/lib.rs`)
- Change `DelegateConfig { validator: None, ..Default::default() }` to `validator: Some(ER_VALIDATOR_TEE)` in both UserState and balance delegation sites
- Expose validator override via Config account or instruction arg
- Update SDK `PdaHelper.derivePermission()` if seed scheme changes

**Testable:** `cargo build-sbf` + `cargo test --package sable` + local integration tests.

**Required integration test:** Prove "owner-only by default" works — a second user's keypair opens its own PER session and attempts to read a delegated balance owned by the first user, expecting an authorization error.

---

### PR 3 — Magic Router Integration (TS SDK)
**Scope:** Make the Magic Router the default connection endpoint. Add router-specific RPC methods.

- Add `SableRouterConnection` wrapper class in `packages/sdk/src/router.ts`
- Default SDK connection to `https://devnet-router.magicblock.app` when no connection provided
- Implement `getBlockhashForAccounts(accounts: PublicKey[])` wrapper
- Replace client-side `getDelegationStatus` with Router `getDelegationStatus` RPC call
- Implement `getRoutes()` and `getIdentity()` for Settings UI
- Update `WalletContext.tsx` to use router connection and expose routing mode

**Testable:** SDK unit tests against router (live, gated by env var).

---

### PR 5 — Private Payments API Adapter Rewrite
**Scope:** Rewrite `packages/sdk/src/payments.ts` to match Amendment 03 A.8 schemas exactly.

- Create `packages/sdk/src/payments/types.ts` with formal types (`DepositRequest`, `TransferRequest`, `WithdrawRequest`, `InitializeMintRequest`, `UnsignedTransactionResponse`, `BalanceResponse`, `IsMintInitializedResponse`)
- Change all endpoint paths to `/v1/spl/...` prefix
- Change `buildDeposit` params from `{ from, amount, mint }` to `{ owner, amount, cluster?, mint?, validator?, initIfMissing?, initVaultIfMissing? }`
- Change `buildTransfer` params from `{ from, to, amount, mint }` to `{ owner, destination, amount, cluster?, mint?, privacy?, validator?, memo? }`
- Change `buildWithdraw` params from `{ from, to, amount, mint }` to `{ owner, amount, cluster?, mint?, validator? }`
- Add `getPrivateBalance()` method for `GET /v1/spl/private-balance`
- Fix `isMintInitialized` path to `/v1/spl/is-mint-initialized` and add `owner`/`cluster`/`validator` query params
- Fix `initializeMint` to send `owner`, `cluster`, `validator`
- Remove `aml.screen` method (compliance is infrastructure-level)
- Update `UnsignedTransactionPayload` → `UnsignedTransactionResponse` to match Amendment 03 shape
- Default `apiUrl` to `https://payments.magicblock.app`

**Testable:** Unit tests against live Payments API (gated by `SABLE_SKIP_LIVE_PAYMENTS_TESTS`).

---

### PR 6 — PER Session Flow Rewrite
**Scope:** Replace mock-based session with real TEE SDK helpers.

- Add `@magicblock-labs/ephemeral-rollups-sdk` and `tweetnacl` dependencies to `packages/sdk`
- Rewrite `SableSession.open()` to use `verifyTeeRpcIntegrity()` + `getAuthToken()` + `Connection.create()`
- Add `TeeIntegrityError` class; abort session if `verifyTeeRpcIntegrity` returns false
- Rewrite `SableSession.getBalance()` to use the authenticated `Connection`'s `getAccountInfo` + IDL decoder
- Remove `SessionExpiredError` (token lifecycle is unknown; rely on auto-retry on 401/403)
- Add auto-retry: catch RPC auth errors, re-run `getAuthToken` once, then surface
- Default `teeHttpUrl` to `https://devnet-tee.magicblock.app`, `teeWsUrl` to `wss://tee.magicblock.app`
- Update `SableClient.openSession()` to match new signature

**Testable:** Unit tests against live `devnet-tee.magicblock.app` (gated by `SABLE_SKIP_LIVE_TEE_TESTS`).

---

### PR 4 — Private Payments API Rewrite
**Scope:** Rewrite `packages/sdk/src/payments.ts` to match Amendment 03 A.8 schemas exactly.

- Create `packages/sdk/src/payments/types.ts` with formal types (`DepositRequest`, `TransferRequest`, `WithdrawRequest`, `InitializeMintRequest`, `UnsignedTransactionResponse`, `BalanceResponse`, `IsMintInitializedResponse`)
- Change all endpoint paths to `/v1/spl/...` prefix
- Change `buildDeposit` params from `{ from, amount, mint }` to `{ owner, amount, cluster?, mint?, validator?, initIfMissing?, initVaultIfMissing? }`
- Change `buildTransfer` params from `{ from, to, amount, mint }` to `{ owner, destination, amount, cluster?, mint?, privacy?, validator?, memo? }`
- Change `buildWithdraw` params from `{ from, to, amount, mint }` to `{ owner, amount, cluster?, mint?, validator? }`
- Add `getPrivateBalance()` method for `GET /v1/spl/private-balance`
- Fix `isMintInitialized` path to `/v1/spl/is-mint-initialized` and add `owner`/`cluster`/`validator` query params
- Fix `initializeMint` to send `owner`, `cluster`, `validator`
- Remove `aml.screen` method (compliance is infrastructure-level)
- Add file-header comment documenting that AML/OFAC screening is enforced by MagicBlock's PER infrastructure at ingress, not by Sable at the app layer. Reference Amendment 03 Section E.
- Update `UnsignedTransactionPayload` → `UnsignedTransactionResponse` to match Amendment 03 shape
- Default `apiUrl` to `https://payments.magicblock.app`

**Testable:** Unit tests against live Payments API (gated by `SABLE_SKIP_LIVE_PAYMENTS_TESTS`).

---

### PR 5 — PER Session Flow Rewrite
**Scope:** Replace mock-based session with real TEE SDK helpers.

- Add `@magicblock-labs/ephemeral-rollups-sdk` and `tweetnacl` dependencies to `packages/sdk`
- Rewrite `SableSession.open()` to use `verifyTeeRpcIntegrity()` + `getAuthToken()` + `Connection.create()`
- Add `TeeIntegrityError` class; abort session if `verifyTeeRpcIntegrity` returns false
- Rewrite `SableSession.getBalance()` to use the authenticated `Connection`'s `getAccountInfo` + IDL decoder
- Remove `SessionExpiredError` (token lifecycle is unknown; rely on auto-retry on 401/403)
- Add auto-retry: catch RPC auth errors, re-run `getAuthToken` once, then surface
- Default `teeHttpUrl` to `https://devnet-tee.magicblock.app`, `teeWsUrl` to `wss://tee.magicblock.app`
- Update `SableClient.openSession()` to match new signature

**Testable:** Unit tests against live `devnet-tee.magicblock.app` (gated by `SABLE_SKIP_LIVE_TEE_TESTS`).

---

### PR 6 — App Wiring Update
**Scope:** Update app to use new constants, router, and live endpoints.

- Update `app/src/utils/env.ts` — add Magic Router default, PER endpoints, Payments API default
- Update `app/src/contexts/WalletContext.tsx` — default to router connection, expose `getIdentity`/`getRoutes` in UI
- Update `BalanceList.tsx` — use correct devnet USDC mint consistently
- Update `app/src/app/api/demo/weather/route.ts` — use devnet USDC mint
- Update `FundModal` / `ActionPanel` — pass `privacy: 'private'` to transfers
- Update Settings page to show connected validator info via `getIdentity`

**Testable:** `pnpm app:dev` builds, `pnpm -r typecheck` passes.

---

### PR 7 — Live Integration Test Suite + Devnet Smoke Test
**Scope:** Run the full integration suite against devnet with live MagicBlock endpoints. This PR runs BEFORE deleting mocks so the mocks remain available as a debugging comparison point.

- Update `tests/integration/live/` specs to use live endpoints
- Add `SABLE_RUN_LIVE_TESTS=1` CI job that runs against devnet
- Run treasury deposit → delegate → agent spawn → auction → x402 flow end-to-end on devnet
- Verify PER balance reads work via TEE session
- Verify Payments API deposit/withdraw work
- Update `PROGRESS.md` — mark Prompt 24 (credentials pass) complete

**Testable:** Live tests pass against devnet.

---

### PR 8 — Delete Mock Services + Update Test Infrastructure
**Scope:** Remove mock services and update all code that references them. Only run AFTER PR 7 (live integration tests) is green.

- Delete `services/payments-api-mock/` directory
- Delete `services/per-mock-middleware/` directory
- Update `scripts/test-integration.sh` — remove mock server startup lines
- Update `tests/integration/helpers/env.ts` — remove mock URL fallbacks, add live endpoint defaults
- Update `.env.example` — remove mock URL entries
- Rewrite `packages/sdk/tests/sdk-payments.test.ts` to hit live endpoint (or skip if gated)
- Rewrite `packages/sdk/tests/sdk-session.test.ts` to hit live TEE (or skip if gated)
- Update `packages/sdk/package.json` — remove mock server dependencies if any

**Testable:** `pnpm -r build` passes. Integration test script runs without mock startup.

---

### PR 9 — Documentation & Final README Update
**Scope:** Update all docs to reflect live-endpoint state.

- Update `README.md` — replace "Pending Prompt 24" links with actual live URLs
- Update `ARCHITECTURE.md` — document permission CPI flow with CpiBuilders, router usage
- Update `docs/x402-integration.md` — remove mock references, add live endpoint guidance
- Create `docs/magicblock-integration.md` — document `DelegateConfig` fields, validator selection, router methods
- Update `.env.example` with final verified values

**Testable:** Doc review. No code changes.
