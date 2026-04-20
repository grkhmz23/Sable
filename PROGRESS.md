# Sable Progress

| # | Prompt | Status | Commit | Notes |
|---|--------|--------|--------|-------|
| 1 | Rebrand & cleanup | ✅ | bfaaf19 | Renamed L2Concept→Sable, cleaned event delegation, created docs |
| 2 | Real ER delegation CPI | ✅ | a51cd4e | Delegate + commit/undelegate via ephemeral-rollups-sdk CPI. Cargo pins for edition2024 compat.
| 3 | Declare real program ID, deploy skeleton | ✅ | a51cd4e | Program: SaSAXcdWhyr1KD8TKRg6K7WPuxcPLZJHKEwsjQgL5Di. Deployed + initialized on devnet. Explorer: https://explorer.solana.com/address/SaSAXcdWhyr1KD8TKRg6K7WPuxcPLZJHKEwsjQgL5Di?cluster=devnet
| 4 | AgentState PDA + spawn/close agent | ✅ | d2d0fd1 | AgentState, ParentKind, spawn_agent, close_agent, SDK deriveAgentState, 6 TS tests |
| 5 | Spend policy engine | ✅ | ee1c0fb | SpendPolicy, CounterpartyMode, AgentCounters, validate_spend with 16 Rust unit tests, set_policy instruction, SDK deriveAgentCounters, policy TS tests. cargo test --package sable passes. cargo build-sbf passes. anchor test blocked by GLIBC_2.39 in container.
| 6 | AgentBalance + agent transfer instructions | ✅ | 7d1078b | AgentBalance, RecipientKind, fund_agent, defund_agent, agent_transfer, agent_transfer_batch. 17 Rust unit tests pass. cargo build-sbf passes.
| 7 | Parent control: freeze, revoke, update_policy | ✅ | 01e287d | freeze_agent, unfreeze_agent, revoke_agent instructions. Ancestor-chain auth helper. Events: AgentFrozen, AgentUnfrozen, AgentRevoked. cargo build-sbf passes. cargo test --package sable passes. pnpm -r build and typecheck pass. |
| 8 | Task PDA + create_task / cancel_task | ✅ | 06a5a06 | Task, TaskEscrow, TaskState, PosterKind. create_task + cancel_task instructions. Policy check for agent posters. Budget locked in escrow. Tests for PDA derivations, state machine, deadlines, cancellation rules. |
| 9 | Bid PDA + commit_bid | ✅ | a4359f6 | Bid, BidderKind, commit_bid instruction. Policy check for agent bidders. Deposit locked in escrow. Commit hash scheme documented in ARCHITECTURE.md. Tests for PDA derivations, hash scheme, constraints. |
| 10 | reveal_bid + settle_auction | ✅ | ada571a | reveal_bid + settle_auction instructions. Deterministic tie-breaking. Escrow conservation with debug_assert!. Winner/non-winner/poster payouts. Tests for winner selection, payout math, constraints. |
| 11 | PER permission metadata accounts | ✅ | | cargo build-sbf + cargo test pass. pnpm -r build + typecheck pass. |
| 12 | SDK rename, IDL regen, module restructure | ✅ | | Generated IDL via cargo test --features idl-build. SDK split into treasury/transfer/delegation modules. SableClient exposes module accessors + backward-compat methods. App imports unchanged. Tests structured. |
| 13 | SDK: agent methods | ☐ | | |
| 14 | SDK: auction methods | ☐ | | |
| 15 | SDK: PER session key flow | ☐ | | |
| 16 | SDK: Private Payments API adapter | ☐ | | |
| 17 | x402 facilitator service | ☐ | | |
| 18 | App rebrand + delete old wallet-centric UI | ☐ | | |
| 19 | App: Treasury console | ☐ | | |
| 20 | App: Agent dashboard | ☐ | | |
| 21 | App: Auction marketplace | ☐ | | |
| 22 | App: x402 live demo | ☐ | | |
| 23 | Full integration test suite | ☐ | | |
| 24 | Devnet deployment + MagicBlock testing endpoint | ☐ | | |
| 25 | README, docs, demo video script | ☐ | | |

Status: ☐ not started · 🔄 in progress · ✅ done · ⚠️ blocked
