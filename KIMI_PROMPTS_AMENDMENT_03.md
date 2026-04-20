# Sable — Kimi Prompts Amendment 03 (FINAL)

**Drop this file at the repo root alongside `KIMI_PROMPTS.md` and `KIMI_PROMPTS_AMENDMENT_02.md`.**

**Read this file BEFORE running any numbered prompt.** This amendment is the **final** external-spec reference. Every fact here was copied directly from the MagicBlock docs (verified April 2026). Where this file contradicts Amendment 02 or `KIMI_PROMPTS.md`, **this file wins**. Everything in those files not contradicted here still stands.

After reading this file, Kimi has everything needed to ship Sable through Prompt 23 without consulting external docs again — except for one small `cargo doc` check in Prompt 2 (documented below).

---

## How this file supersedes Amendment 02

| Topic | Amendment 02 status | This file |
|---|---|---|
| Permission Program ID | AMBIGUOUS (2 candidates) | **CONFIRMED** `ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1` |
| ER validator identities | missing | all 4 regions × 2 networks documented |
| Private Payments API field names | wrong (`from`/`to`/`visibility`) | correct (`owner`/`destination`/`privacy`) |
| PER session flow | described as needing mock middleware | SDK helpers `verifyTeeRpcIntegrity` + `getAuthToken` handle it |
| Magic Router | not mentioned | primary SDK RPC endpoint (auto-routes) |
| Permission account CPIs | one vague helper | 5 distinct CpiBuilders verified |
| PER permission semantics | described as "owner debit / anyone credit" | access-control = read gating; debit control stays in program signer checks |

---

## Global rule additions

Append to the Meta-Rules block Kimi loads every session:

```
15. AMENDMENT 03 IS GROUND TRUTH. If this file says something, that's what
    ships. If an older file contradicts it, this file wins.

16. PERMISSION ACCOUNT ≠ BALANCE ACCOUNT. They are two separate on-chain
    accounts. The balance PDA (UserBalance, AgentBalance, TaskEscrow) holds
    amounts. The permission PDA holds access rules. Every balance PDA gets
    a sibling permission PDA. Delegation happens TWICE: once for the balance
    (via the ER SDK's delegate helpers), once for the permission (via
    DelegatePermissionCpiBuilder). Do not skip either.

17. ROUTER FOR CLIENT, DIRECT URLs FOR DELEGATION. The SDK's default RPC
    endpoint is the Magic Router. Program-level DelegateConfig still needs
    a specific ER validator pubkey — the router is not a validator.
```

---

## Section A — Verified facts

### A.1 — Endpoints

```
Magic Router (primary SDK RPC):
  Devnet:  https://devnet-router.magicblock.app
  Mainnet: https://router.magicblock.app

Regional ER (use only when a specific region is required):
  Devnet:
    Asia:  https://devnet-as.magicblock.app/
    EU:    https://devnet-eu.magicblock.app/
    US:    https://devnet-us.magicblock.app/
    TEE:   https://devnet-tee.magicblock.app/
  Mainnet:
    Asia:  https://as.magicblock.app/
    EU:    https://eu.magicblock.app/
    US:    https://us.magicblock.app/
    TEE:   https://mainnet-tee.magicblock.app/

PER WebSocket:
  Devnet:  wss://tee.magicblock.app
  (Auth token appended to URL: wss://tee.magicblock.app?token={token})

Private Payments API:
  Base:    https://payments.magicblock.app
  Reference: https://payments.magicblock.app/reference

Solana base layer (for cross-reference):
  Devnet:  https://api.devnet.solana.com
```

### A.2 — Program IDs (all confirmed)

```rust
// Delegation program (used by both ER and PER)
pub const DELEGATION_PROGRAM_ID: Pubkey =
    pubkey!("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");

// Permission program (PER access control)
pub const PERMISSION_PROGRAM_ID: Pubkey =
    pubkey!("ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1");

// Local ER validator identity (for mb-test-validator)
pub const LOCAL_ER_VALIDATOR_ID: Pubkey =
    pubkey!("mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev");
```

### A.3 — ER validator identities (region-specific, REQUIRED for DelegateConfig.validator)

Validator pubkeys are identical across mainnet and devnet for the same region — only the URL differs.

```rust
pub const ER_VALIDATOR_AS: Pubkey =
    pubkey!("MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57");

pub const ER_VALIDATOR_EU: Pubkey =
    pubkey!("MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e");

pub const ER_VALIDATOR_US: Pubkey =
    pubkey!("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd");

pub const ER_VALIDATOR_TEE: Pubkey =
    pubkey!("MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo");
```

Sable defaults to `ER_VALIDATOR_TEE` because the whole project is privacy-first. All delegations go to TEE.

### A.4 — Token mints

```
Devnet USDC:  4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
Mainnet USDC: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
wSOL:         So11111111111111111111111111111111111111112
```

### A.5 — Rust crate and SDK requirements

```toml
# programs/sable/Cargo.toml
[dependencies]
anchor-lang = "0.32.1"
# Permission program requires SDK >= 0.8.0
ephemeral-rollups-sdk = { version = "0.8", features = ["anchor"] }
```

### A.6 — Rust imports (verified from docs)

```rust
// ER delegation (for balance PDAs)
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::{commit_accounts, commit_and_undelegate_accounts};

// Permission program CPI (for permission PDAs)
use ephemeral_rollups_sdk::access_control::{
    instructions::{
        CreatePermissionCpiBuilder,
        DelegatePermissionCpiBuilder,
        UpdatePermissionCpiBuilder,
        CommitAndUndelegatePermissionCpiBuilder,
        ClosePermissionCpiBuilder,
    },
    structs::{
        Member,
        MembersArgs,
        AUTHORITY_FLAG,
        TX_LOGS_FLAG,
        TX_BALANCES_FLAG,
        TX_MESSAGE_FLAG,
        ACCOUNT_SIGNATURES_FLAG,
    },
};
```

### A.7 — TypeScript imports (verified)

```ts
import {
  verifyTeeRpcIntegrity,
  getAuthToken,
} from '@magicblock-labs/ephemeral-rollups-sdk';

import {
  Connection,
  DELEGATION_PROGRAM_ID,
  delegationRecordPdaFromDelegatedAccount,
  delegationMetadataPdaFromDelegatedAccount,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
  MAGIC_CONTEXT_ID,
  MAGIC_PROGRAM_ID,
} from '@magicblock-labs/ephemeral-rollups-kit';

// For session signing (web3.js contexts)
import * as nacl from 'tweetnacl';
```

### A.8 — Private Payments API schemas (verified)

Base URL: `https://payments.magicblock.app`. Unauthenticated.

#### `POST /v1/spl/deposit` — Solana base → ER

Request:
```ts
{
  owner: string;              // REQUIRED — base58 pubkey
  amount: number;             // REQUIRED — raw base units, >= 1
  cluster?: string;           // optional — "devnet" | "mainnet-beta"
  mint?: string;              // optional — defaults to USDC for cluster
  validator?: string;         // optional — ER validator pubkey
  initIfMissing?: boolean;    // optional
  initVaultIfMissing?: boolean; // optional
}
```

Response (200):
```ts
{
  kind: string;                // "deposit"
  transactionBase64: string;   // REQUIRED
  requiredSigners: string[];   // REQUIRED
  sendTo?: string;             // optional — "base" | "ephemeral"
  recentBlockhash?: string;
  lastValidBlockHeight?: number;
  instructionCount?: number;
  validator?: string;
}
```

#### `POST /v1/spl/transfer` — base/ER → base/ER

Request:
```ts
{
  owner: string;              // REQUIRED
  destination: string;        // REQUIRED — NOT "to"
  amount: number;             // REQUIRED, >= 1
  cluster?: string;
  mint?: string;
  privacy?: string;           // "public" | "private" (values inferred; API accepts string)
  validator?: string;
  memo?: string;
}
```

Response: same shape as deposit.

**Sable's `privacy` handling:** pass `"private"` by default. If the API rejects with a 400 citing an unknown value, fall back to `"public"` and log. The adapter type accepts the union `"public" | "private" | string` to stay forward-compatible.

#### `POST /v1/spl/withdraw` — ER → base

Request:
```ts
{
  owner: string;              // REQUIRED
  amount: number;             // REQUIRED, >= 1
  cluster?: string;
  mint?: string;
  validator?: string;
}
```

Response: same shape as deposit.

#### `POST /v1/spl/initialize-mint` — initializes validator-scoped transfer queue

Request:
```ts
{
  owner: string;              // REQUIRED
  mint: string;               // REQUIRED
  cluster?: string;
  validator?: string;
}
```

Response: same shape as deposit.

#### `GET /v1/spl/balance` — base-chain balance

Query params:
```
owner=<string>       REQUIRED
cluster=<string>     optional
mint=<string>        optional
```

Response (200):
```ts
{
  balance: string;            // as string, not number — parse with BN
  decimals: number;
}
```

#### `GET /v1/spl/private-balance` — ER balance

Same query params and response shape as `balance`, but reads from the ER side.

#### `GET /v1/spl/is-mint-initialized`

Query params:
```
mint=<string>        REQUIRED
cluster=<string>     optional
validator=<string>   optional
```

Response (200):
```ts
{
  initialized: boolean;       // REQUIRED
}
```

#### `GET /health`

Response (200):
```ts
{
  status: "ok";
}
```

#### `POST /mcp` — JSON-RPC 2.0 Streamable HTTP MCP endpoint

Generic JSON-RPC 2.0. Sable does not use this endpoint.

### A.9 — Magic Router JSON-RPC methods

All methods follow standard JSON-RPC 2.0. Sable's SDK uses the router as its default connection endpoint.

**Standard Solana methods** (implemented on router):
- `getAccountInfo` — standard shape
- `getBalance`
- `getSignatureStatuses`
- (and most others — treat as full Solana JSON-RPC compatibility)

**Router-specific methods:**

#### `getRoutes`

Returns all ER validators the router knows about, with FQDNs, block times, country codes.

Use in Sable: populate a dropdown in the Settings view for manual region selection. Default is "Auto" (let router pick).

#### `getIdentity`

Returns the identity of the ER validator the router currently routes to (for the caller's context).

Use in Sable: display "connected validator" in the Treasury view's status bar.

#### `getBlockhashForAccounts`

Takes `[[pubkey1, pubkey2, ...]]` (1–100 accounts). Returns a blockhash valid on the ER node that owns those delegated accounts.

Use in Sable: **every ER-bound transaction** builds its blockhash via this method, passing the list of accounts the tx will touch. This is non-negotiable — `getLatestBlockhash` from base layer returns a stale blockhash for ER txs.

#### `getSignatureStatuses`

Takes `[[sig1, sig2, ...]]`. Returns statuses routed to the correct ER node where the tx landed.

Use in Sable: tx confirmation polling.

#### `getDelegationStatus`

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

Use in Sable: **replaces** the custom delegation-check code Amendment 02 planned. The SDK's `getDelegationStatus(pda)` method is a thin wrapper over this RPC call.

When `isDelegated === true`, Sable routes subsequent reads/writes through the returned `fqdn` (if Sable wants region-specific targeting) or continues using the router (recommended).

### A.10 — PER access-control model (corrected mental model)

From the Access Control doc:

- **Default behavior:** when a permission account is created and members list is empty or null, ONLY the owner of the permissioned account can modify it. Fully private. This is what Sable wants by default.

- **Default authority:** "the owner of the permissioned account is added as permission authority" automatically. Sable doesn't need to explicitly add the user pubkey as an AUTHORITY member — the CPI caller (the Sable program) is the authority by default.

- **Public mode:** setting `members: None` via `UpdatePermissionCpiBuilder` makes the account publicly visible. Sable uses this during commit-back transitions where the account must briefly become readable from base layer.

- **Access control = read control.** The flags (TX_LOGS, TX_BALANCES, TX_MESSAGE, ACCOUNT_SIGNATURES) gate READ access to different parts of transaction data. Write authorization stays in the owning program's signer checks. For Sable:
  - `UserBalance.amount` is hidden from anyone without TX_BALANCES/ACCOUNT_SIGNATURES flags on the permission account
  - Only signers matching `UserState.owner` can call `withdraw` — enforced by the Sable program's `#[account(has_one = owner)]` constraints, not by PER
  - Anyone can call `deposit` because deposits debit the caller's own SPL account, not the vault

### A.11 — PER session flow (verified TypeScript)

```ts
import {
  verifyTeeRpcIntegrity,
  getAuthToken,
} from '@magicblock-labs/ephemeral-rollups-sdk';
import { Connection } from '@magicblock-labs/ephemeral-rollups-kit';
import * as nacl from 'tweetnacl';

const teeUrl = 'https://devnet-tee.magicblock.app';
const teeWsUrl = 'wss://tee.magicblock.app';

// Step 1: verify TEE integrity (Intel TDX attestation). Returns boolean.
// Sable MUST abort session if this returns false — anti-MITM defense.
const isVerified = await verifyTeeRpcIntegrity(teeUrl);
if (!isVerified) throw new TeeIntegrityError('TEE attestation failed');

// Step 2: sign a challenge, receive an auth token.
const authToken = await getAuthToken(
  teeUrl,
  userPubkey,
  (message: Uint8Array) =>
    Promise.resolve(nacl.sign.detached(message, userSecretKey)),
);

// For wallet-adapter contexts, replace the third arg with a signing function
// that calls wallet.signMessage(message).

// Step 3: create an authenticated connection.
const teeUserUrl = `${teeUrl}?token=${authToken.token}`;
const teeUserWsUrl = `${teeWsUrl}?token=${authToken.token}`;
const ephemeralConnection = await Connection.create(teeUserUrl, teeUserWsUrl);
```

**Token lifecycle assumption (until documented otherwise):**
- Tokens are short-lived; no refresh endpoint exists.
- Sable catches RPC auth errors and transparently re-runs `getAuthToken` once before surfacing the error to the caller.
- `SableSession.expiry` field: set to `null` in the type (unknown), but the SDK re-verifies integrity and re-fetches a token if a call fails with 401/403.

---

## Section B — Per-prompt amendments (corrections to Amendment 02)

### Prompt 2 — Real ER delegation CPI

Amendment 02 had the skeleton right. One correction: **there is also a permission account to delegate** if the balance PDA being delegated has a permission account (which it will, after Prompt 11).

For Prompt 2, only balance delegation is needed (permissions come in Prompt 11). Keep Prompt 2 scope as originally written. In Prompt 11, extend the delegation instruction to ALSO call `DelegatePermissionCpiBuilder` for each balance's permission PDA.

Before writing the CPI, run:

```bash
cargo add ephemeral-rollups-sdk --features anchor
cargo doc --open --package ephemeral-rollups-sdk
```

Read the exact `DelegateConfig` struct definition from the generated docs. The docs page only shows `validator` field plus `..Default::default()`. Document every field discovered in `docs/magicblock-integration.md` and set sensible Sable defaults. Common field to expect: `commit_frequency_ms`.

### Prompt 11 — PER permissions (REPLACE Amendment 02 entirely)

Amendment 02's design is obsolete. Replace with this:

**Scope:**

1. **Create a permission PDA alongside every balance PDA.**
   - In `complete_setup`, `add_mint`, `fund_agent` (first time), `create_task` — after initializing the balance PDA, call `CreatePermissionCpiBuilder` for that balance.
   - Pass `members: Some(vec![])` (empty member list) to trigger the "fully private, only owner can modify" default.
   - The Sable program is the CPI caller, so it signs with the balance PDA's seeds.

2. **PDA seeds for permission accounts:** `["permission", balance_pda.key().as_ref()]`. Exported as `derivePermission(balancePda)` helper in the SDK.

3. **Extend the delegation instruction** (`delegate_user_state_and_balances`) to ALSO call `DelegatePermissionCpiBuilder` for each balance's permission PDA, with `validator = ER_VALIDATOR_TEE`.

4. **Extend the commit+undelegate instruction** to ALSO call `CommitAndUndelegatePermissionCpiBuilder` for each permission PDA.

5. **Add `update_per_permissions` instruction.** Root-user signed. Calls `UpdatePermissionCpiBuilder` to add/remove members. Used for:
   - Adding auditor pubkey with `TX_BALANCES_FLAG`
   - Revoking an auditor
   - Making a balance temporarily public via `members: None`

6. **Add `close_per_permissions` instruction.** Only callable when the balance PDA is being closed (e.g., defund-to-zero then close). Calls `ClosePermissionCpiBuilder`.

**Code skeleton for `init_per_permissions` CPI** (inline inside `complete_setup` etc.):

```rust
use ephemeral_rollups_sdk::access_control::{
    instructions::CreatePermissionCpiBuilder,
    structs::MembersArgs,
};

let seed_refs: &[&[u8]] = &[
    b"user_balance",
    owner.key().as_ref(),
    mint.key().as_ref(),
    &[user_balance_bump],
];

CreatePermissionCpiBuilder::new(&ctx.accounts.permission_program)
    .permissioned_account(&ctx.accounts.user_balance.to_account_info())
    .permission(&ctx.accounts.permission.to_account_info())
    .payer(&ctx.accounts.payer)
    .system_program(&ctx.accounts.system_program)
    .args(MembersArgs { members: Some(vec![]) })  // empty = fully private, owner-only
    .invoke_signed(&[seed_refs])?;
```

**Tests:**
- Assert permission PDA exists after `complete_setup` with expected default state.
- Third-party cannot read `UserBalance.amount` while delegated to PER without being in the members list. Integration test uses two user keypairs against live `https://devnet-tee.magicblock.app`.
- `update_per_permissions` rejects non-authority signers.

### Prompt 12 — SDK endpoints

Set the SDK's default connection URL to the Magic Router:

```ts
// packages/sdk/src/client.ts
const DEFAULT_ROUTER_URL = 'https://devnet-router.magicblock.app';
```

SDK's connection instance uses the router for reads and standard writes. For TEE-only reads (private balances), the SDK opens a separate `SableSession` (Prompt 15) and uses the session's connection for that subset.

### Prompt 15 — PER sessions (SIMPLIFY based on A.11)

Drop the mock middleware plan entirely. Use the real SDK helpers as shown in A.11. No local mock service is created. Tests hit `https://devnet-tee.magicblock.app` directly (permissionless).

**Amended `SableSession` class:**

```ts
export class SableSession {
  constructor(
    private readonly token: string,
    public readonly connection: Connection,
  ) {}

  static async open(params: {
    signer: Keypair | { pubkey: PublicKey, sign: (m: Uint8Array) => Promise<Uint8Array> };
    teeHttpUrl?: string;
    teeWsUrl?: string;
  }): Promise<SableSession> {
    const teeUrl = params.teeHttpUrl ?? MAGICBLOCK_ENDPOINTS.perDevnetHttp;
    const teeWsUrl = params.teeWsUrl ?? MAGICBLOCK_ENDPOINTS.perDevnetWs;

    const isVerified = await verifyTeeRpcIntegrity(teeUrl);
    if (!isVerified) throw new TeeIntegrityError();

    const signFn = params.signer instanceof Keypair
      ? (m: Uint8Array) => Promise.resolve(nacl.sign.detached(m, params.signer.secretKey))
      : params.signer.sign;
    const pubkey = params.signer instanceof Keypair
      ? params.signer.publicKey
      : params.signer.pubkey;

    const authToken = await getAuthToken(teeUrl, pubkey, signFn);

    const connection = await Connection.create(
      `${teeUrl}?token=${authToken.token}`,
      `${teeWsUrl}?token=${authToken.token}`,
    );

    return new SableSession(authToken.token, connection);
  }

  async getBalance(balancePda: PublicKey): Promise<BN> {
    const info = await this.connection.getAccountInfo(balancePda);
    if (!info) throw new Error('Balance account not found');
    return decodeBalanceAmount(info.data);  // use IDL-derived decoder
  }
}
```

### Prompt 16 — Private Payments API adapter (REPLACE Amendment 02's schemas)

Use the schemas in A.8 above. Drop the speculative fields Amendment 02 listed (`split`, `fromBalance`, `toBalance`, `minDelayMs`, `maxDelayMs`) — they are NOT in the documented API.

TypeScript types to emit in `packages/sdk/src/payments/types.ts`:

```ts
export type DepositRequest = {
  owner: string;
  amount: number;
  cluster?: string;
  mint?: string;
  validator?: string;
  initIfMissing?: boolean;
  initVaultIfMissing?: boolean;
};

export type TransferRequest = {
  owner: string;
  destination: string;
  amount: number;
  cluster?: string;
  mint?: string;
  privacy?: 'public' | 'private' | string;
  validator?: string;
  memo?: string;
};

export type WithdrawRequest = {
  owner: string;
  amount: number;
  cluster?: string;
  mint?: string;
  validator?: string;
};

export type InitializeMintRequest = {
  owner: string;
  mint: string;
  cluster?: string;
  validator?: string;
};

export type UnsignedTransactionResponse = {
  kind: string;
  transactionBase64: string;
  requiredSigners: string[];
  sendTo?: string;
  recentBlockhash?: string;
  lastValidBlockHeight?: number;
  instructionCount?: number;
  validator?: string;
};

export type BalanceResponse = {
  balance: string;    // parse with new BN(r.balance)
  decimals: number;
};

export type IsMintInitializedResponse = {
  initialized: boolean;
};
```

---

## Section C — Final `.env.example`

```bash
# ─── Deployer (Prompt 3 and Prompt 24 only) ───
SABLE_DEPLOYER_KEYPAIR=/absolute/path/to/sable-deployer.json

# ─── Solana base layer ───
SABLE_SOLANA_RPC=https://api.devnet.solana.com

# ─── MagicBlock endpoints (all public, no auth) ───
SABLE_MAGIC_ROUTER=https://devnet-router.magicblock.app
SABLE_PER_HTTP=https://devnet-tee.magicblock.app
SABLE_PER_WS=wss://tee.magicblock.app
SABLE_PAYMENTS_API=https://payments.magicblock.app

# ─── Program (filled at Prompt 3) ───
SABLE_PROGRAM_ID=<set after keygen>

# ─── ER validator for delegation (default: TEE) ───
SABLE_ER_VALIDATOR=MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo

# ─── Token mints ───
SABLE_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
SABLE_WSOL_MINT=So11111111111111111111111111111111111111112

# ─── x402 facilitator ───
SABLE_X402_FACILITATOR_URL=http://localhost:3030
SABLE_X402_DEFAULT_RECEIVER=<Sable UserState or AgentState pubkey>
SABLE_X402_MIN_PRICE_USDC=0.001

# ─── Test toggles ───
SABLE_SKIP_LIVE_TEE_TESTS=0
SABLE_SKIP_LIVE_PAYMENTS_TESTS=0

# ─── App (NEXT_PUBLIC_ for client-side) ───
NEXT_PUBLIC_SABLE_PROGRAM_ID=<same as SABLE_PROGRAM_ID>
NEXT_PUBLIC_SABLE_MAGIC_ROUTER=https://devnet-router.magicblock.app
NEXT_PUBLIC_SABLE_PER_HTTP=https://devnet-tee.magicblock.app
NEXT_PUBLIC_SABLE_PER_WS=wss://tee.magicblock.app
NEXT_PUBLIC_SABLE_PAYMENTS_API=https://payments.magicblock.app
NEXT_PUBLIC_SABLE_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
NEXT_PUBLIC_SABLE_X402_FACILITATOR_URL=http://localhost:3030
```

No API keys. Nothing gated. Every value public.

---

## Section D — The one remaining unknown

**`DelegateConfig` full field list.** The docs show `validator` and `..Default::default()` but never enumerate all fields. Kimi resolves this during Prompt 2 by running `cargo doc --open --package ephemeral-rollups-sdk`, reading the struct, and documenting every field in `docs/magicblock-integration.md`.

Likely fields based on docs prose (not confirmed): `commit_frequency_ms`. Sable defaults to 60_000 (1 min).

Every other fact in this file is **verified**.

---

## Section E — Compliance claims (final wording)

From the PER Onchain Privacy doc, exact verified language:

> *"MagicBlock's Private Ephemeral Rollup enforces compliance based on node-level IP geofencing, OFAC-sanction list and restricted jurisdictions at ingress, before any transaction is accepted or executed."*

**Sable's submission may say (verbatim paraphrase):**

- "Sable runs on MagicBlock Private Ephemeral Rollups. MagicBlock enforces compliance at the PER node level: IP geofencing, OFAC sanction screening, and restricted-jurisdiction blocking happen at ingress — before transactions are accepted or executed."
- "Sable inherits this infrastructure-level compliance layer. Application-layer KYC remains the responsibility of future production deployments."

**Sable MUST NOT say:**
- "Sable is OFAC-compliant."
- "Sable is AML-compliant."
- "Sable handles compliance."

The nuance is: MagicBlock's infra screens txs. Sable doesn't. Claims about the app as a whole being compliant are overreach.

---

## Section F — One-line summary for Kimi

**Amendment 03 is the final external-spec reference. Every endpoint, program ID, validator identity, API schema, and Rust import is verified. The only `cargo doc` check needed is `DelegateConfig` fields during Prompt 2. Everything else is ship-ready. Run the prompts.**
