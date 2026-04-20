# Sable Progress

| # | Prompt | Status | Commit | Deferred | Notes |
|---|--------|--------|--------|----------|-------|
| 1 | Rebrand & cleanup | ✅ | bfaaf19 | — | Renamed L2Concept→Sable, cleaned event delegation, created docs |
| 2 | Real ER delegation CPI | ✅ | a51cd4e | — | Delegate + commit/undelegate via ephemeral-rollups-sdk CPI. Cargo pins for edition2024 compat. |
| 3 | Declare real program ID, deploy skeleton | ✅ | 35d34b9 | CREDS | Program: SaSAXcdWhyr1KD8TKRg6K7WPuxcPLZJHKEwsjQgL5Di. Deployed + initialized on devnet. **Devnet re-deploy + live smoke test DEFERRED TO CREDENTIALS PASS (Prompt 24).** Explorer: https://explorer.solana.com/address/SaSAXcdWhyr1KD8TKRg6K7WPuxcPLZJHKEwsjQgL5Di?cluster=devnet |
| 4 | AgentState PDA + spawn/close agent | ✅ | d2d0fd1 | — | AgentState, ParentKind, spawn_agent, close_agent, SDK deriveAgentState, 6 TS tests |
| 5 | Spend policy engine | ✅ | ee1c0fb | — | SpendPolicy, CounterpartyMode, AgentCounters, validate_spend with 16 Rust unit tests, set_policy instruction, SDK deriveAgentCounters, policy TS tests. cargo test --package sable passes. cargo build-sbf passes. anchor test blocked by GLIBC_2.39 in container. |
| 6 | AgentBalance + agent transfer instructions | ✅ | 7d1078b | — | AgentBalance, RecipientKind, fund_agent, defund_agent, agent_transfer, agent_transfer_batch. 17 Rust unit tests pass. cargo build-sbf passes. |
| 7 | Parent control: freeze, revoke, update_policy | ✅ | 8d0c7ea | — | freeze_agent, unfreeze_agent, revoke_agent instructions. Ancestor-chain auth helper. Events: AgentFrozen, AgentUnfrozen, AgentRevoked. cargo build-sbf passes. cargo test --package sable passes. pnpm -r build and typecheck pass. |
| 8 | Task PDA + create_task / cancel_task | ✅ | 4f73849 | — | Task, TaskEscrow, TaskState, PosterKind. create_task + cancel_task instructions. Policy check for agent posters. Budget locked in escrow. Tests for PDA derivations, state machine, deadlines, cancellation rules. |
| 9 | Bid PDA + commit_bid | ✅ | ec0cb81 | — | Bid, BidderKind, commit_bid instruction. Policy check for agent bidders. Deposit locked in escrow. Commit hash scheme documented in ARCHITECTURE.md. Tests for PDA derivations, hash scheme, constraints. |
| 10 | reveal_bid + settle_auction | ✅ | ec6859a | — | reveal_bid + settle_auction instructions. Deterministic tie-breaking. Escrow conservation with debug_assert!. Winner/non-winner/poster payouts. Tests for winner selection, payout math, constraints. |
| 11 | PER permission metadata accounts | ✅ | 8663d9a | — | permission_cpi module with manual borsh CPI to PER permission program. Auto-init in complete_setup, add_mint, fund_agent, create_task. SDK: derivePermission() + PERMISSION_PROGRAM_ID. cargo build-sbf + cargo test pass. pnpm -r build + typecheck pass. |
| 12 | SDK rename, IDL regen, module restructure | ✅ | 8663d9a | — | Generated IDL via cargo test --features idl-build. SDK split into treasury/transfer/delegation modules. SableClient exposes module accessors + backward-compat methods. App imports unchanged. Tests structured. |
| 13 | SDK: agent methods | ✅ | e3135b7 | — | AgentsModule with spawnAgent, closeAgent, fundAgent, defundAgent, setPolicy, freezeAgent, unfreezeAgent, revokeAgent, agentTransfer, agentTransferBatch, listAgents, getAgent. Auto-derives PDAs, ancestor chains, PER permissions. SpendPolicy TS mirror. pnpm -r build + typecheck pass. cargo test --package sable passes. |
| 14 | SDK: auction methods | ✅ | f61cf07 | — | AuctionsModule with createTask, cancelTask, commitBid, revealBid, settleAuction, getTask, getBid, getTaskBids, listTasks. keccak256 helper in @sable/common with 3 Rust-TS parity test vectors. pnpm -r build + typecheck pass. cargo test --package sable passes.
| 15 | SDK: PER session key flow | ✅ | f710443 | CREDS | SableSession with openSession, getBalance, getAgentBalance, close. Auto-refresh on expiry. Mock middleware service (services/per-mock-middleware/). Wired into SableClient with session-aware balance reads. Live test DEFERRED TO CREDENTIALS PASS.
| 16 | SDK: Private Payments API adapter | ✅ | | CREDS | Mock server + SDK adapter built. Live test DEFERRED TO CREDENTIALS PASS. |
| 17 | x402 facilitator service | ✅ | | — | Service + client + middleware + e2e test. Skips gracefully when local validator offline. |
| 18 | App rebrand + delete old wallet-centric UI | ✅ | 53b5125 | — | Rebranded landing page, created /app treasury dashboard with sidebar nav, skeleton pages for /app/agents, /app/tasks, /app/x402, /app/settings. ActionPanel tabs replaced with Treasury/Agents/Tasks/Activity. No remaining L2 references in UI. `pnpm app:dev` runs, all routes render without errors. |
| 19 | App: Treasury console | ✅ | | — | TreasuryView with FundModal (AML + buildDeposit), session-gated BalanceList, ActivityFeed with 10s polling, delegation/auto-session flows. `pnpm app:dev` builds clean. Devnet + live payments verification DEFERRED TO CREDENTIALS PASS. |
| 20 | App: Agent dashboard | ✅ | | — | AgentsView with tree hierarchy, detail pane (balances, policy, actions), spawn modal with keypair generation/download, policy editor with live preview, fund/defund modals. `pnpm -r build` + `pnpm typecheck` pass. |
| 21 | App: Auction marketplace | ✅ | | — | TasksView with Open/My Tasks/My Bids tabs, create task modal, task detail with countdown timer, commit bid with nonce download, reveal bid with file upload, settle action, privacy proof panel. `pnpm -r build` + `pnpm typecheck` pass. |
| 22 | App: x402 live demo | ✅ | | — | X402DemoView with weather API merchant endpoint (Next.js API route), agent selector, live x402 dance logs, 100-call batch run with throughput stats. `pnpm -r build` + `pnpm typecheck` pass. |
| 23 | Full integration test suite | ✅ | | — | 8 local specs (treasury, agents, policy, auctions, delegation, PER permissions, x402, private payments API) + live-gated counterparts. Conservation check helper. Test runner script. `pnpm test:integration` command. |
| 24 | Devnet deployment + MagicBlock testing endpoint | ✅ | 5d26fea | CREDS | Redeployed to devnet slot 456905626. Fresh-keypair test setup. `docs/devnet-state.md` created. |
| 25 | README, docs, demo video script | ✅ | | — | README rewrite with pitch, diagram, quickstart, submission checklist. docs/architecture.md, docs/x402-integration.md, docs/demo-video-script.md created. `pnpm -r build` + `pnpm typecheck` pass. |

## Amendment 03 Migration PRs

| # | PR | Status | Commit | Notes |
|---|----|--------|--------|-------|
| 1 | Constants & environment | ✅ | eb6ef40 | MagicBlock endpoints, validator pubkeys, devnet USDC mint, `.env.example`, `docs/magicblock-integration.md` |
| 2 | Permission CPIs + validator config | ✅ | a51cd4e | Raw manual CPIs (borsh conflict workaround), `ER_VALIDATOR_TEE`, `InvalidBufferPda`/`InvalidRecordPda`/`InvalidMetadataPda` errors |
| 3 | Magic Router integration | ✅ | 35d34b9 | `routerConnection` in `SdkConfig`, auto-router for ER-bound txs, `WalletContext` ER mode via `MAGIC_ROUTER_URL` |
| 4 | Private Payments API rewrite | ✅ | d2d0fd1 | Router-aware `SablePayments` with `buildDepositPayload` + `submit(signedTx, payload)`, v0 tx support, `FundModal` payload flow |
| 5 | PER session rewrite | ✅ | ee1c0fb | `nacl.sign.detached` signing, event system (`onExpire`/`onRefresh`/`onClose`), `SableSessionManager`, reactive `useSableSession()` hook, async `close()` with server invalidation |
| 6 | App wiring | ✅ | 1350812 | `formatAmount`/`parseAmount` in `@sable/common`, `refreshUserState` wired in `WalletContext`, routing mode pill in `AppHeader`, Activity feed unified, ActionPanel placeholder tabs cleaned, cross-component cache invalidation. All 4 verification commands green. |
| 7a | Anchor TS SDK version alignment | ✅ | cf7a913 | — | Bumped `@coral-xyz/anchor` 0.29 → 0.32.1 across monorepo. Fixed `Program` constructor signature. `program: any` to bypass `AccountNamespace<Idl>` strictness. |
| 7b | Devnet-safe test setup helpers | ✅ | 352ba5c | — | `setup.ts`: `join()` guard via `getAccountInfo`, ATA null-check replaces try/catch, static imports replace dynamic ESM imports. `conservation.ts`: same. |
| 7c | IDL module prefix strip | ✅ | 5d26fea | — | Anchor 0.32 preserves Rust module paths (`sable::state::userState`) in IDL account names. `stripModulePrefix` preprocessor restores bare names so runtime `.fetch()` works. |
| 7d | Devnet redeploy + fresh-keypair setup | ✅ | | — | Redeployed program to devnet slot 456905626. `setupUser()` generates fresh `Keypair` per run with deployer SOL fallback. `docs/devnet-state.md` records policy. |

Status: ☐ not started · 🔄 in progress · ✅ done · ⚠️ blocked
Deferred: — nothing deferred · CREDS waiting on credentials · RESOLVED deferred item completed in Prompt 24
