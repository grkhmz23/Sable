# Sable — Kimi Execution Plan

**Drop this file at the repo root.** Run prompts **in order**, one per Kimi session. Each prompt is self-contained, ends with a verifiable done-checklist, and must leave the repo in a working state before the next prompt starts.

**Project:** Sable — private programmable money for AI agents on Solana, built on MagicBlock ER + PER + Private Payments API.

**Target:** Colosseum Privacy Track (MagicBlock / ST MY / SNS), $5k prize pool.

**Judging axes:** Technology 40% · Impact 30% · Creativity & UX 30%.

---

## Table of Contents

- [Meta-Rules (paste at the start of every Kimi session)](#meta-rules)
- [Prompt 1 — Rebrand, directory restructure, clean dead code](#prompt-1)
- [Prompt 2 — Real ER delegation CPI (replace event emission)](#prompt-2)
- [Prompt 3 — Declare real program ID, deploy skeleton to devnet](#prompt-3)
- [Prompt 4 — AgentState PDA + spawn/close agent instructions](#prompt-4)
- [Prompt 5 — Spend policy engine](#prompt-5)
- [Prompt 6 — AgentBalance + agent transfer instructions](#prompt-6)
- [Prompt 7 — Parent control: freeze, revoke, update_policy](#prompt-7)
- [Prompt 8 — Task PDA + create_task / cancel_task](#prompt-8)
- [Prompt 9 — Bid PDA + commit_bid (sealed commit phase)](#prompt-9)
- [Prompt 10 — reveal_bid + settle_auction](#prompt-10)
- [Prompt 11 — PER permission metadata accounts](#prompt-11)
- [Prompt 12 — SDK rename, IDL regen, module restructure](#prompt-12)
- [Prompt 13 — SDK: agent methods](#prompt-13)
- [Prompt 14 — SDK: auction methods](#prompt-14)
- [Prompt 15 — SDK: PER session key flow](#prompt-15)
- [Prompt 16 — SDK: Private Payments API adapter](#prompt-16)
- [Prompt 17 — x402 facilitator service](#prompt-17)
- [Prompt 18 — App rebrand + delete old wallet-centric UI](#prompt-18)
- [Prompt 19 — App: Treasury console (/app)](#prompt-19)
- [Prompt 20 — App: Agent dashboard (/app/agents)](#prompt-20)
- [Prompt 21 — App: Auction marketplace (/app/tasks)](#prompt-21)
- [Prompt 22 — App: x402 live demo (/app/x402)](#prompt-22)
- [Prompt 23 — Full integration test suite](#prompt-23)
- [Prompt 24 — Devnet deployment + MagicBlock testing endpoint](#prompt-24)
- [Prompt 25 — README, docs, demo video script](#prompt-25)
- [Pacing & Critical Path](#pacing)

---

<a id="meta-rules"></a>
## Meta-Rules

**Paste this block into every new Kimi session before running a numbered prompt.**

```
You are working inside the Sable monorepo. Follow these rules on every task:

1. Read /HACKATHON.md and /ARCHITECTURE.md before making changes in a fresh session.
   Read /PROGRESS.md to see what has already shipped.

2. No placeholders, no TODOs, no stub returns, no "implement later", no empty
   functions. Every changed file must compile. Every feature must end with tests
   or a done-check command that proves it works.

3. When you need an external API (MagicBlock SDK, Private Payments API, x402),
   read the current docs before writing code. Do not invent endpoints or SDK
   method names. Primary references:
   - https://docs.magicblock.gg
   - https://github.com/magicblock-labs/ephemeral-rollups-sdk (v0.8.8+)
   - https://github.com/magicblock-labs/magicblock-engine-examples
   - https://github.com/magicblock-labs/private-payments-demo
   - https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/api-reference/per/introduction
   - https://www.x402.org (x402 protocol spec)

4. Keep secrets in env. Add required keys to .env.example. Never hardcode.

5. Match existing repo conventions — pnpm monorepo, Anchor 0.32.1, Rust 1.85.0,
   Solana 2.3.13, Node 24. If a conflict forces a version bump, document it
   in PROGRESS.md with the reason.

6. After each prompt, commit with the message "sable: <prompt title>" and update
   /PROGRESS.md with what was completed and what was verified (with commit SHA).

7. The CI scanner at .github/workflows/ci.yml fails on "TODO:", "FIXME:",
   "PLACEHOLDER", "HACK:", "stub", "mock" (in non-test files). Do not introduce
   any of these strings in production paths.

8. If a prompt is ambiguous or a required input is missing, STOP, list the exact
   inputs you need, and wait. Do not fabricate.

9. If a prompt requires external access (MagicBlock testing endpoint, deployer
   keypair, API key), surface that upfront and do the work that doesn't depend
   on it first. Then wait for the input.

Run each numbered prompt end-to-end before starting the next.
```

---

<a id="prompt-1"></a>
## Prompt 1 — Rebrand, directory restructure, clean dead code

```
GOAL
Rename L2Concept V1 to Sable. Delete all event-based delegation scaffolding
that blocks the real MagicBlock integration. Create architecture docs.

CONTEXT
The project is pivoting from a generic multi-mint wallet to "Sable" — a private
agent-economy money layer: hierarchical agent treasuries, x402 payments, sealed-
bid auctions, all on MagicBlock PER. This prompt only handles the cosmetic and
cleanup layer. No logic changes to instructions yet.

CHANGES

Rename everything:
- programs/l2conceptv1/  →  programs/sable/
- Cargo package "l2conceptv1"  →  "sable"
- packages/sdk/ npm name: @l2conceptv1/sdk  →  @sable/sdk
- packages/common/ npm name: @l2conceptv1/common  →  @sable/common
- Workspace name in package.json and pnpm-workspace.yaml
- All README.md references, all import paths, all app/src references
- app/package.json name → "sable-app"

Delete from programs/sable/src/:
- All event emission related to delegation in magicblock.rs: RequestDelegateEvent,
  RequestCommitUndelegateEvent, the msg!() logging for MagicBlock indexer,
  and the associated event definitions in events.rs.
- Replace the two delegation instruction handlers
  (delegate_user_state_and_balances, commit_and_undelegate_user_state_and_balances)
  with bodies that return Err(SableError::NotYetImplemented) and add that
  error variant. This is NOT a placeholder — it is a real runtime error that
  callers get, and it will be replaced with real CPI in Prompt 2. The CI
  scanner allows this because it's real Rust code with a real return value.

Delete from app/src/:
- The "router" mode in WalletContext — leave only "solana" and "er". Delete any
  UI toggle entries that reference router mode.
- The CompleteSetupModal's "multi-mint wallet" copy. Keep the component logic
  but retheme copy to "Create Treasury".

Create docs:
- /HACKATHON.md — paste the full Privacy Track brief (see below), plus a
  one-page "why Sable wins" section (private payments + private DeFi auctions +
  agentic commerce, uses ER + PER + Private Payments API).
- /ARCHITECTURE.md — high-level diagram + component list. At this stage it
  describes the *target* architecture, not what's in the code yet. Include:
  Config → UserState → AgentState (tree) → UserBalance/AgentBalance → Task → Bid,
  with vault authority + PER permission accounts as cross-cutting concerns.
- /PROGRESS.md — table with rows for prompts 1–25, columns: status, commit sha,
  notes. Mark prompt 1 done when this PR lands.

Replace the dummy program ID L2CnccKT1qHNS1wJ7p3wJ3JhCX5s4J5wT5x3h5mH2j1
everywhere with a string `SABLE_PROGRAM_ID_TBD` so grep finds all callsites.
Prompt 3 will replace this with a real keypair.

HACKATHON.md content — paste verbatim:

  # MagicBlock Privacy Track — Colosseum Hackathon

  Privacy is the primitive for the next generation of on-chain applications —
  especially in a world of autonomous agents. This track challenges you to
  build privacy-first systems on Solana, powered by MagicBlock's (Private)
  Ephemeral Rollups & Payment API:

  - Ephemeral Rollup (ER)
  - Private Ephemeral Rollup (PER)
  - Private Payments API

  Focus areas:
  - Private payments & shielded transactions
  - Private DeFi (Auctions, Lending, Trading primitives)
  - Agentic commerce, Agent-to-agent, x402 APIs, MPP

  Prizes: 1st $2,500 · 2nd $1,500 · 3rd $1,000

  Judging:
  - Technology 40%: effective use of ER/PER/Payments API, working demo,
    architecture
  - Impact 30%: real-world problem, market need, adoption potential
  - Creativity & UX 30%: novel primitives, smooth UX, clarity

  ## Why Sable Wins

  Sable is a private programmable money layer for AI agents. It directly hits
  all three focus areas:

  - Private payments: every agent-to-agent transfer runs inside PER, balances
    are encrypted at the account level via PER permission metadata.
  - Private DeFi: sealed-bid agent auctions — a native private primitive.
  - Agentic commerce: hierarchical agent treasuries with on-chain spend
    policies + an x402 facilitator for pay-per-API commerce.

  MagicBlock primitives used:
  - ER for sub-50ms internal transfers and auction phases
  - PER for account-level READ/WRITE permissions on balances
  - Private Payments API for compliant USDC on/off-ramp

DO NOT
- Change any instruction logic.
- Add new features.
- Integrate ephemeral-rollups-sdk yet.
- Remove the scan-placeholders / scan-secrets CI jobs.

DONE CHECKLIST
- [ ] `pnpm install` succeeds from clean state
- [ ] `cd programs/sable && cargo build-sbf` succeeds
- [ ] `pnpm -r build` succeeds
- [ ] `pnpm typecheck` succeeds
- [ ] `grep -ri "l2concept" --exclude-dir=.git --exclude-dir=node_modules .`
      returns only intentional history references (e.g., CHANGELOG)
- [ ] `grep -r "L2CnccKT1q" . --exclude-dir=.git` returns zero matches
- [ ] HACKATHON.md, ARCHITECTURE.md, PROGRESS.md exist and are filled in
- [ ] Git diff shows no logic changes to instructions, only renames + deletions
      + the two NotYetImplemented returns
- [ ] Commit message: "sable: prompt 1 — rebrand and cleanup"
```

---

<a id="prompt-2"></a>
## Prompt 2 — Real ER delegation CPI (replace event emission)

```
GOAL
Wire real ephemeral-rollups-sdk CPI calls into delegate_user_state_and_balances
and commit_and_undelegate_user_state_and_balances. Kill the last event-based
code paths.

REFERENCES (read before coding)
- https://github.com/magicblock-labs/ephemeral-rollups-sdk (Rust crate, v0.8.8+)
- https://github.com/magicblock-labs/magicblock-engine-examples/tree/main/anchor-counter
- https://docs.magicblock.gg (search "delegate_pda", "commit_and_undelegate",
  "#[ephemeral]", "DelegateConfig")

CHANGES

programs/sable/Cargo.toml:
- Add dependencies:
    ephemeral-rollups-sdk = "0.8.8"  (use latest on crates.io)
- If there is a known feature flag for Anchor 0.32 compatibility, enable it
  per the SDK README.

programs/sable/src/lib.rs:
- Add imports from ephemeral_rollups_sdk per the current crate (verify the
  module paths — the README shows something like
  `use ephemeral_rollups_sdk::anchor::{delegate, commit, ephemeral};`).
- Add the `#[ephemeral]` attribute to the `#[program] pub mod sable { ... }`
  module.
- Replace the NotYetImplemented bodies in the two delegation instructions.

delegate_user_state_and_balances:
- Build delegation accounts per the SDK's required layout: payer, delegate
  account, owner program (self), buffer, delegation record, delegation metadata,
  delegation program, system program.
- Call the SDK's delegate helper for UserState with seeds
  [USER_STATE_SEED, owner.key().as_ref()] and DelegateConfig {
    commit_frequency_ms: 60_000,  // 1 minute default
    validator: None,               // allow any validator for now
  }.
- Loop over each UserBalance PDA supplied via remaining_accounts. For each one,
  invoke the delegate helper with seeds [USER_BALANCE_SEED, owner.key().as_ref(),
  mint.key().as_ref()] and the same DelegateConfig.
- Enforce a hard max of 10 balances per delegation call (existing constant).

commit_and_undelegate_user_state_and_balances:
- Call the SDK's commit_and_undelegate helper with the UserState + every
  UserBalance PDA as the accounts list.
- On success, the accounts return to being owned by the Sable program on L1.

Remove:
- programs/sable/src/magicblock.rs entirely if its only remaining purpose was
  event emission. If it has non-event helpers (e.g., seed constants), move
  those into state.rs and delete magicblock.rs.
- Any residual references in SDK, app, tests to the deleted events.

error.rs:
- Remove NotYetImplemented (no longer needed).
- Add specific error variants: DelegationFailed, CommitFailed, NotDelegated,
  AlreadyDelegated, TooManyBalancesForDelegation.

Anchor.toml / scripts/install-toolchain.sh:
- If the SDK requires a newer Solana CLI, bump it. Document in PROGRESS.md.

DO NOT
- Add any new business logic to the two instructions beyond the CPI.
- Emit any RequestDelegate or RequestCommitUndelegate events. They're gone.
- Keep any fallback "event-only" code path.

DONE CHECKLIST
- [ ] `cargo build-sbf` from programs/sable/ succeeds
- [ ] `grep -r "RequestDelegateEvent\|RequestCommitUndelegateEvent" programs/`
      returns zero
- [ ] `grep -r "NotYetImplemented" .` returns zero
- [ ] The two instruction account structs include the delegation program +
      owner program + system program per the SDK's requirements
- [ ] Anchor tests: write tests/delegation.ts that (a) joins a user,
      (b) delegates UserState via CPI, (c) asserts the account owner is
      now the MagicBlock delegation program. The test must run against a local
      validator with the delegation program cloned in (see example repo for the
      --clone-upgradeable-program flag).
- [ ] PROGRESS.md updated
- [ ] Commit: "sable: prompt 2 — real ER delegation CPI"
```

---

<a id="prompt-3"></a>
## Prompt 3 — Declare real program ID, deploy skeleton to devnet

```
GOAL
Replace the SABLE_PROGRAM_ID_TBD string with a freshly generated program
keypair. Deploy the current program skeleton to devnet so we have a live
anchor point. Every subsequent prompt will redeploy.

CHANGES

Generate keypair:
- Run `solana-keygen grind --starts-with Sab1e:1` (or similar) to get a vanity
  keypair that starts with "Sable" or "Sab1e". Save the keypair to
  /keys/sable-program-keypair.json and gitignore /keys/.
- Echo the pubkey into Anchor.toml under [programs.devnet] and
  [programs.localnet].
- Update `declare_id!("...")` in programs/sable/src/lib.rs.

Add deploy scripts in scripts/:
- deploy-devnet.sh: builds with cargo build-sbf, then `solana program deploy
  target/deploy/sable.so --program-id keys/sable-program-keypair.json --url
  devnet --upgrade-authority <deployer>`. Reads the deployer keypair from
  $SABLE_DEPLOYER_KEYPAIR env (path). Fails loudly if unset.
- init-devnet.ts: runs the `initialize` instruction against the deployed
  program on devnet. Reads config and admin from env.

Update .env.example:
- SABLE_DEPLOYER_KEYPAIR=/path/to/deployer.json
- SABLE_DEVNET_RPC=https://api.devnet.solana.com
- SABLE_MAGICBLOCK_RPC=<ask user to fill from Discord access>
- SABLE_PROGRAM_ID=<auto-filled after keygen>

Update packages/common and SDK:
- Export PROGRAM_ID_DEVNET constant from @sable/common.
- SDK default programId reads from constructor or falls back to
  PROGRAM_ID_DEVNET.

Update app/src/:
- app/src/lib/constants.ts reads NEXT_PUBLIC_SABLE_PROGRAM_ID.
- Delete every remaining reference to the old L2Cncc... dummy ID.

BLOCKING INPUT REQUIRED FROM USER:
- Deployer keypair path. If not available, STOP, print the request to the user,
  and wait. Do not generate a random deployer keypair without approval.

DONE CHECKLIST
- [ ] `grep -r "SABLE_PROGRAM_ID_TBD" .` returns zero
- [ ] `grep -r "L2CnccKT1q" .` returns zero
- [ ] `./scripts/deploy-devnet.sh` successfully deploys to devnet
- [ ] `./scripts/init-devnet.ts` successfully runs `initialize` and Config PDA
      exists on-chain
- [ ] Solana explorer link to the deployed program added to PROGRESS.md
- [ ] .env.example has all required keys, no real secrets
- [ ] Commit: "sable: prompt 3 — real program id and devnet deploy"
```

---

<a id="prompt-4"></a>
## Prompt 4 — AgentState PDA + spawn/close agent instructions

```
GOAL
Introduce hierarchical agent subaccounts. A human user (UserState) can spawn
Agent subaccounts. Agents can spawn sub-agents. Each AgentState has a parent,
an owner (signer authorized to act as the agent), a label, and a version.
Budget and policy come in prompt 5; this prompt is just the account + spawn.

CHANGES

programs/sable/src/state.rs:
- Add AgentState account:
    pub struct AgentState {
      pub version: u8,
      pub bump: u8,
      pub parent_kind: ParentKind,     // enum: User | Agent
      pub parent: Pubkey,              // parent UserState or AgentState PDA
      pub owner: Pubkey,               // signer authorized as agent
      pub root_user: Pubkey,           // UserState that transitively owns this
      pub label: [u8; 32],             // null-padded UTF-8
      pub nonce: u32,                  // per-parent counter for PDA seeds
      pub child_count: u32,            // outstanding children (for close check)
      pub frozen: bool,
      pub revoked: bool,
      pub created_at: i64,
    }
- Size it via a const AGENT_STATE_SIZE = 8 (discriminator) + struct size.
- Add UserState.agent_count: u32 and AgentState.child_count: u32 for spawn
  nonce tracking.

PDA seeds: ["agent_state", parent.key().as_ref(), nonce.to_le_bytes().as_ref()].
Add deriveAgentState to packages/sdk and packages/common.

Constants: MAX_AGENTS_PER_PARENT = 64, MAX_DEPTH = 4.

Restructure programs/sable/src/ if not already modular:
- instructions/mod.rs aggregating submodules
- instructions/agent/mod.rs
- instructions/agent/spawn_agent.rs
- instructions/agent/close_agent.rs

spawn_agent:
- Accounts: parent_account (UserState or AgentState — pass the raw AccountInfo
  and disambiguate via a `parent_kind: ParentKind` instruction arg and a
  discriminator check on the raw data), new_agent (init, pda), payer,
  parent_owner (signer, must match parent.owner), system.
- The parent must not be frozen/revoked.
- Walk up to root_user and check depth ≤ MAX_DEPTH. Because Anchor can't walk
  a chain in one tx without all ancestors supplied, require the caller to
  pass the full ancestor chain via remaining_accounts. Verify each ancestor
  is the parent of the next via pda derivation.
- Increment parent's count field (agent_count on UserState OR child_count
  on AgentState). Use the resulting value as the nonce for the new PDA.
- Initialize AgentState fields. label is validated to be ≤32 bytes UTF-8.
- Emit event AgentSpawned { agent, parent, root_user, label, owner }.

close_agent:
- Signed by the root_user owner (root control, not the agent's own owner).
- Asserts agent.child_count == 0. Balance check is deferred to prompt 6 —
  for this prompt, a freshly-spawned agent has no balances anyway.
- Closes the PDA, returns lamports to payer.
- Decrements parent.child_count.

error.rs additions:
- AgentDepthExceeded, AgentHasChildren, NotAgentRoot, AgentFrozenOrRevoked,
  InvalidAncestorChain, TooManyAgents.

Tests: tests/agent.ts
- Spawn an agent from a UserState. Verify PDA exists, parent is UserState,
  root_user is the user.
- Spawn a sub-agent from the agent. Verify root_user is still the original user.
- Attempt to spawn at depth 5 → expect AgentDepthExceeded.
- Close a fresh empty agent → success.
- Attempt to close an agent that has a child → expect AgentHasChildren.
- Attempt to spawn with a bad ancestor chain → expect InvalidAncestorChain.

DO NOT
- Add balance/policy to AgentState yet. Those come in prompts 5 and 6.
- Allow spawning from a frozen/revoked parent.

DONE CHECKLIST
- [ ] cargo build-sbf succeeds
- [ ] All tests/agent.ts cases pass on local validator
- [ ] PDA seeds documented in ARCHITECTURE.md
- [ ] PROGRESS.md updated
- [ ] Commit: "sable: prompt 4 — AgentState hierarchy"
```

---

<a id="prompt-5"></a>
## Prompt 5 — Spend policy engine

```
GOAL
Give each AgentState a Policy struct that constrains outbound transfers.
Parent can update policy. Transfers later check policy before mutating balance.

CHANGES

state.rs:
- Add SpendPolicy struct (Anchor-serializable):
    pub struct SpendPolicy {
      pub per_tx_limit: u64,          // 0 = no cap
      pub daily_limit: u64,           // 0 = no cap
      pub total_limit: u64,           // lifetime cap, 0 = no cap
      pub counterparty_mode: CounterpartyMode,  // enum: Any | AllowlistOnly
      pub allowed_mints: [Pubkey; 4], // zero pubkey = slot unused; max 4
      pub expires_at: i64,            // unix seconds, 0 = never
    }
- Running counters in a sibling AgentCounters PDA (keeps AgentState small):
    pub struct AgentCounters {
      pub agent: Pubkey,
      pub bump: u8,
      pub spent_total: u64,
      pub spent_today: u64,
      pub current_day: i64,           // unix day index (block_time / 86400)
    }
  PDA seeds: ["agent_counters", agent.key().as_ref()].
- Policy lives on AgentState; counters in the sibling PDA.

spawn_agent (update from prompt 4):
- Also init AgentCounters PDA alongside AgentState.
- Default policy: per_tx_limit = 0, daily_limit = 0, total_limit = 0,
  counterparty_mode = Any, allowed_mints = [zero;4], expires_at = 0.
  (Fully open by default — root_user must explicitly tighten.)

instructions/agent/set_policy.rs:
- Signed by root_user owner (parent control, not agent's own owner).
- Walks ancestor chain to root_user, verifies the signer owns root_user.
- Accepts a full SpendPolicy struct, replaces existing.
- Emits PolicyUpdated event.

Helpers (programs/sable/src/policy.rs):
- `validate_spend(policy, counters, now, amount, mint, counterparty_pubkey) ->
  Result<AgentCounters>` — pure function, returns updated counters or error.
- Rolls over daily counter if `now / 86400 != counters.current_day`.
- Returns updated `counters` struct; caller writes it back to state.
- Check order: expires_at → counterparty_mode → allowed_mints → per_tx →
  daily → total.

error.rs additions:
- PolicyExpired, CounterpartyNotAllowed, MintNotAllowed, PerTxLimitExceeded,
  DailyLimitExceeded, TotalLimitExceeded.

Unit tests (Rust, in programs/sable/src/policy.rs #[cfg(test)]):
- Day rollover behavior.
- All denial paths hit expected errors.
- Zero-cap means unlimited.
- Allowlist with zero pubkey slots is treated as "slot unused".

Integration test (tests/policy.ts):
- Spawn agent, set policy, assert fields match.
- Call set_policy with a non-root signer → expect NotAgentRoot.

DO NOT
- Call validate_spend anywhere in instructions yet. Prompt 6 wires it.
- Allow the agent's own owner to update its own policy. Only root_user can.

DONE CHECKLIST
- [ ] cargo test --package sable passes (unit tests)
- [ ] Integration tests pass
- [ ] policy.rs documented with comments on check order
- [ ] PROGRESS.md updated
- [ ] Commit: "sable: prompt 5 — spend policy engine"
```

---

<a id="prompt-6"></a>
## Prompt 6 — AgentBalance + agent transfer instructions

```
GOAL
Give agents their own per-mint balances (debited from parent), and add
transfer instructions that route through validate_spend. These are the
instructions the x402 facilitator and auction contracts will use.

CHANGES

state.rs:
- Add AgentBalance account. Seeds: ["agent_balance", agent.key().as_ref(),
  mint.key().as_ref()]. Fields: agent, mint, amount, version, bump.

instructions/agent/:
- fund_agent.rs: root_user signs, specifies amount + mint + agent. Debits
  root UserBalance, credits AgentBalance. Atomic.
- defund_agent.rs: root_user signs, specifies amount. Debits AgentBalance,
  credits root UserBalance. Used to reclaim unspent budget.
- agent_transfer.rs: signed by AGENT owner (not root). Accounts: agent_state,
  agent_balance (mut), agent_counters (mut), dest (UserBalance or AgentBalance —
  typed via `RecipientKind` arg), clock. Runs validate_spend, mutates balances
  + counters atomically. Rejects self-transfer.
- agent_transfer_batch.rs: like transfer_batch but source is AgentBalance,
  signed by agent owner. Up to 15 recipients via remaining_accounts. Each
  recipient goes through validate_spend independently.

Recipients may be:
- UserBalance (human recipient)
- AgentBalance (another agent)

Recipient account discrimination: the instruction ingests a "kind" byte per
recipient (0 = User, 1 = Agent) in the TransferItem struct.

Ancestor-frozen check (re-check in every agent transfer):
- Walk up the agent's ancestor chain (supplied via remaining_accounts as in
  prompt 4). If ANY ancestor is frozen or revoked, fail. Same check as
  spawn_agent.

Close_agent update:
- Assert all AgentBalance accounts for this agent have amount == 0 before
  closing. Caller must pass them in remaining_accounts or explicitly defund
  first.

error.rs additions:
- AgentNotAuthorized (signer is not the agent's owner), InsufficientAgentBalance,
  AgentHasBalances.

Tests (tests/agent-transfer.ts):
- Fund user → fund agent → agent sends to user → balances update correctly.
- Set per_tx_limit = 100, agent attempts 101 → PerTxLimitExceeded.
- Set daily_limit = 1000, agent sends 600 + 500 same day → second fails
  DailyLimitExceeded. Next day (warp clock) → succeeds.
- Policy expires_at in past → PolicyExpired.
- Mint not in allowed_mints (AllowlistOnly mode) → MintNotAllowed.
- Batch transfer of 15 recipients, all within policy → succeeds.
- Batch where recipient 10 exceeds limit → whole tx reverts, earlier recipients
  not credited.

DO NOT
- Bypass validate_spend anywhere.
- Allow root_user to directly move AgentBalance funds without going through
  defund_agent. It's the one documented parent recovery path.

DONE CHECKLIST
- [ ] cargo build-sbf succeeds
- [ ] All agent-transfer tests pass
- [ ] validate_spend is the only path that mutates spent counters
- [ ] Atomic reverts confirmed (check account state after failed tx = unchanged)
- [ ] PROGRESS.md updated
- [ ] Commit: "sable: prompt 6 — agent balances and transfers"
```

---

<a id="prompt-7"></a>
## Prompt 7 — Parent control: freeze, revoke, update_policy

```
GOAL
Parent has kill-switch control over descendants. Freeze = pausable, reversible.
Revoke = permanent, irreversible. Policy updates propagate immediately.

CHANGES

instructions/agent/:
- freeze_agent.rs: sets agent.frozen = true. Callable by root_user owner OR
  by any ancestor agent's owner (walk-up check via remaining_accounts).
- unfreeze_agent.rs: sets agent.frozen = false. Same authorization rule.
- revoke_agent.rs: sets agent.revoked = true. Root_user only. Irreversible —
  no unrevoke instruction.
- set_policy.rs (from prompt 5): confirm authorization is root_user only.

Transfer instructions (from prompt 6):
- Before validate_spend, reject if agent.frozen OR agent.revoked.
- Walk up the agent chain to the root: if ANY ancestor is frozen or revoked,
  the descendant also can't transfer. Depth 4 max so this is 4 reads worst
  case. Pass ancestors via remaining_accounts explicitly to keep CU low.

Event additions:
- AgentFrozen, AgentUnfrozen, AgentRevoked.
  (PolicyUpdated already added in prompt 5.)

Tests (tests/parent-control.ts):
- Freeze agent → agent_transfer fails with AgentFrozenOrRevoked.
- Unfreeze → transfer succeeds.
- Freeze an ancestor → descendant transfer fails.
- Revoke → transfer fails. Compile-time check that no unrevoke ix exists
  in the IDL.
- Non-root signer attempts revoke → fails NotAgentRoot.
- Update policy mid-flight: send at old limit, update policy to lower, next
  send at old limit fails.

DONE CHECKLIST
- [ ] All tests pass
- [ ] Walk-up logic benchmarked — confirm CU stays under 200k for depth 4
      (use solana-program-test's compute logs)
- [ ] PROGRESS.md updated
- [ ] Commit: "sable: prompt 7 — parent kill switches"
```

---

<a id="prompt-8"></a>
## Prompt 8 — Task PDA + create_task / cancel_task

```
GOAL
Introduce the sealed-bid auction primitives. Task = a job posted by a human
or agent, with a budget locked in escrow, a deadline, and a spec hash.

CHANGES

state.rs:
- pub struct Task {
    pub version: u8,
    pub bump: u8,
    pub poster: Pubkey,              // UserState or AgentState PDA
    pub poster_kind: PosterKind,     // User | Agent
    pub mint: Pubkey,
    pub budget: u64,                 // max payable
    pub min_deposit: u64,            // bidder skin-in-game floor
    pub spec_hash: [u8; 32],         // off-chain spec committed via hash
    pub bid_commit_deadline: i64,    // unix seconds
    pub bid_reveal_deadline: i64,    // unix seconds
    pub state: TaskState,            // Open | Revealing | Settled | Cancelled
    pub winning_bidder: Pubkey,      // zero until settled
    pub winning_bid: u64,            // zero until settled
    pub bid_count: u32,
    pub task_id: u64,                // incremented per-poster
  }
- Extend UserState/AgentState with a `task_count: u64` for task_id nonces.
- TaskEscrow account — holds locked budget + all bid deposits.
  Seeds: ["task_escrow", task.key().as_ref()].
  Fields: task, mint, amount, bump.

PDA seeds for Task: ["task", poster.key().as_ref(),
  task_id.to_le_bytes().as_ref()].

instructions/auction/create_task.rs:
- Poster signs (if human: UserState owner; if agent: AgentState owner, after
  policy check using the agent's policy — the budget is an "outbound transfer"
  and is gated).
- Debits budget from poster's UserBalance or AgentBalance, credits TaskEscrow.
- Asserts bid_commit_deadline > now, bid_commit_deadline < bid_reveal_deadline,
  reveal_deadline < now + 7 days.
- Stores spec_hash as-is (off-chain content addressed by this hash).
- Increments poster.task_count.
- Emits TaskCreated { task, poster, mint, budget, deadlines, spec_hash }.

instructions/auction/cancel_task.rs:
- Only valid if state == Open and now < bid_commit_deadline AND bid_count == 0.
  (Once bids exist, cancellation requires settle-to-no-winner path handled in
  prompt 10.)
- Refunds TaskEscrow to poster's balance.
- Sets state = Cancelled.

error.rs additions:
- TaskDeadlineInvalid, TaskNotCancellable, TaskEscrowMismatch, TaskWrongState.

Tests (tests/auction-create.ts):
- Human poster creates task, budget locked.
- Agent poster creates task, policy enforced (too large budget → rejected by
  validate_spend).
- Cancel empty task → success, escrow returned.
- Attempt cancel after bid_commit_deadline → fails TaskNotCancellable.
- Attempt cancel after bids exist → fails TaskNotCancellable.

DONE CHECKLIST
- [ ] All tests pass
- [ ] TaskEscrow and Task account sizes documented
- [ ] PROGRESS.md updated
- [ ] Commit: "sable: prompt 8 — tasks and escrow"
```

---

<a id="prompt-9"></a>
## Prompt 9 — Bid PDA + commit_bid (sealed commit phase)

```
GOAL
Bidders commit to a bid amount + a deposit without revealing the amount.
This runs inside PER so even the commitment hash is invisible to L1 until
reveal. But the on-chain logic must work correctly regardless of ER/PER.

CHANGES

state.rs:
- pub struct Bid {
    pub version: u8,
    pub bump: u8,
    pub task: Pubkey,
    pub bidder: Pubkey,              // UserState or AgentState
    pub bidder_kind: BidderKind,
    pub commit_hash: [u8; 32],       // = keccak(amount_le || nonce_le || bidder)
    pub deposit: u64,                // skin-in-game
    pub revealed_amount: u64,        // zero until reveal
    pub revealed: bool,
    pub submitted_at: i64,
  }

PDA seeds: ["bid", task.key().as_ref(), bidder.key().as_ref()].

instructions/auction/commit_bid.rs:
- Bidder signs (human or agent). If agent, policy runs against the deposit
  amount (treated as outbound transfer).
- Deposit is locked in TaskEscrow (added to the pool).
- now < bid_commit_deadline.
- deposit >= task.min_deposit.
- Increments task.bid_count.
- Stores commit_hash + deposit + bidder info + submitted_at.
- Emits BidCommitted { task, bidder, deposit }.

Commit hash scheme (document in ARCHITECTURE.md):
- hash = keccak256(amount_le_bytes(8) || nonce_le_bytes(8) || bidder_pubkey(32))
- Include bidder pubkey so commitments are non-transferable.
- Nonce is a random u64 the client generates and stores client-side.

Tests (tests/auction-commit.ts):
- Valid commit succeeds, Bid PDA exists with expected hash.
- Commit after bid_commit_deadline → fails.
- Deposit below min_deposit → fails.
- Agent with insufficient budget → fails via policy engine.
- Same bidder attempts second commit on same task → fails (PDA collision =
  uniqueness enforced).

DO NOT
- Store the unsealed amount anywhere on-chain. Only the hash.
- Allow a bidder to edit their commit after placing it.

DONE CHECKLIST
- [ ] All tests pass
- [ ] Commit scheme documented in ARCHITECTURE.md with worked example
- [ ] PROGRESS.md updated
- [ ] Commit: "sable: prompt 9 — sealed bid commits"
```

---

<a id="prompt-10"></a>
## Prompt 10 — reveal_bid + settle_auction

```
GOAL
During the reveal window, bidders reveal (amount, nonce) and the chain checks
the hash. After the reveal deadline, settle_auction picks the lowest-revealed
bid (first-price sealed auction — lowest bid wins because it's a service
auction) and disburses funds. Unrevealed bidders forfeit their deposit.

CHANGES

instructions/auction/reveal_bid.rs:
- Bidder signs.
- now in [bid_commit_deadline, bid_reveal_deadline].
- Inputs: amount (u64), nonce (u64).
- Recompute hash; must equal bid.commit_hash.
- amount must be ≤ task.budget (otherwise this bid is a no-op loser, but
  we reject outright to prevent nonsense reveals).
- Set bid.revealed = true, bid.revealed_amount = amount.
- Emit BidRevealed { task, bidder, amount }.

instructions/auction/settle_auction.rs:
- Callable by anyone after bid_reveal_deadline (crank-friendly).
- Accepts remaining_accounts: all Bid PDAs for this task, plus their bidder
  balance PDAs for payouts.
- Asserts task.state == Open and bid_count matches accounts supplied.
- Walks revealed bids, finds the lowest revealed_amount. If zero revealed
  bids → state = Settled with no winner, full escrow (budget +
  forfeited deposits) returned to poster.
- Winner's payout = winning_amount + own_deposit (returned).
- Revealed non-winners: own_deposit returned.
- Unrevealed bidders: deposit stays in poster's refund (forfeited).
- Poster's residual = (budget - winning_amount) + sum(unrevealed_deposits).
- Sets task.state = Settled, winning_bidder, winning_bid.
- Emits AuctionSettled { task, winner, amount, participants, forfeit_count }.

Escrow conservation:
- Escrow at settle time = budget + sum(all deposits).
- Outflows must sum exactly to escrow inflow. Add debug_assert!.

Tie-breaking (deterministic):
- Lowest revealed_amount wins.
- On tie: earliest submitted_at wins.
- On tie-of-ties: lexicographically-smaller bidder pubkey wins.

Tests (tests/auction-full.ts):
- Full happy path: 3 bidders commit, all reveal, lowest wins.
- 1 bidder doesn't reveal: forfeits deposit, refund goes to poster.
- Zero reveals: task refunds to poster, state = Settled.
- Tie on amount: earlier timestamp wins.
- Attempt settle before reveal_deadline → fails.
- Attempt double settle → fails (state machine check).
- ER crossover test: delegate the task + bids, run commits in ER, commit
  back, settle on L1. Assert final state correct.

DO NOT
- Pick winner by arbitrary order. Tie-breaking is deterministic.
- Allow reveal after reveal_deadline.
- Pay out on-chain to an address other than the bidder's own balance PDA.

COMPUTE BUDGET NOTE
- If settle_auction with 15 bids exceeds CU limits, split into two
  instructions: begin_settle (scans reveals, picks winner, writes to task) +
  finalize_settle (runs payouts in chunks of 5). Only do this split if
  benchmarks prove it's needed.

DONE CHECKLIST
- [ ] All 6 test cases pass
- [ ] Escrow accounting conservation check passes in every test
- [ ] ER crossover test passes
- [ ] CU benchmark recorded in PROGRESS.md
- [ ] PROGRESS.md updated
- [ ] Commit: "sable: prompt 10 — auction reveal and settle"
```

---

<a id="prompt-11"></a>
## Prompt 11 — PER permission metadata accounts

```
GOAL
Make UserBalance, AgentBalance, and TaskEscrow privacy-gated at the PER layer.
Owner can READ + debit. Anyone can credit. This is what actually hides balances
from L1.

REFERENCES
- https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/api-reference/per/introduction
- https://github.com/magicblock-labs/private-payments-demo

CHANGES

Understand the PER permission model first:
- PER uses a permission program + metadata accounts to gate access.
- Permissions are per-account, stored in on-chain metadata PDAs.
- Session keys are generated by the middleware after signing a challenge.
- READ permissions are what make balances invisible; WRITE permissions gate
  debits. Credits are typically open.

programs/sable/src/instructions/permission/:
- init_per_permissions.rs: Called after balance PDA creation (or bundled into
  complete_setup / fund_agent etc.). Creates the PER permission metadata
  account that marks the balance PDA as:
    - READ: owner pubkey (UserState.owner or AgentState.owner)
    - DEBIT (write): owner pubkey
    - CREDIT (write): open
  Calls the PER permission program via CPI with the correct instruction.
  Idempotent — no-op if permission metadata already exists.
- update_per_permissions.rs: Owner-only. Allows rotating owner (e.g., key
  compromise) or extending the READ list (e.g., auditor access).

Where to call init_per_permissions from:
- Automatically from complete_setup (for UserBalance).
- Automatically from add_mint (for UserBalance).
- Automatically from fund_agent (for AgentBalance — first-time init).
- Automatically from create_task (for TaskEscrow — escrow reads gated to
  poster + settle callers).

Update complete_setup, add_mint, fund_agent, create_task to do this CPI
inline so external callers never forget.

SDK-side (packages/sdk/src/):
- Do NOT add session key logic here — that's prompt 15.
- Add helper deriveBalancePermissionPda(balancePda) so the app and SDK can
  fetch/verify permissions.

Tests (tests/per-permissions.ts):
- After complete_setup, assert the PER permission PDA exists with the
  expected READ/WRITE config.
- After fund_agent, same assertion for AgentBalance.
- Unauthorized update_per_permissions attempt → fails.
- If the PER permission program is not available on the test validator, use
  --clone-upgradeable-program to pull it in. Do NOT skip silently — the
  hackathon demo must prove permissions work.

BLOCKING INPUT REQUIRED FROM USER:
- MagicBlock testing endpoint access (requested via Discord). If not yet
  granted, complete the on-chain permission init against a locally cloned
  PER permission program, defer the session key work to prompt 15 when
  endpoint access arrives.

DO NOT
- Make PER permission init a separate manual step users can forget.
- Bypass permissions anywhere — even admin.

DONE CHECKLIST
- [ ] All balance-creating instructions auto-init permissions
- [ ] Tests pass on a local validator with the PER permission program cloned
- [ ] ARCHITECTURE.md has a diagram showing balance PDA + permission PDA
      relationship
- [ ] PROGRESS.md updated
- [ ] Commit: "sable: prompt 11 — PER permission accounts"
```

---

<a id="prompt-12"></a>
## Prompt 12 — SDK rename, IDL regen, module restructure

```
GOAL
Align the @sable/sdk with the new program shape. Regenerate IDL. Drop the
inline hand-crafted IDL in favor of the real generated one. Split SDK into
focused modules.

CHANGES

scripts/idl-sync.js:
- Updated to copy target/idl/sable.json → packages/sdk/src/idl/sable.json and
  app/src/lib/idl/sable.json after every cargo build-sbf.

packages/sdk/src/:
- Split L2ConceptSdk god-class into focused modules:
    SableClient (root)
    ├── treasury.ts   — completeSetup, deposit, withdraw, addMint
    ├── transfer.ts   — transferBatch, externalSendBatch
    └── delegation.ts — delegate, commitAndUndelegate, status helpers

- Modules for agents / auctions / session / payments are ADDED IN LATER
  PROMPTS (13, 14, 15, 16). Do NOT create empty stub files for them in this
  prompt — the CI scanner will reject, and the SableClient should only
  expose methods that actually work.

- Delete the inline minimal IDL construction — use the generated one from
  packages/sdk/src/idl/sable.json.
- Update all app imports to the new module paths.

packages/common/:
- Add all new types: AgentState, SpendPolicy, Task, Bid, TaskState, etc.
  Re-export from the IDL where appropriate.

Tests (packages/sdk/tests/):
- sdk-treasury.test.ts — completeSetup + deposit + transferBatch + withdraw
  round-trip against local validator.
- sdk-delegation.test.ts — delegate a user, check isDelegated, commit back,
  check isDelegated false.

DO NOT
- Ship a broken SableClient. Everything exposed must work end-to-end.
- Create empty placeholder modules for prompts 13–16.

DONE CHECKLIST
- [ ] pnpm -r build succeeds
- [ ] Generated IDL reflects all instructions added through prompt 11
- [ ] Round-trip SDK tests pass
- [ ] No inline IDL construction left
- [ ] PROGRESS.md updated
- [ ] Commit: "sable: prompt 12 — SDK restructure"
```

---

<a id="prompt-13"></a>
## Prompt 13 — SDK: agent methods

```
GOAL
Expose every agent-related instruction through the SDK with type-safe inputs.

CHANGES

Create packages/sdk/src/agents.ts. Export AgentsModule class instantiated as
SableClient.agents:

- spawnAgent({ parentKind, parent, owner, label }): Promise<{ agent, tx }>
- closeAgent({ agent }): Promise<{ tx }>
- fundAgent({ agent, mint, amount }): Promise<{ tx }>
- defundAgent({ agent, mint, amount }): Promise<{ tx }>
- setPolicy({ agent, policy }): Promise<{ tx }>
- freezeAgent({ agent }): Promise<{ tx }>
- unfreezeAgent({ agent }): Promise<{ tx }>
- revokeAgent({ agent }): Promise<{ tx }>
- agentTransfer({ agent, mint, to, toKind, amount }): Promise<{ tx }>
- agentTransferBatch({ agent, mint, items }): Promise<{ tx }>
- listAgents(rootUser): Promise<AgentSnapshot[]> — uses getProgramAccounts
  filter on root_user bytes.
- getAgent(agent): Promise<AgentSnapshot>

Type SpendPolicy (TS mirror of Rust):
  {
    perTxLimit: BN;
    dailyLimit: BN;
    totalLimit: BN;
    counterpartyMode: 'any' | 'allowlistOnly';
    allowedMints: PublicKey[];  // max 4, pad with PublicKey.default
    expiresAt: BN;              // 0 = never
  }

All instructions:
- Auto-derive PDAs including the ancestor chain for walk-up checks.
- Auto-create AgentCounters PDA on spawn.
- Auto-init PER permissions on first-touch balance instructions.
- Throw typed errors using SableError enum that wraps Anchor's error codes.

Tests (packages/sdk/tests/sdk-agents.test.ts):
- Full flow: spawn → fund → transfer → check balance → set policy →
  transfer that exceeds policy → assert failure → defund → close.

DO NOT
- Expose raw Anchor.program directly — wrap everything.
- Silently retry policy failures — surface the error.

DONE CHECKLIST
- [ ] All methods work against local validator
- [ ] Type definitions exported from @sable/sdk
- [ ] PROGRESS.md updated
- [ ] Commit: "sable: prompt 13 — SDK agents"
```

---

<a id="prompt-14"></a>
## Prompt 14 — SDK: auction methods

```
GOAL
Expose auction instructions with a clean workflow API that wraps commit/reveal
cryptography client-side.

CHANGES

Create packages/sdk/src/auctions.ts. Export AuctionsModule as
SableClient.auctions:

- createTask({ poster, posterKind, mint, budget, specContent,
  bidCommitSeconds, bidRevealSeconds, minDeposit }): Promise<{ task, tx }>
    - specContent: string — hashed with sha256 client-side before submission.
    - bidCommitSeconds / bidRevealSeconds: relative offsets from now.
- cancelTask({ task }): Promise<{ tx }>
- commitBid({ task, bidder, bidderKind, amount, deposit }):
  Promise<{ tx, nonce, commitHash }>
    - SDK generates a cryptographically random 64-bit nonce, computes
      keccak256(amount_le || nonce_le || bidder), submits the hash on-chain,
      and returns { nonce, commitHash } to the caller.
    - Caller MUST persist the nonce — without it reveal is impossible.
- revealBid({ task, bidder, amount, nonce }): Promise<{ tx }>
- settleAuction({ task }): Promise<{ tx, winner, winningAmount }>
- getTaskBids(task): Promise<BidSnapshot[]>
- listTasks({ poster?, state? }): Promise<TaskSnapshot[]>

Commit hash must match Rust side bit-for-bit. Add a shared keccak256 helper
in @sable/common with unit tests that verify Rust-TS parity using at least
3 test vectors shared between the two.

Tests (packages/sdk/tests/sdk-auctions.test.ts):
- Full e2e flow: create → 3 commits → 2 reveals (1 forfeits) → settle.
  Assert correct payouts.

DO NOT
- Transmit the nonce to the server anywhere but at reveal time.
- Reuse nonces across bids.

DONE CHECKLIST
- [ ] All methods work
- [ ] keccak256 parity test passes (Rust vectors === TS vectors)
- [ ] PROGRESS.md updated
- [ ] Commit: "sable: prompt 14 — SDK auctions"
```

---

<a id="prompt-15"></a>
## Prompt 15 — SDK: PER session key flow

```
GOAL
Implement the openSession flow so the app can read the user's own private
balances from PER. Without session keys, balances are unreadable post-delegation.

REFERENCES
- https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/api-reference/per/introduction
- github.com/magicblock-labs/private-payments-demo contexts/hooks for working
  example

BLOCKING INPUT REQUIRED
- MagicBlock testing endpoint access (request via their Discord per the SDK
  README). If not yet granted, do the local implementation work against a
  locally emulated PER middleware and flag the remote integration as pending.

CHANGES

Create packages/sdk/src/session.ts:
- class SableSession holds:
    - sessionKey: Keypair (ephemeral)
    - expiry: Date
    - perEndpoint: string
- async openSession({ signer, perRpcUrl, ttlSeconds }): Promise<SableSession>
    1. Ask PER middleware for a challenge (confirm exact transport from
       current docs — likely HTTP GET /challenge or an RPC method).
    2. signer signs the challenge.
    3. Send signed challenge → middleware returns session key + expiry.
    4. Return SableSession.
- session.getBalance(balancePda): Promise<BN> — uses session key to read the
  private balance from PER. Throws SessionExpired / Unauthorized as typed.
- session.getAgentBalance(agentBalancePda): Promise<BN>
- session.close()

Integration into SableClient:
- client.session: SableSession | null
- client.openSession(perRpcUrl, ttlSeconds)
- Balance-read methods on client auto-use session if present and account is
  delegated, else fall back to standard Solana read.

Error handling:
- SessionExpired: open a fresh session automatically once per call, then fail
  on second expiry.
- Unauthorized: surface to caller — user must be permitted (see prompt 11).

Tests (packages/sdk/tests/sdk-session.test.ts):
- openSession succeeds, session.getBalance returns correct value for delegated
  account.
- Third-party keypair openSession succeeds, but getBalance on another user's
  account fails with Unauthorized.
- Expired session auto-refresh works on first expiry.

DO NOT
- Store the session key to disk — memory only.
- Send the user's main wallet signature anywhere but the challenge.

DONE CHECKLIST
- [ ] openSession works against MagicBlock test endpoint
- [ ] Unauthorized read is correctly rejected
- [ ] PROGRESS.md updated
- [ ] Commit: "sable: prompt 15 — PER sessions"
```

---

<a id="prompt-16"></a>
## Prompt 16 — SDK: Private Payments API adapter

```
GOAL
Add USDC on-ramp/off-ramp via MagicBlock's hosted Private Payments API. This
is what lets a non-crypto-native user receive payment without running through
the full Sable flow themselves — and what inherits MagicBlock's AML/OFAC
compliance.

REFERENCES
- https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/api-reference/per/introduction
- https://github.com/magicblock-labs/private-payments-demo — working example
- https://github.com/magicblock-labs/mirage — CLI for testing

CHANGES

Create packages/sdk/src/payments.ts:
- class SablePayments (configured with PER endpoint + API key env):
    - buildDeposit({ from, amount, mint? }): Promise<Transaction> — returns an
      UNSIGNED tx ready for the user to sign. Default mint = USDC.
    - buildTransfer({ from, to, amount, mint? }): Promise<Transaction>
    - buildWithdraw({ from, to, amount, mint? }): Promise<Transaction>
    - getBalance({ owner, mint? }): Promise<BN>
    - getMintInitStatus({ mint }): Promise<boolean>
    - initMint({ mint }): Promise<Transaction>
    - aml.screen({ address }): Promise<{ ok: boolean, reason?: string }>

Implementation: HTTP client against the Private Payments API using the exact
endpoints from the docs. Use native fetch. Error-handle 4xx/5xx explicitly
and surface AML rejections with a dedicated AmlRejected error type so the UI
can show the right message.

env additions:
- SABLE_PRIVATE_PAYMENTS_API_URL
- SABLE_PRIVATE_PAYMENTS_API_KEY

Wire into SableClient:
- client.payments: SablePayments
- Treasury funding flow in the app (prompt 19) will use client.payments
  .buildDeposit.

Tests:
- packages/sdk/tests/sdk-payments.test.ts — mocked HTTP server that mirrors
  the real API shape. Happy path + AML rejection + invalid mint.
- packages/sdk/tests/sdk-payments.live.test.ts (gated behind
  SABLE_RUN_LIVE_TESTS=1 env) — runs against the actual Private Payments API
  to verify integration.

DO NOT
- Move any balance-changing logic server-side that the on-chain Sable program
  should own. Private Payments API is for USDC settlement edge cases.
- Hardcode the API endpoint. Read from env.

DONE CHECKLIST
- [ ] Mocked tests pass
- [ ] Live test passes against the real API
- [ ] Compliance errors surfaced with their own type
- [ ] PROGRESS.md updated
- [ ] Commit: "sable: prompt 16 — Private Payments API adapter"
```

---

<a id="prompt-17"></a>
## Prompt 17 — x402 facilitator service

```
GOAL
Stand up a standalone Node service (services/x402-facilitator/) that speaks
the x402 HTTP payment protocol and settles payments through Sable. This is
what makes agents pay-per-API-call on-chain in <500ms.

REFERENCES
- https://www.x402.org — x402 protocol spec
- x402 GitHub org for Solana reference implementations
- x402 headers: "X-PAYMENT" (client → server), "402 Payment Required" response

CHANGES

Create services/x402-facilitator/:
- package.json, tsconfig, express (or fastify), @sable/sdk, @solana/web3.js.
- src/server.ts: HTTP server with two roles:
    1. Verifier: POST /verify — the merchant calls this to validate an incoming
       X-PAYMENT header. Facilitator checks it's a valid Sable tx.
    2. Settler: POST /settle — the merchant calls this to actually execute
       the payment on-chain inside PER.
- src/protocol.ts: x402 header encode/decode exactly per the spec. Input is
  the payment requirements response (402), output is a signed payment payload.
- src/sable-adapter.ts: takes a decoded x402 payment payload, builds and
  submits an agent_transfer instruction against the Sable program (through
  PER when delegated, L1 otherwise).

Two integration modes:
- facilitator-only: merchant runs their own x402 server that calls our
  /verify and /settle endpoints. We're infra.
- merchant-wrapped: we also ship src/middleware.ts as express/fastify
  middleware the merchant can drop in:
  `app.use(sableX402({ price, receiver }))`.

Agent-side client:
- packages/x402-client/ — small package that agents import. Given a 402
  response + their SableClient + their AgentState, builds the payment header
  and adds it to the retry request.

CONFIG env:
- SABLE_X402_FACILITATOR_URL
- SABLE_X402_DEFAULT_RECEIVER (merchant's AgentState/UserState)
- SABLE_X402_MIN_PRICE_USDC

Tests:
- services/x402-facilitator/tests/x402-e2e.test.ts: spawn a mock merchant API
  with the middleware, spawn a mock agent client, agent hits endpoint → gets
  402 → signs → retries → gets 200. Assert on-chain balance updated correctly.

DO NOT
- Trust the X-PAYMENT header without verification — every call runs full
  signature + replay check.
- Skip the nonce/replay protection. Each payment header must be single-use,
  enforced via a short-TTL cache of seen nonces.

DONE CHECKLIST
- [ ] Service builds and starts cleanly
- [ ] E2E test: agent → merchant → 402 → paid → 200
- [ ] x402 header format verified against the spec (include a conformance
      comment linking the exact spec section)
- [ ] Replay attack test: replay a used header → 401
- [ ] PROGRESS.md updated
- [ ] Commit: "sable: prompt 17 — x402 facilitator"
```

---

<a id="prompt-18"></a>
## Prompt 18 — App rebrand + delete old wallet-centric UI

```
GOAL
Pivot the Next.js app from "multi-mint wallet" to "Sable agent treasury
console". Delete UI paths that don't belong. Keep the SDK plumbing.

CHANGES

Delete or replace:
- BalanceList's "list of all your balances" framing. Reframe as "Your
  Treasury" — still shows balances, but in a treasury-centric layout.
- ActionPanel's "Deposit / Send / Withdraw / Delegate" generic tabs. Replace
  with "Treasury", "Agents", "Tasks", "Activity".
- CompleteSetupModal copy rewritten as "Create Treasury" with a short
  explainer about PER privacy.
- DelegationStatus — keep but rename visible copy to "Private mode status".

Rebrand:
- Replace every "L2Concept" / "L2" string with "Sable".
- New logo + favicon (generate a simple SVG mark: a stylized "S" in deep
  black with muted gold accent).
- Landing copy: "Private programmable money for AI agents." Hero CTA:
  "Create Treasury". Secondary: "Read the docs" → ARCHITECTURE.md.

Theme foundation:
- app/src/theme.ts with deep-black primary, muted gold accent, monospace
  numerics. Keep GlassPanel / LuxuryButton components — the aesthetic works.

New routes:
- /            → landing (marketing)
- /app         → treasury dashboard (default after connect)
- /app/agents  → agent management
- /app/tasks   → auction marketplace
- /app/x402    → live x402 demo page (filled in prompt 22)
- /app/settings → connected RPC, program ID, app version

Navigation:
- Sidebar with Treasury / Agents / Tasks / x402 Demo / Settings.
- Connect wallet + network pill in top-right.

DO NOT
- Break any existing SDK wiring.
- Introduce broken links. Every route in the nav must render without errors.
- Keep any "router mode" toggle — it's gone.

DONE CHECKLIST
- [ ] `pnpm app:dev` runs, all routes render without console errors
- [ ] No remaining "L2Concept" / "L2" visible in UI
- [ ] New routes exist as skeletons (filled by prompts 19-22)
- [ ] PROGRESS.md updated
- [ ] Commit: "sable: prompt 18 — app rebrand"
```

---

<a id="prompt-19"></a>
## Prompt 19 — App: Treasury console (/app)

```
GOAL
The default-after-connect page. Shows treasury USDC balance (funded via
Private Payments API), mint balances, delegation state, and primary actions.

CHANGES

app/src/views/TreasuryView.tsx (or pages/app/index.tsx per Next router):
- Header: account pill, total USDC value (if delegated: "private mode" icon).
- Primary CTAs: "Fund with USDC" (opens modal that uses
  client.payments.buildDeposit), "Delegate to private mode" (delegates
  UserState + all balances), "Commit & undelegate" (inverse).
- Treasury panel: list of UserBalance rows, amount, mint symbol, add-mint
  row. When delegated and a session is open, balances are fetched via
  session.getBalance; when delegated but no session, show "🔒 Tap to unlock"
  that triggers client.openSession.
- Activity feed: last 20 transactions for this user (deposits, transfers,
  agent spawns, policy changes). Poll on 10s interval.

Fund flow (modal):
- Input: USDC amount.
- Pre-send: call SablePayments.aml.screen. If rejected, show the reason and
  block.
- Build deposit tx via SablePayments.buildDeposit, ask wallet to sign, submit.

Delegation flow:
- Delegate button → call client.delegate. Show toast with expected commit
  frequency. After delegation, auto-open a session.
- Commit-and-undelegate button → call client.commitAndUndelegate. Closes the
  session on success.

Tests:
- app/src/views/TreasuryView.test.tsx — mount in jsdom with a mocked
  SableClient, run through fund + delegate + unlock flows.

DO NOT
- Leak the session key to any component prop that crosses a boundary.
- Show cleartext private balance when not in session mode.

DONE CHECKLIST
- [ ] All primary flows work against devnet with a real wallet
- [ ] Session-gated balance reads succeed after openSession
- [ ] Activity feed hydrates correctly
- [ ] PROGRESS.md updated
- [ ] Commit: "sable: prompt 19 — treasury console"
```

---

<a id="prompt-20"></a>
## Prompt 20 — App: Agent dashboard (/app/agents)

```
GOAL
Manage the agent tree. Spawn agents, fund them, set policies, freeze/revoke.

CHANGES

app/src/views/AgentsView.tsx:
- Tree view (left pane): UserState at root, agents as expandable nodes. Each
  node shows label, status (active/frozen/revoked), total balance, total spent.
- Detail pane (right): when node selected, show:
    - Label, owner pubkey (copyable), parent, depth.
    - Balances table (mint, amount, PER-session-aware).
    - Policy summary: per-tx / daily / total / counterparty mode / allowed
      mints / expiry. Edit button opens policy editor.
    - Activity: recent transfers for this agent.
    - Actions: Fund, Defund, Spawn sub-agent, Freeze/Unfreeze, Revoke.
- Spawn modal: label input, new keypair generated client-side (agent owner
  keypair), display and force download of the keypair file before submit.
  WARNING banner: "This keypair controls the agent's spending. Store securely."
- Policy editor: form with validations matching the Rust checks (u64 amounts,
  counterparty mode enum, up to 4 mints, optional expiry). Live preview of
  "What this policy allows."

Tests:
- Full agent-management flow: spawn → fund → agent-transfer (simulated from a
  second session with the agent's keypair) → policy tighten → next transfer
  fails.

DO NOT
- Upload the agent keypair anywhere. Client-side only. Download to user.
- Allow policy edits for non-root users.

DONE CHECKLIST
- [ ] Tree hydrates correctly for arbitrary agent depth ≤ 4
- [ ] Policy editor + freeze/revoke work end-to-end
- [ ] Keypair download works
- [ ] PROGRESS.md updated
- [ ] Commit: "sable: prompt 20 — agent dashboard"
```

---

<a id="prompt-21"></a>
## Prompt 21 — App: Auction marketplace (/app/tasks)

```
GOAL
Create tasks, commit bids, reveal, see settlements. Show the sealed phase
clearly so judges grok the privacy property.

CHANGES

app/src/views/TasksView.tsx:
- Tab 1 "Open tasks": list tasks in state=Open where user is not yet a
  bidder. Filter by mint, max deadline.
- Tab 2 "My tasks": tasks I posted, any state.
- Tab 3 "My bids": tasks I bid on, any state.

Task detail drawer:
- Poster, mint, budget, spec hash, commit/reveal deadlines, current phase
  (countdown timer).
- Bid action: during commit phase, show amount + deposit inputs. On submit,
  SDK generates nonce, shows "DOWNLOAD YOUR NONCE" — user MUST save the file
  before the commit confirms. Without the nonce they can't reveal.
- Reveal action: during reveal phase, drag-and-drop the saved nonce file,
  submit revealBid. Show "Revealed: 42.5 USDC" confirmation.
- Settle action: after reveal deadline, any user can trigger settle; show
  winner + payouts after success.

Create task form:
- Select poster (self or one of my agents).
- Mint + budget + min deposit + spec (text, hashed client-side) + commit
  duration + reveal duration.
- Preview the deadlines before submit.

Privacy proof panel:
- On the task detail page: a block-explorer link to the commit tx, expandable
  to show the raw tx data, annotated "amount is 0x...hash — unreadable on L1
  until reveal".

Tests:
- Full auction flow via UI (Playwright): 3 browser tabs as 3 bidders, 1 as
  poster. Assert end-state payouts match expectations.

DO NOT
- Show a bidder's nonce on any server. Generated and stored client-only.
- Allow viewing unrevealed bid amounts in the UI even if an RPC node leaks
  them (defensive).

DONE CHECKLIST
- [ ] Happy path auction works end-to-end through the UI
- [ ] "Privacy proof" panel visibly demonstrates sealed commitment
- [ ] Nonce download + reload roundtrip works
- [ ] PROGRESS.md updated
- [ ] Commit: "sable: prompt 21 — auction marketplace"
```

---

<a id="prompt-22"></a>
## Prompt 22 — App: x402 live demo (/app/x402)

```
GOAL
A single, mesmerizing page that is the demo video centerpiece. Visitor
watches an agent pay per API call in real time, with the x402 dance visible.

CHANGES

app/src/views/X402DemoView.tsx:
- Left pane: "Weather API" mock merchant endpoint: /api/demo/weather?city=.
  Each call costs 0.01 USDC. Express middleware in app/api routes runs the
  x402 facilitator middleware from prompt 17.
- Right pane: "Agent": pre-configured AgentState with a small budget. Click
  "Ask weather" → live logs appear:
    1. "GET /api/demo/weather?city=Barcelona"
    2. "← 402 Payment Required (price: 0.01 USDC, receiver: <addr>)"
    3. "Signing x402 header with agent keypair..."
    4. "→ GET again with X-PAYMENT header"
    5. "Facilitator verifying..."
    6. "Facilitator settling via Sable PER..."
    7. "← 200 OK { 'temp': 18, 'wind': 12 }"
    8. "Agent balance: X → X−0.01 USDC (private)"
  Each step animates in with timing from the real roundtrip.

- Bottom: "Explorer view" — side-by-side with a Solana block-explorer iframe
  filtered to Sable program txs. Point out: the payment is opaque on L1
  (hash-only) because it happened inside PER, only the periodic commit is
  visible.

- A "Run 100 calls" button: fires 100 weather calls. Shows live
  throughput/latency chart.

Tests:
- Click-through a full roundtrip in Playwright.
- 100-call load test completes under 30s (5+ calls/second).

DO NOT
- Fake the x402 roundtrip. Every step goes through the real facilitator from
  prompt 17.
- Pre-credit the agent — it must start the demo with a real funded balance.

DONE CHECKLIST
- [ ] Single weather call completes end-to-end
- [ ] 100-call run works
- [ ] Demo is visually compelling (record a quick GIF for the PR)
- [ ] PROGRESS.md updated
- [ ] Commit: "sable: prompt 22 — x402 live demo"
```

---

<a id="prompt-23"></a>
## Prompt 23 — Full integration test suite

```
GOAL
One command that runs every critical flow, end-to-end, against a local
validator + MagicBlock testing endpoint. If this passes, we're shippable.

CHANGES

tests/integration/ directory:
- 01-treasury.spec.ts — initialize, join, complete_setup, deposit, withdraw
- 02-agents.spec.ts — full agent tree flow
- 03-policy.spec.ts — every policy denial path
- 04-auctions.spec.ts — happy path + forfeit + no-reveals + ties
- 05-delegation.spec.ts — delegate + private read via session + commit-back
- 06-per-permissions.spec.ts — read authorization
- 07-x402.spec.ts — facilitator round-trip with real Sable settlement
- 08-private-payments-api.spec.ts — USDC deposit via the hosted API

Test runner (scripts/test-integration.sh):
- Starts local validator with delegation program + PER permission program
  cloned in.
- Starts x402 facilitator service.
- Runs mocha + ts-node over the suite.
- Tears down.

Conservation checks:
- After every test, verify: sum(all user balances + all agent balances +
  all escrow balances) == sum(vault ATA balances). This is the
  "no-print-money" invariant.

DONE CHECKLIST
- [ ] `pnpm test:integration` runs all 8 specs green on local
- [ ] Conservation check passes in every spec
- [ ] Test output is readable (reporters + summary)
- [ ] PROGRESS.md updated
- [ ] Commit: "sable: prompt 23 — integration tests"
```

---

<a id="prompt-24"></a>
## Prompt 24 — Devnet deployment + MagicBlock testing endpoint

```
GOAL
Deploy Sable to Solana devnet and integrate with MagicBlock's testing ER
endpoint. The hackathon requires a "live deployment with successful
MagicBlock integration."

CHANGES

scripts/:
- deploy-all-devnet.sh: idempotent. Does, in order:
    1. cargo build-sbf
    2. solana program deploy (upgrades if already deployed)
    3. Run initialize if Config PDA doesn't exist
    4. Verifies Config, admin, delegation program ID, PER permission program
       references are all set to the right devnet values.
    5. Deploys x402 facilitator service to a public host (Railway / Fly /
       whichever is easiest — document the choice).
    6. Deploys Next.js app to Vercel.
    7. Prints a summary URL for each deployed component.

Environment config (devnet):
- MagicBlock testing RPC endpoint (user must request via Discord — document
  the exact request template in DEPLOYMENT.md).
- Delegation program ID (devnet).
- PER permission program ID (devnet).
- USDC devnet mint.

Smoke test (scripts/smoke-devnet.ts):
- Runs 10 quick assertions against the live devnet deployment:
    - Program account exists and is executable
    - Config PDA exists with correct admin
    - initialize was idempotent
    - One happy-path join + complete_setup + deposit roundtrip
    - One agent spawn + transfer roundtrip
    - One small auction happy path
    - One x402 call via the live facilitator URL
- Any failure = exit 1 with a clear message.

Documentation:
- DEPLOYMENT.md with:
    - Required env vars
    - Step-by-step first-time deployment
    - How to request MagicBlock testing endpoint access
    - Smoke-test command
    - Rollback procedure

DONE CHECKLIST
- [ ] Smoke test passes on live devnet
- [ ] App URL live (Vercel)
- [ ] Facilitator URL live
- [ ] Program ID + transaction signatures added to README and PROGRESS.md
- [ ] DEPLOYMENT.md is complete and accurate
- [ ] Commit: "sable: prompt 24 — devnet deployment"
```

---

<a id="prompt-25"></a>
## Prompt 25 — README, docs, demo video script

```
GOAL
Ship-ready documentation. Judge lands on the repo, gets it in 60 seconds,
can run it themselves in 10 minutes.

CHANGES

README.md — replace entirely:
- One-paragraph pitch (ship-test: would a judge know what this is after 3
  sentences? if not, rewrite).
- Animated gif of the x402 demo page (from prompt 22).
- Live deployment links (app, facilitator, program on explorer).
- "How it works" diagram (inline ASCII or an SVG in /docs/).
- MagicBlock primitives used and where: ER (file:line), PER (file:line),
  Private Payments API (file:line).
- Quickstart (clone → pnpm install → pnpm dev → seed script).
- Architecture section: link to ARCHITECTURE.md.
- Security note: this is hackathon code, not audited.
- License.

docs/:
- architecture.md — deeper technical doc. Cover:
    - Account layout (Config, UserState, AgentState, UserBalance, AgentBalance,
      Task, Bid, TaskEscrow, PER permission accounts).
    - Instruction map.
    - Invariants (conservation, policy, delegation).
    - Failure modes and recovery.
- x402-integration.md — how a third-party merchant plugs in.
- demo-video-script.md — scene-by-scene script for the 3-minute submission
  video. Include shot list, timing, voice-over text, and a "panic fallback"
  if live calls fail during recording.

Demo video script outline (expand in the file):
- 0:00–0:20 — Problem: "The agent economy needs a private money layer. On
  Solana, every balance and every transfer is public today. Here's what
  that looks like." [Show public balances.]
- 0:20–0:40 — Solution: "Sable: private programmable money for agents, on
  MagicBlock PER." Show 3 primitives: hierarchical treasuries, x402, sealed
  auctions.
- 0:40–2:00 — Live demo:
    - 0:40–1:10: Fund treasury with USDC via Private Payments API. Spawn
      a Marketing agent with $100/day cap.
    - 1:10–1:40: Agent calls a paid API. x402 roundtrip visible. Block
      explorer shows opacity.
    - 1:40–2:00: Sealed-bid task: 3 agents bid, 2 reveal, winner settled,
      amounts stay private until reveal.
- 2:00–2:30 — Technical integration points: "ER for speed, PER for privacy,
  Private Payments API for compliance. Every MagicBlock primitive, used
  correctly."
- 2:30–3:00 — Market + roadmap: "The agent economy is the 2026 narrative.
  Sable is the money layer." Call-to-action: URL, repo, Discord.

Submission checklist (in the README):
- [ ] Live app URL
- [ ] Live facilitator URL
- [ ] Devnet program ID (clickable)
- [ ] Demo video link
- [ ] MagicBlock Discord proof of endpoint access (screenshot in /docs)

DONE CHECKLIST
- [ ] README reads well cold
- [ ] Video script is ready to shoot
- [ ] Smoke test in DEPLOYMENT.md works from a fresh clone
- [ ] PROGRESS.md has all 25 rows complete
- [ ] Commit: "sable: prompt 25 — docs and submission"
```

---

<a id="pacing"></a>
## Pacing & Critical Path

**Week 1:** Prompts 1–7 (foundation + agents + policy). End of week: you can fund treasuries and run agent transfers with policy enforcement.

**Week 2:** Prompts 8–14 (auctions + PER + SDK). End of week: backend-complete. All instructions working, SDK covers them, PER permissions live.

**Week 3:** Prompts 15–22 (session keys, payments API, x402, full app). End of week: functional demo.

**Buffer (days 18–21):** Prompts 23–25 + video recording + debug.

### Critical-path risks

1. **MagicBlock testing endpoint access.** Request on their Discord *today*. Prompts 15, 17, 19, 22, 24 all depend on it. Keep local work going while you wait.
2. **`settle_auction` compute budget.** If it exceeds CU limits with 15 bids, split into `begin_settle` + `finalize_settle` per prompt 10's fallback note.
3. **PER permission program availability on local validator.** Clone it in via `--clone-upgradeable-program` from devnet so prompt 11 tests pass locally.

### Progress tracker template for PROGRESS.md

| # | Prompt | Status | Commit | Notes |
|---|---|---|---|---|
| 1 | Rebrand & cleanup | ☐ | | |
| 2 | Real ER delegation CPI | ☐ | | |
| ... | ... | ... | ... | ... |
| 25 | Docs & submission | ☐ | | |

Update after every prompt. Status values: ☐ not started · 🔄 in progress · ✅ done · ⚠️ blocked.
