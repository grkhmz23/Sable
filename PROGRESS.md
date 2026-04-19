# Sable Progress

| # | Prompt | Status | Commit | Notes |
|---|--------|--------|--------|-------|
| 1 | Rebrand & cleanup | ✅ | | Renamed L2Concept→Sable, cleaned event delegation, created docs |
| 2 | Real ER delegation CPI | ✅ | | Delegate + commit/undelegate via ephemeral-rollups-sdk CPI. Cargo pins for edition2024 compat.
| 3 | Declare real program ID, deploy skeleton | ✅ | a51cd4e | Program: SaSAXcdWhyr1KD8TKRg6K7WPuxcPLZJHKEwsjQgL5Di. Deployed + initialized on devnet. Explorer: https://explorer.solana.com/address/SaSAXcdWhyr1KD8TKRg6K7WPuxcPLZJHKEwsjQgL5Di?cluster=devnet
| 4 | AgentState PDA + spawn/close agent | ✅ | d2d0fd1 | AgentState, ParentKind, spawn_agent, close_agent, SDK deriveAgentState, 6 TS tests |
| 5 | Spend policy engine | ✅ | ee1c0fb | SpendPolicy, CounterpartyMode, AgentCounters, validate_spend with 16 Rust unit tests, set_policy instruction, SDK deriveAgentCounters, policy TS tests. cargo test --package sable passes. cargo build-sbf passes. anchor test blocked by GLIBC_2.39 in container.
| 6 | AgentBalance + agent transfer instructions | ☐ | | |
| 7 | Parent control: freeze, revoke, update_policy | ☐ | | |
| 8 | Task PDA + create_task / cancel_task | ☐ | | |
| 9 | Bid PDA + commit_bid | ☐ | | |
| 10 | reveal_bid + settle_auction | ☐ | | |
| 11 | PER permission metadata accounts | ☐ | | |
| 12 | SDK rename, IDL regen, module restructure | ☐ | | |
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
