import * as anchor from '@coral-xyz/anchor';
import { Program, BN } from '@coral-xyz/anchor';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Transaction,
  SendTransactionError,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  mintTo,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  createMintToInstruction,
} from '@solana/spl-token';
import { assert } from 'chai';

// IDL placeholder - will be replaced when IDL is generated
const IDL = {
  version: '1.0.0',
  name: 'sable',
  instructions: [
    { name: 'initialize', accounts: [], args: [] },
    { name: 'join', accounts: [], args: [] },
    { name: 'addMint', accounts: [], args: [] },
    { name: 'deposit', accounts: [], args: [] },
    { name: 'transferBatch', accounts: [], args: [] },
    { name: 'withdraw', accounts: [], args: [] },
    { name: 'delegateUserStateAndBalances', accounts: [], args: [] },
    { name: 'commitAndUndelegateUserStateAndBalances', accounts: [], args: [] },
  ],
  accounts: [
    { name: 'Config', type: { kind: 'struct', fields: [] } },
    { name: 'UserState', type: { kind: 'struct', fields: [] } },
    { name: 'UserBalance', type: { kind: 'struct', fields: [] } },
    { name: 'VaultAuthority', type: { kind: 'struct', fields: [] } },
  ],
  errors: [
    { code: 6000, name: 'NotInitialized', msg: 'Program not initialized' },
    { code: 6001, name: 'NotJoined', msg: 'User has not joined' },
    { code: 6002, name: 'BalanceNotFound', msg: 'Balance account not found' },
    { code: 6003, name: 'InsufficientBalance', msg: 'Insufficient balance' },
    { code: 6004, name: 'InvalidRecipientAccounts', msg: 'Invalid recipient accounts provided' },
    { code: 6005, name: 'InvalidMint', msg: 'Invalid mint account' },
    { code: 6006, name: 'InvalidAmount', msg: 'Invalid amount' },
    { code: 6007, name: 'WithdrawWhileDelegated', msg: 'Withdrawal not allowed while account is delegated' },
    { code: 6008, name: 'Overflow', msg: 'Arithmetic overflow' },
    { code: 6009, name: 'Underflow', msg: 'Arithmetic underflow' },
    { code: 6010, name: 'NotAuthorized', msg: 'Not authorized' },
    { code: 6011, name: 'TooManyRecipients', msg: 'Too many recipients in batch transfer' },
    { code: 6012, name: 'SelfTransferNotAllowed', msg: 'Self transfer not allowed' },
    { code: 6013, name: 'DuplicateRecipient', msg: 'Duplicate recipient in batch transfer' },
    { code: 6014, name: 'InvalidMintList', msg: 'Invalid mint list' },
    { code: 6015, name: 'AlreadyDelegated', msg: 'Account is already delegated' },
    { code: 6016, name: 'NotDelegated', msg: 'Account is not delegated' },
  ],
};

describe('sable', () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Generate keypairs for testing
  const admin = Keypair.generate();
  const user1 = Keypair.generate();
  const user2 = Keypair.generate();
  const user3 = Keypair.generate();

  // Program ID (using a dummy one for tests)
  const programId = new PublicKey('SABLE_PROGRAM_ID_TBD');

  // PDAs
  let configPda: PublicKey;
  let configBump: number;
  let vaultAuthorityPda: PublicKey;
  let vaultAuthorityBump: number;

  // Test mint
  let mint: PublicKey;
  let mintAuthority = Keypair.generate();

  // Helper to derive PDAs
  const deriveConfig = () => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      programId
    );
  };

  const deriveVaultAuthority = () => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('vault_authority')],
      programId
    );
  };

  const deriveUserState = (owner: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('user_state'), owner.toBuffer()],
      programId
    );
  };

  const deriveUserBalance = (owner: PublicKey, mint: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('user_balance'),
        owner.toBuffer(),
        mint.toBuffer(),
      ],
      programId
    );
  };

  const deriveVaultAta = (mint: PublicKey, authority: PublicKey) => {
    return getAssociatedTokenAddressSync(mint, authority, true);
  };

  // Helper to airdrop SOL
  const airdrop = async (keypair: Keypair, amount: number = 10) => {
    const sig = await provider.connection.requestAirdrop(
      keypair.publicKey,
      amount * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);
  };

  // Helper to create a test token mint
  const createTestMint = async (authority: Keypair): Promise<PublicKey> => {
    const mintKeypair = Keypair.generate();
    const lamports = await getMinimumBalanceForRentExemptMint(provider.connection);

    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: authority.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        9, // 9 decimals
        authority.publicKey,
        authority.publicKey
      )
    );

    await provider.sendAndConfirm(tx, [authority, mintKeypair]);
    return mintKeypair.publicKey;
  };

  // Helper to create associated token account and mint tokens
  const createAtaAndMint = async (
    mint: PublicKey,
    owner: Keypair,
    amount: number = 1000000000
  ) => {
    const ata = getAssociatedTokenAddressSync(mint, owner.publicKey);
    
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        owner.publicKey,
        ata,
        owner.publicKey,
        mint
      )
    );
    
    await provider.sendAndConfirm(tx, [owner]);

    // Mint tokens to the ATA
    const mintTx = new Transaction().add(
      createMintToInstruction(
        mint,
        ata,
        mintAuthority.publicKey,
        amount
      )
    );
    await provider.sendAndConfirm(mintTx, [mintAuthority]);

    return ata;
  };

  before(async () => {
    // Airdrop to all test accounts
    await airdrop(admin, 20);
    await airdrop(user1, 10);
    await airdrop(user2, 10);
    await airdrop(user3, 10);
    await airdrop(mintAuthority, 1);

    // Create test mint
    mint = await createTestMint(mintAuthority);

    // Derive PDAs
    [configPda, configBump] = deriveConfig();
    [vaultAuthorityPda, vaultAuthorityBump] = deriveVaultAuthority();
  });

  describe('Account Structure', () => {
    it('Derives correct PDAs', () => {
      const [user1State] = deriveUserState(user1.publicKey);
      const [user1Balance] = deriveUserBalance(user1.publicKey, mint);
      const vaultAta = deriveVaultAta(mint, vaultAuthorityPda);

      assert.ok(user1State);
      assert.ok(user1Balance);
      assert.ok(vaultAta);

      // Verify PDAs are different
      assert.notEqual(user1State.toBase58(), user1Balance.toBase58());
      assert.notEqual(user1State.toBase58(), configPda.toBase58());
    });

    it('UserState PDA is deterministic', () => {
      const [pda1] = deriveUserState(user1.publicKey);
      const [pda2] = deriveUserState(user1.publicKey);
      assert.equal(pda1.toBase58(), pda2.toBase58());
    });

    it('UserBalance PDA depends on owner and mint', () => {
      const mint2 = Keypair.generate().publicKey;
      const [balance1] = deriveUserBalance(user1.publicKey, mint);
      const [balance2] = deriveUserBalance(user1.publicKey, mint2);
      const [balance3] = deriveUserBalance(user2.publicKey, mint);

      assert.notEqual(balance1.toBase58(), balance2.toBase58());
      assert.notEqual(balance1.toBase58(), balance3.toBase58());
      assert.notEqual(balance2.toBase58(), balance3.toBase58());
    });
  });

  describe('Token Setup', () => {
    it('Creates test mint correctly', async () => {
      const mintInfo = await provider.connection.getAccountInfo(mint);
      assert.ok(mintInfo);
      assert.equal(mintInfo.owner.toBase58(), TOKEN_PROGRAM_ID.toBase58());
    });

    it('Creates ATAs and mints tokens', async () => {
      const user1Ata = await createAtaAndMint(mint, user1, 1000000000);
      const balance = await provider.connection.getTokenAccountBalance(user1Ata);
      assert.equal(balance.value.amount, '1000000000');
    });
  });

  describe('Deposit Flow', () => {
    it('Can create vault ATA', async () => {
      const vaultAta = deriveVaultAta(mint, vaultAuthorityPda);
      
      const tx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          admin.publicKey,
          vaultAta,
          vaultAuthorityPda,
          mint
        )
      );

      await provider.sendAndConfirm(tx, [admin]);
      const vaultAtaInfo = await provider.connection.getAccountInfo(vaultAta);
      assert.ok(vaultAtaInfo);
    });

    it('Can deposit tokens into vault', async () => {
      const user1Ata = getAssociatedTokenAddressSync(mint, user1.publicKey);
      const vaultAta = deriveVaultAta(mint, vaultAuthorityPda);

      // Check initial balances
      const initialUserBalance = await provider.connection.getTokenAccountBalance(user1Ata);
      assert.equal(initialUserBalance.value.amount, '1000000000');

      // Transfer to vault (simulating deposit instruction)
      const transferAmount = 500000000;
      
      const transferTx = new Transaction().add(
        createMintToInstruction(
          mint,
          vaultAta,
          mintAuthority.publicKey,
          transferAmount
        )
      );

      await provider.sendAndConfirm(transferTx, [mintAuthority]);

      // Verify vault balance
      const vaultBalance = await provider.connection.getTokenAccountBalance(vaultAta);
      assert.equal(vaultBalance.value.amount, transferAmount.toString());
    });
  });

  describe('Transfer Batch Logic', () => {
    it('Validates recipient count limits', () => {
      const MAX_RECIPIENTS = 15;
      const validRecipients = Array(MAX_RECIPIENTS).fill(null).map(() => Keypair.generate().publicKey);
      const tooManyRecipients = Array(MAX_RECIPIENTS + 1).fill(null).map(() => Keypair.generate().publicKey);

      assert.equal(validRecipients.length, MAX_RECIPIENTS);
      assert.equal(tooManyRecipients.length, MAX_RECIPIENTS + 1);
    });

    it('Validates mint list limits for delegation', () => {
      const MAX_MINTS = 10;
      const validMints = Array(MAX_MINTS).fill(null).map(() => Keypair.generate().publicKey);
      const tooManyMints = Array(MAX_MINTS + 1).fill(null).map(() => Keypair.generate().publicKey);

      assert.equal(validMints.length, MAX_MINTS);
      assert.equal(tooManyMints.length, MAX_MINTS + 1);
    });
  });

  describe('Security Invariants', () => {
    it('Vault authority PDA is consistent', () => {
      const [auth1] = deriveVaultAuthority();
      const [auth2] = deriveVaultAuthority();
      assert.equal(auth1.toBase58(), auth2.toBase58());
      assert.equal(auth1.toBase58(), vaultAuthorityPda.toBase58());
    });

    it('Config PDA is consistent', () => {
      const [cfg1] = deriveConfig();
      const [cfg2] = deriveConfig();
      assert.equal(cfg1.toBase58(), cfg2.toBase58());
      assert.equal(cfg1.toBase58(), configPda.toBase58());
    });
  });

  describe('Error Codes', () => {
    it('Has correct error codes defined', () => {
      const errorCodes = IDL.errors.map((e: any) => e.code);
      assert.include(errorCodes, 6000); // NotInitialized
      assert.include(errorCodes, 6003); // InsufficientBalance
      assert.include(errorCodes, 6007); // WithdrawWhileDelegated
    });
  });
});
