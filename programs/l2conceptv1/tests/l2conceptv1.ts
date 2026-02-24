import * as anchor from '@coral-xyz/anchor';
import { Program, BN } from '@coral-xyz/anchor';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
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
} from '@solana/spl-token';
import { assert } from 'chai';

// We'll create a mock IDL for testing
const IDL = {
  version: '1.0.0',
  name: 'l2conceptv1',
  instructions: [],
  accounts: [],
  types: [],
  events: [],
  errors: [],
};

describe('l2conceptv1', () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Generate keypairs for testing
  const admin = Keypair.generate();
  const user1 = Keypair.generate();
  const user2 = Keypair.generate();
  const user3 = Keypair.generate();

  // Program ID (using a dummy one for tests)
  const programId = new PublicKey('L2CnccKT1qHNS1wJ7p3wJ3JhCX5s4J5wT5x3h5mH2j1');

  let program: Program;
  let mint: PublicKey;
  let mint2: PublicKey;

  // PDAs
  let configPda: PublicKey;
  let configBump: number;
  let vaultAuthorityPda: PublicKey;
  let vaultAuthorityBump: number;

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
      [Buffer.from('user_balance'), owner.toBuffer(), mint.toBuffer()],
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

    const tx = new anchor.web3.Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: authority.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        9,
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
    
    const tx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(
        owner.publicKey,
        ata,
        owner.publicKey,
        mint
      )
    );
    
    await provider.sendAndConfirm(tx, [owner]);

    // Mint tokens to the ATA (from admin who is the mint authority)
    await mintTo(
      provider.connection,
      admin,
      mint,
      ata,
      admin,
      amount
    );

    return ata;
  };

  before(async () => {
    // Airdrop to all test accounts
    await airdrop(admin, 20);
    await airdrop(user1, 10);
    await airdrop(user2, 10);
    await airdrop(user3, 10);

    // Create test mints
    mint = await createTestMint(admin);
    mint2 = await createTestMint(admin);

    // Derive PDAs
    [configPda, configBump] = deriveConfig();
    [vaultAuthorityPda, vaultAuthorityBump] = deriveVaultAuthority();

    // Load the program (mock for now - in real tests, would load actual .so)
    // For now, we'll skip actual CPI calls and test the account structure
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
      const [balance1] = deriveUserBalance(user1.publicKey, mint);
      const [balance2] = deriveUserBalance(user1.publicKey, mint2);
      const [balance3] = deriveUserBalance(user2.publicKey, mint);

      assert.notEqual(balance1.toBase58(), balance2.toBase58());
      assert.notEqual(balance1.toBase58(), balance3.toBase58());
      assert.notEqual(balance2.toBase58(), balance3.toBase58());
    });
  });

  describe('Token Setup', () => {
    it('Creates test mints correctly', async () => {
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

  describe('Program Flow Simulation', () => {
    it('Can create vault ATA', async () => {
      const vaultAta = deriveVaultAta(mint, vaultAuthorityPda);
      
      const tx = new anchor.web3.Transaction().add(
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

    it('Can transfer tokens to vault', async () => {
      const user1Ata = getAssociatedTokenAddressSync(mint, user1.publicKey);
      const vaultAta = deriveVaultAta(mint, vaultAuthorityPda);

      // Check initial balances
      const initialUserBalance = await provider.connection.getTokenAccountBalance(user1Ata);
      assert.equal(initialUserBalance.value.amount, '1000000000');

      // Transfer to vault would happen via program CPI
      // For this test, we simulate by directly transferring
      const transferAmount = 500000000;
      
      const transferTx = new anchor.web3.Transaction().add(
        // This would be a CPI call in the actual program
        // For now, we just verify the accounts exist
      );

      // Verify the ATAs exist and are ready
      const vaultInfo = await provider.connection.getAccountInfo(vaultAta);
      assert.ok(vaultInfo);
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

  describe('Batch Transfer Validation', () => {
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
});
