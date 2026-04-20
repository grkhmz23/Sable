# Sable — Private Programmable Money for AI Agents

Sable is a privacy-first money layer for autonomous agents on Solana. It combines hierarchical agent treasuries, sealed-bid auctions, and x402 pay-per-request payments — all running inside MagicBlock's Private Ephemeral Rollups so balances and bids stay invisible on L1 until explicitly revealed.

![x402 Demo](docs/x402-demo.gif)

## Live Deployment

| Component | URL |
|---|---|
| App (Treasury Console) | *Pending Prompt 24* |
| x402 Facilitator | *Pending Prompt 24* |
| Program (Devnet) | [SaSAXcdWhyr1KD8TKRg6K7WPuxcPLZJHKEwsjQgL5Di](https://explorer.solana.com/address/SaSAXcdWhyr1KD8TKRg6K7WPuxcPLZJHKEwsjQgL5Di?cluster=devnet) |

## How It Works

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Sable Program                               │
├─────────────────────────────────────────────────────────────────────────┤
│  UserState ──► AgentState tree ──► AgentBalance/Policy/Counters        │
│       │                                    │                            │
│       ▼                                    ▼                            │
│  UserBalance ◄──── agent_transfer ──► TaskEscrow ◄── Bid               │
│       │                                    │                            │
│       ▼                                    ▼                            │
│  Vault ATA (SPL tokens)              PER Permission Metadata            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
        Solana L1           MagicBlock ER          MagicBlock PER
        (settlement)        (fast execution)       (private reads)
```

## MagicBlock Primitives

| Primitive | Where | File |
|---|---|---|
| **Ephemeral Rollup (ER)** | Delegate UserState + balances for <500ms internal transfers and auction phases | `programs/sable/src/lib.rs:930-966` |
| **Private Ephemeral Rollup (PER)** | Account-level READ/WRITE permissions on balances via permission metadata PDAs | `programs/sable/src/instructions/permission/` |
| **Private Payments API** | USDC on/off-ramp with AML/OFAC compliance for treasury funding | `packages/sdk/src/payments.ts` |

## Quickstart

```bash
# 1. Clone
git clone <repo> && cd sable

# 2. Install
pnpm install

# 3. Build everything
pnpm build:all

# 4. Start local validator
solana-test-validator

# 5. Run tests
pnpm test:integration

# 6. Start the app
pnpm app:dev
```

The app runs at `http://localhost:3000`. Connect your devnet wallet to explore the treasury console, agent dashboard, auction marketplace, and x402 demo.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system design, account layout, instruction map, and invariants.

Deeper technical documentation lives in [docs/architecture.md](docs/architecture.md).

## x402 Integration

Third-party merchants can accept Sable agent payments in under 500ms. See [docs/x402-integration.md](docs/x402-integration.md) for the middleware integration guide.

## Security

This is hackathon code. It has not been audited. Do not use with real funds without a professional security review.

## License

MIT

---

## Submission Checklist

- [ ] Live app URL
- [ ] Live facilitator URL
- [ ] Devnet program ID (clickable)
- [ ] Demo video link
- [ ] MagicBlock Discord proof of endpoint access
