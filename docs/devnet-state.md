# Devnet State

## Redeploy History

| Date | Slot | Program ID | Data Length |
|------|------|------------|-------------|
| 2026-04-20 | 456,905,626 | `SaSAXcdWhyr1KD8TKRg6K7WPuxcPLZJHKEwsjQgL5Di` | 1,005,568 bytes |
| (pre-redeploy) | 456,683,037 | `SaSAXcdWhyr1KD8TKRg6K7WPuxcPLZJHKEwsjQgL5Di` | 551,072 bytes |

## Policy

- **Deployer keypair** (`8kT3TNseXvndt8Xz9teRZ6Z4ygDrZqiTxNAw8pQApGAF`) is **admin/upgrade authority only**.
- **Test users** are generated per-run (`Keypair.generate()`). Do not reuse the deployer as a test user.
- **Orphaned pre-redeploy UserState** at `FfZav6HhwvstmswNFPMdPKjiKW7Ccow95fABnfgZAmG` is rent-paid and benign. Do not attempt to close it; the program has no `close_user_state` instruction.
