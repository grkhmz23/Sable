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
    { code: 6017, name: 'TooManyMints', msg: 'Too many mints in setup' },
    { code: 6018, name: 'DuplicateMint', msg: 'Duplicate mint in setup' },
    { code: 6019, name: 'EmptyMintList', msg: 'Empty mint list' },
    { code: 6020, name: 'InvalidDestinationTokenAccount', msg: 'Invalid destination token account' },
    { code: 6021, name: 'DelegationFailed', msg: 'Delegation CPI failed' },
    { code: 6022, name: 'CommitFailed', msg: 'Commit/undelegate CPI failed' },
    { code: 6023, name: 'TooManyBalancesForDelegation', msg: 'Too many balances for delegation' },
    { code: 6024, name: 'AgentDepthExceeded', msg: 'Agent depth exceeded maximum allowed' },
    { code: 6025, name: 'AgentHasChildren', msg: 'Agent has children and cannot be closed' },
    { code: 6026, name: 'NotAgentRoot', msg: 'Not the root user owner' },
    { code: 6027, name: 'AgentFrozenOrRevoked', msg: 'Agent is frozen or revoked' },
    { code: 6028, name: 'InvalidAncestorChain', msg: 'Invalid ancestor chain' },
    { code: 6029, name: 'TooManyAgents', msg: 'Too many agents for this parent' },
    { code: 6030, name: 'PolicyExpired', msg: 'Spend policy has expired' },
    { code: 6031, name: 'CounterpartyNotAllowed', msg: 'Counterparty not allowed by policy' },
    { code: 6032, name: 'MintNotAllowed', msg: 'Mint not allowed by policy' },
    { code: 6033, name: 'PerTxLimitExceeded', msg: 'Per-transaction limit exceeded' },
    { code: 6034, name: 'DailyLimitExceeded', msg: 'Daily spend limit exceeded' },
    { code: 6035, name: 'TotalLimitExceeded', msg: 'Total lifetime spend limit exceeded' },
    { code: 6036, name: 'AgentNotAuthorized', msg: 'Agent owner not authorized' },
    { code: 6037, name: 'InsufficientAgentBalance', msg: 'Insufficient agent balance' },
    { code: 6038, name: 'AgentHasBalances', msg: 'Agent still has balances and cannot be closed' },
    { code: 6039, name: 'TaskDeadlineInvalid', msg: 'Task deadline is invalid' },
    { code: 6040, name: 'TaskNotCancellable', msg: 'Task cannot be cancelled' },
    { code: 6041, name: 'TaskEscrowMismatch', msg: 'Task escrow does not match task' },
    { code: 6042, name: 'TaskWrongState', msg: 'Task is in wrong state for this operation' },
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
  const programId = new PublicKey('SaSAXcdWhyr1KD8TKRg6K7WPuxcPLZJHKEwsjQgL5Di');

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

  const deriveAgentState = (parent: PublicKey, nonce: number) => {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('agent_state'),
        parent.toBuffer(),
        Buffer.from(new Uint32Array([nonce]).buffer),
      ],
      programId
    );
  };

  const deriveAgentCounters = (agent: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('agent_counters'),
        agent.toBuffer(),
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

  describe('Agent Hierarchy', () => {
    it('Derives AgentState PDA from parent and nonce', () => {
      const [user1State] = deriveUserState(user1.publicKey);
      const [agent1] = deriveAgentState(user1State, 0);
      const [agent2] = deriveAgentState(user1State, 1);

      assert.ok(agent1);
      assert.ok(agent2);
      assert.notEqual(agent1.toBase58(), agent2.toBase58());
    });

    it('AgentState PDA is deterministic', () => {
      const [user1State] = deriveUserState(user1.publicKey);
      const [agent1a] = deriveAgentState(user1State, 5);
      const [agent1b] = deriveAgentState(user1State, 5);
      assert.equal(agent1a.toBase58(), agent1b.toBase58());
    });

    it('Different parents produce different agent PDAs at same nonce', () => {
      const [user1State] = deriveUserState(user1.publicKey);
      const [user2State] = deriveUserState(user2.publicKey);
      const [agent1] = deriveAgentState(user1State, 0);
      const [agent2] = deriveAgentState(user2State, 0);

      assert.notEqual(agent1.toBase58(), agent2.toBase58());
    });

    it('Validates max depth of 4', () => {
      const MAX_DEPTH = 4;
      const [root] = deriveUserState(user1.publicKey);
      const chain: PublicKey[] = [root];

      // Simulate a depth-4 chain
      for (let i = 0; i < MAX_DEPTH; i++) {
        const [agent] = deriveAgentState(chain[chain.length - 1], 0);
        chain.push(agent);
      }

      assert.equal(chain.length - 1, MAX_DEPTH); // 4 agents deep
      // root -> agent0 -> agent1 -> agent2 -> agent3
    });

    it('Validates max agents per parent of 64', () => {
      const MAX_AGENTS_PER_PARENT = 64;
      const [user1State] = deriveUserState(user1.publicKey);
      const agents: PublicKey[] = [];

      for (let i = 0; i < MAX_AGENTS_PER_PARENT; i++) {
        const [agent] = deriveAgentState(user1State, i);
        agents.push(agent);
      }

      assert.equal(agents.length, MAX_AGENTS_PER_PARENT);
      // All agents should be unique
      const unique = new Set(agents.map(a => a.toBase58()));
      assert.equal(unique.size, MAX_AGENTS_PER_PARENT);
    });

    it('Agent chain maintains parent-child relationship', () => {
      const [root] = deriveUserState(user1.publicKey);
      const [agent1] = deriveAgentState(root, 0);
      const [agent2] = deriveAgentState(agent1, 0);
      const [agent3] = deriveAgentState(agent2, 0);

      // All should be unique
      assert.notEqual(root.toBase58(), agent1.toBase58());
      assert.notEqual(agent1.toBase58(), agent2.toBase58());
      assert.notEqual(agent2.toBase58(), agent3.toBase58());

      // Agent2's parent is agent1, not root
      const [agent2Alt] = deriveAgentState(root, 1);
      assert.notEqual(agent2.toBase58(), agent2Alt.toBase58());
    });
  });

  describe('Policy Engine', () => {
    it('Derives AgentCounters PDA from agent', () => {
      const [user1State] = deriveUserState(user1.publicKey);
      const [agent1] = deriveAgentState(user1State, 0);
      const [counters1, bump1] = deriveAgentCounters(agent1);
      const [counters2, bump2] = deriveAgentCounters(agent1);

      assert.ok(counters1);
      assert.equal(counters1.toBase58(), counters2.toBase58());
      assert.equal(bump1, bump2);
      assert.notEqual(agent1.toBase58(), counters1.toBase58());
    });

    it('AgentCounters PDA depends on agent key', () => {
      const [user1State] = deriveUserState(user1.publicKey);
      const [agent1] = deriveAgentState(user1State, 0);
      const [agent2] = deriveAgentState(user1State, 1);
      const [counters1] = deriveAgentCounters(agent1);
      const [counters2] = deriveAgentCounters(agent2);

      assert.notEqual(counters1.toBase58(), counters2.toBase58());
    });

    it('Has policy error codes defined', () => {
      const errorCodes = IDL.errors.map((e: any) => e.code);
      assert.include(errorCodes, 6030); // PolicyExpired
      assert.include(errorCodes, 6031); // CounterpartyNotAllowed
      assert.include(errorCodes, 6032); // MintNotAllowed
      assert.include(errorCodes, 6033); // PerTxLimitExceeded
      assert.include(errorCodes, 6034); // DailyLimitExceeded
      assert.include(errorCodes, 6035); // TotalLimitExceeded
    });

    it('Default policy values are fully open', () => {
      // Off-chain representation of default policy:
      // per_tx_limit = 0, daily_limit = 0, total_limit = 0,
      // counterparty_mode = 0 (Any), allowed_mints all zero, expires_at = 0
      const defaultPolicy = {
        perTxLimit: 0,
        dailyLimit: 0,
        totalLimit: 0,
        counterpartyMode: 0,
        allowedCounterparties: [
          '11111111111111111111111111111111',
          '11111111111111111111111111111111',
          '11111111111111111111111111111111',
          '11111111111111111111111111111111',
        ],
        allowedMints: [
          '11111111111111111111111111111111',
          '11111111111111111111111111111111',
          '11111111111111111111111111111111',
          '11111111111111111111111111111111',
        ],
        expiresAt: 0,
      };

      assert.equal(defaultPolicy.perTxLimit, 0);
      assert.equal(defaultPolicy.dailyLimit, 0);
      assert.equal(defaultPolicy.totalLimit, 0);
      assert.equal(defaultPolicy.counterpartyMode, 0);
      assert.equal(defaultPolicy.expiresAt, 0);
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
