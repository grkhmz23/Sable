# L2Concept V1

A production-grade Solana program implementing a vault + per-user-per-mint ledger system with MagicBlock Ephemeral Rollup integration.

## Overview

L2Concept V1 provides a wallet-like experience where:
- **Real tokens** live in a program-controlled vault (Vault ATA per mint)
- **User balances** are tracked in PDAs (ledger accounts), NOT by moving SPL tokens for internal transfers
- **Internal transfers** update ledger balances atomically
- **Withdrawals** are only allowed when user state is NOT delegated (i.e., committed back to L1)

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         L2Concept V1                             │
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
- `deposit` - Deposit tokens into vault and credit ledger
- `transfer_batch` - Internal ledger transfers (batch up to 15 recipients)
- `withdraw` - Withdraw tokens from vault (L1 only)

### MagicBlock Integration
- `delegate_user_state_and_balances` - Move accounts to Ephemeral Rollup
- `commit_and_undelegate_user_state_and_balances` - Return accounts to L1

### Security Invariants
- ✅ Credits cannot happen unless debits happen (atomic)
- ✅ Total debit must be ≤ balance
- ✅ No underflow/overflow (checked arithmetic)
- ✅ Withdraw blocked while delegated (owner != program_id)

## Prerequisites

- Rust 1.85.0+
- Solana CLI 1.17.0+
- Anchor CLI 0.29.0+
- Node.js 20+
- pnpm 8+

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

## Environment Variables

Create a `.env` file in the app directory:

```env
# Solana RPC
NEXT_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:8899

# MagicBlock (optional)
NEXT_PUBLIC_MAGICBLOCK_RPC_URL=https://devnet.magicblock.app
NEXT_PUBLIC_MAGIC_ROUTER_URL=https://router.magicblock.app

# Program ID (will use default if not set)
NEXT_PUBLIC_L2CONCEPTV1_PROGRAM_ID=L2CnccKT1qHNS1wJ7p3wJ3JhCX5s4J5wT5x3h5mH2j1
```

## Project Structure

```
/
├── programs/l2conceptv1/    # Anchor program
│   ├── src/
│   │   ├── lib.rs          # Main program logic
│   │   ├── state.rs        # Account structs
│   │   ├── error.rs        # Error codes
│   │   └── events.rs       # Event definitions
│   └── tests/              # Anchor tests
├── packages/
│   ├── common/             # Shared constants and types
│   └── sdk/                # TypeScript SDK
│       ├── src/
│       │   ├── sdk.ts      # Main SDK class
│       │   ├── pda.ts      # PDA derivation helpers
│       │   └── types.ts    # TypeScript types
│       └── idl/            # Generated IDL
├── app/                    # Next.js web app
│   ├── src/
│   │   ├── app/            # Next.js app router
│   │   ├── components/     # React components
│   │   └── contexts/       # Wallet context
│   └── .env                # Environment variables
└── scripts/                # Build and deploy scripts
```

## Usage Guide

### SDK Usage

```typescript
import { L2ConceptSdk } from '@l2conceptv1/sdk';
import { Connection, PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

const connection = new Connection('http://127.0.0.1:8899');

const sdk = new L2ConceptSdk({
  programId: new PublicKey('L2CnccKT1qHNS1wJ7p3wJ3JhCX5s4J5wT5x3h5mH2j1'),
  connection,
  wallet, // From wallet adapter
});

// Join the program
await sdk.join();

// Add a mint
await sdk.addMint(mintPubkey);

// Deposit tokens
await sdk.deposit({
  mint: mintPubkey,
  amount: new BN(1000000000), // 1 token with 9 decimals
});

// Transfer to multiple recipients
await sdk.transferBatchChunked(
  mintPubkey,
  [
    { toOwner: recipient1, amount: new BN(100000000) },
    { toOwner: recipient2, amount: new BN(200000000) },
  ],
  15 // chunk size
);

// Delegate to ER for fast transactions
await sdk.delegate({
  mintList: [mintPubkey],
});

// Later: commit/undelegate back to L1
await sdk.commitAndUndelegate({
  mintList: [mintPubkey],
});

// Withdraw (only works when not delegated)
await sdk.withdraw({
  mint: mintPubkey,
  amount: new BN(500000000),
});
```

### Web App

The web app provides a wallet-like interface with:

1. **Wallet Connection** - Connect via Phantom, Solflare, etc.
2. **Routing Mode Selector**:
   - **Solana (L1)**: Direct RPC to Solana
   - **MagicBlock ER**: Direct RPC to Ephemeral Rollup
   - **Magic Router**: Intelligent routing via MagicBlock

3. **Actions**:
   - **Join**: Create your UserState
   - **Add Mint**: Track a new token
   - **Deposit**: Move tokens into vault
   - **Send**: Batch transfers to multiple recipients
   - **Withdraw**: Move tokens out (L1 only)
   - **Delegate/Commit**: Manage ER delegation

## How Ephemeral Rollup Works

```
┌─────────────┐     Delegate      ┌──────────────────┐
│   Solana    │ ─────────────────▶ │  MagicBlock ER   │
│   (L1)      │                    │  (Fast/Cheap)    │
│             │ ◀───────────────── │                  │
└─────────────┘   Commit/Undelegate └──────────────────┘
       │                                    │
       │         Transfer Batch             │
       │         (ledger updates)           │
       │                                    │
       ▼                                    ▼
   Withdraw only                         Fast transfers
   works here                            (delegated state)
```

### Delegation Flow

1. **Delegate**: Move your `UserState` and `UserBalance` accounts to ER
   - Takes ~1-2 seconds (one Solana transaction)
   - While delegated, ER has exclusive write access

2. **Use on ER**: Perform fast/cheap operations
   - Transfer batches complete in milliseconds
   - Costs fractions of a penny

3. **Commit/Undelegate**: Return accounts to L1
   - Finalizes state on Solana
   - Required before withdrawal

## Deployment

### Devnet

```bash
# Deploy
./scripts/deploy.sh devnet

# Configure environment
export NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
export NEXT_PUBLIC_MAGICBLOCK_RPC_URL=https://devnet.magicblock.app
```

### Mainnet

```bash
# Deploy
./scripts/deploy.sh mainnet

# Configure environment
export NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
export NEXT_PUBLIC_MAGICBLOCK_RPC_URL=https://mainnet.magicblock.app
```

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm anchor:build` | Build the Anchor program |
| `pnpm anchor:test` | Run Anchor tests |
| `pnpm anchor:deploy:devnet` | Deploy to devnet |
| `pnpm app:dev` | Start Next.js dev server |
| `pnpm app:build` | Build Next.js app |
| `pnpm idl:sync` | Sync IDL to SDK and app |
| `pnpm build:all` | Build everything |

## Testing

### Unit Tests

```bash
pnpm anchor:test
```

Tests cover:
- Account structure validation
- PDA derivation correctness
- Token operations
- Batch transfer limits
- Security invariants

### Manual Testing

1. Start local validator: `solana-test-validator`
2. Deploy program: `anchor deploy`
3. Run app: `pnpm app:dev`
4. Connect wallet and test all flows

## Common Issues

### "Account not found"
- Make sure you've `join`ed the program
- Ensure you've `add_mint` for the token you're using

### "Withdrawal not allowed while delegated"
- You must `commit_and_undelegate` before withdrawing
- Check your routing mode - withdraw only works on L1

### "Transaction too large"
- Batch transfers are automatically chunked
- Maximum 15 recipients per transaction

### "Invalid recipient accounts"
- Recipients must have `join`ed and `add_mint` for the same token
- Verify recipient addresses are correct

## Security Considerations

1. **Delegation State**: Always check if accounts are delegated before withdrawals
2. **Atomic Transfers**: Batch transfers are all-or-nothing
3. **PDA Validation**: All PDAs are validated on-chain
4. **Owner Checks**: All sensitive operations verify the signer owns the accounts

## License

MIT

## Contributing

Contributions are welcome! Please ensure:
- All tests pass
- No hardcoded secrets or API keys
- Code follows existing patterns
- Documentation is updated
