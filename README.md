# Sable

A production-grade Solana program implementing a vault + per-user-per-mint ledger system with MagicBlock Ephemeral Rollup integration.

## Overview

Sable provides a wallet-like experience where:
- **Real tokens** live in a program-controlled vault (Vault ATA per mint)
- **User balances** are tracked in PDAs (ledger accounts), NOT by moving SPL tokens for internal transfers
- **Internal transfers** update ledger balances atomically
- **Withdrawals** are only allowed when user state is NOT delegated (i.e., committed back to L1)

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Sable                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Config    │  │  UserState  │  │      UserBalance        │  │
│  │  (global)   │  │  (per user) │  │   (per user per mint)   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Vault Authority PDA                         │    │
│  │   ┌─────────────────┐  ┌─────────────────┐              │    │
│  │   │   Vault ATA 1   │  │   Vault ATA 2   │  ...         │    │
│  │   │   (Mint A)      │  │   (Mint B)      │              │    │
│  │   └─────────────────┘  └─────────────────┘              │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   MagicBlock Ephemeral Rollup                   │
│  - Delegate state to ER for fast/cheap transactions             │
│  - Commit/Undelegate back to L1 for withdrawals                 │
└─────────────────────────────────────────────────────────────────┘
```

## Features

### Core Instructions
- `initialize` - Initialize program config and vault authority
- `join` - Create a UserState PDA for a new user
- `add_mint` - Add a new mint to track for a user
- `complete_setup` - One-transaction setup with wSOL + up to 9 additional mints
- `deposit` - Deposit tokens into vault and credit ledger
- `transfer_batch` - Internal ledger transfers (batch up to 15 recipients)
- `withdraw` - Withdraw tokens from vault (L1 only)

### MagicBlock Integration
- `delegate_user_state_and_balances` - Request delegation to Ephemeral Rollup
- `commit_and_undelegate_user_state_and_balances` - Request commit/undelegate back to L1
- **Event-based delegation**: Emits events for MagicBlock indexer (actual CPI requires compatible SDK)
- **Delegation status checking**: SDK provides `isDelegated()` and `getDelegationStatus()` methods

### Security Invariants
- ✅ Credits cannot happen unless debits happen (atomic)
- ✅ Total debit must be ≤ balance
- ✅ No underflow/overflow (checked arithmetic)
- ✅ Withdraw blocked while delegated (owner != program_id)
- ✅ Duplicate mint prevention in setup

## Prerequisites

- Rust 1.85.0+
- Solana CLI 2.3.13+
- Anchor CLI 0.32.1+
- Node.js 24+
- pnpm 9+

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Build the Program

```bash
pnpm anchor:build
```

### 3. Run Tests

```bash
# Start local validator in one terminal
solana-test-validator

# In another terminal
pnpm anchor:test
```

### 4. Start the Web App

```bash
pnpm app:dev
```

The app will be available at `http://localhost:3000`.

## Program ID

**Devnet/Mainnet**: `SABLE_PROGRAM_ID_TBD`

## MagicBlock Integration Details

### Current Implementation

The program includes event-based delegation support:

1. **`delegate_user_state_and_balances`** - Emits `RequestDelegateEvent` and logs delegation request
2. **`commit_and_undelegate_user_state_and_balances`** - Emits `RequestCommitUndelegateEvent` and logs commit request

### Delegation Flow

```
┌──────────┐     ┌──────────────────┐     ┌─────────────────────────────┐
│   User   │────▶│  Program         │────▶│  MagicBlock Indexer         │
│          │     │  (emit event)    │     │  (processes delegation)     │
└──────────┘     └──────────────────┘     └─────────────────────────────┘
```

### Full CPI Integration (Future)

To enable actual CPI calls to MagicBlock:

1. Wait for `ephemeral-rollups-sdk` compatible with Anchor 0.32.x
2. Replace event emission with CPI calls using proper instruction discriminators
3. Add MagicBlock validator configuration per environment

### Delegation Status

The SDK provides methods to check delegation status:

```typescript
// Check if a specific account is delegated
const isDelegated = await sdk.isDelegated(userStatePda);

// Get status for all user accounts
const status = await sdk.getDelegationStatus(owner, mintList);
// Returns: [{ account: PublicKey, isDelegated: boolean }, ...]

// Check if any accounts are delegated
const hasDelegated = await sdk.hasDelegatedAccounts(owner, mintList);
```

## SDK Usage

### Complete Setup (wSOL + Additional Mints)

```typescript
import { SableSdk, WSOL_MINT } from '@sable/sdk';

const sdk = new SableSdk({
  programId: new PublicKey('SABLE_PROGRAM_ID_TBD'),
  connection,
  wallet,
});

// Setup with wSOL (default) + additional mints
const additionalMints = [
  new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), // USDC
  new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'), // USDT
];

await sdk.completeSetup(additionalMints);
```

### Deposit

```typescript
await sdk.deposit({
  mint: WSOL_MINT,
  amount: new BN(1_000_000_000), // 1 wSOL
});
```

### Batch Transfer (Internal)

```typescript
const items = [
  { toOwner: recipient1, amount: new BN(100_000_000) },
  { toOwner: recipient2, amount: new BN(200_000_000) },
  // ... up to 15 per transaction
];

await sdk.transferBatch({ mint: WSOL_MINT, items });

// For large batches (auto-chunked)
await sdk.transferBatchChunked(WSOL_MINT, largeItemsArray, 15);
```

### Withdraw (L1 Only)

```typescript
// Withdrawal is blocked if account is delegated
// Must commit/undelegate first
await sdk.withdraw({
  mint: WSOL_MINT,
  amount: new BN(500_000_000),
});
```

### Delegation

```typescript
// Delegate to MagicBlock ER
await sdk.delegate({
  mintList: [WSOL_MINT, usdcMint],
});

// Check delegation status
const status = await sdk.getDelegationStatus(owner, [WSOL_MINT, usdcMint]);

// Commit and undelegate back to L1
await sdk.commitAndUndelegate({
  mintList: [WSOL_MINT, usdcMint],
});
```

## Development

### Project Structure

```
.
├── programs/sable/    # Anchor program
│   ├── src/
│   │   ├── lib.rs           # Main program
│   │   ├── error.rs         # Error codes
│   │   ├── events.rs        # Event definitions
│   │   ├── magicblock.rs    # MagicBlock integration
│   │   └── state.rs         # Account state definitions
│   └── Cargo.toml
├── packages/
│   ├── sdk/                 # TypeScript SDK
│   └── common/              # Shared types
├── app/                     # Next.js web app
└── scripts/
    └── install-toolchain.sh # Dev environment setup
```

### Building

```bash
# Build program
cd programs/sable && cargo build-sbf

# Build SDK
pnpm -r build

# Build everything
pnpm build:all
```

### Testing

```bash
# Unit tests
cargo test

# Integration tests (requires local validator)
anchor test

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

### Verification

```bash
# Full verification (lint + typecheck + build)
pnpm verify
```

## License

MIT

## Credits

- Built with [Anchor Framework](https://github.com/coral-xyz/anchor)
- Ephemeral Rollup integration via [MagicBlock](https://magicblock.gg)
