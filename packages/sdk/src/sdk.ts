import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { PdaHelper } from './pda';
import {
  SdkConfig,
  DepositParams,
  WithdrawParams,
  TransferBatchParams,
  TransferItem,
  DelegateParams,
  CommitUndelegateParams,
  TransactionResult,
  BatchTransferInput,
  DEFAULT_UPDATE_FREQUENCY_MS,
  DEFAULT_TTL_SECONDS,
  MAX_BATCH_TRANSFER_RECIPIENTS,
  MAX_MINTS_PER_DELEGATION,
} from './types';

// IDL type (will be imported from IDL)
export type L2conceptv1 = any;

export class L2ConceptSdk {
  program: Program<L2conceptv1>;
  provider: AnchorProvider;
  pda: PdaHelper;
  config: SdkConfig;

  // Default MagicBlock delegation program
  static readonly DEFAULT_DELEGATION_PROGRAM = new PublicKey(
    'DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh'
  );

  constructor(config: SdkConfig) {
    this.config = config;
    this.pda = new PdaHelper(config.programId);
    
    // Create provider
    const wallet = config.wallet || ({} as any);
    this.provider = new AnchorProvider(
      config.connection,
      wallet,
      AnchorProvider.defaultOptions()
    );

    // Load IDL - in real usage, this would be imported
    const idl = this.loadIdl();
    this.program = new Program(idl, config.programId, this.provider);
  }

  private loadIdl(): any {
    // In production, import from JSON file
    // For now, return a minimal IDL structure
    try {
      // Try to load from IDL file
      const idl = require('../idl/l2conceptv1.json');
      return idl;
    } catch {
      // Fallback: return minimal IDL
      return {
        version: '1.0.0',
        name: 'l2conceptv1',
        instructions: [],
        accounts: [],
        types: [],
        events: [],
      };
    }
  }

  /**
   * Check if a wallet is connected
   */
  get isConnected(): boolean {
    return !!this.config.wallet?.publicKey;
  }

  /**
   * Get connected wallet public key
   */
  get walletPublicKey(): PublicKey | null {
    return this.config.wallet?.publicKey || null;
  }

  /**
   * Initialize the program
   */
  async initialize(
    configAdmin: PublicKey,
    delegationProgramId?: PublicKey
  ): Promise<TransactionResult> {
    const [config] = this.pda.deriveConfig();
    const [vaultAuthority] = this.pda.deriveVaultAuthority();

    const tx = await this.program.methods
      .initialize(delegationProgramId || null)
      .accounts({
        configAdmin,
        config,
        vaultAuthority,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    return this.sendTransaction(tx);
  }

  /**
   * Join the program (create UserState)
   */
  async join(): Promise<TransactionResult> {
    if (!this.isConnected) throw new Error('Wallet not connected');

    const owner = this.walletPublicKey!;
    const [userState] = this.pda.deriveUserState(owner);

    const tx = await this.program.methods
      .join()
      .accounts({
        owner,
        userState,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    return this.sendTransaction(tx);
  }

  /**
   * Add a mint to track
   */
  async addMint(mint: PublicKey): Promise<TransactionResult> {
    if (!this.isConnected) throw new Error('Wallet not connected');

    const owner = this.walletPublicKey!;
    const [userState] = this.pda.deriveUserState(owner);
    const [userBalance] = this.pda.deriveUserBalance(owner, mint);

    const tx = await this.program.methods
      .addMint()
      .accounts({
        owner,
        mint,
        userState,
        userBalance,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    return this.sendTransaction(tx);
  }

  /**
   * Deposit tokens into the vault
   */
  async deposit(params: DepositParams): Promise<TransactionResult> {
    if (!this.isConnected) throw new Error('Wallet not connected');

    const owner = this.walletPublicKey!;
    const { mint, amount } = params;
    const pdas = this.pda.getAllPdas(owner, mint);

    const userAta = getAssociatedTokenAddressSync(mint, owner);
    const vaultAta = getAssociatedTokenAddressSync(mint, pdas.vaultAuthority, true);

    const tx = new Transaction();

    // Check if vault ATA exists, create if needed
    const vaultAtaInfo = await this.config.connection.getAccountInfo(vaultAta);
    if (!vaultAtaInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          owner,
          vaultAta,
          pdas.vaultAuthority,
          mint
        )
      );
    }

    const depositIx = await this.program.methods
      .deposit(new BN(amount.toString()))
      .accounts({
        owner,
        userState: pdas.userState,
        userBalance: pdas.userBalance,
        mint,
        userAta,
        vaultAuthority: pdas.vaultAuthority,
        vaultAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .instruction();

    tx.add(depositIx);
    return this.sendTransaction(tx);
  }

  /**
   * Transfer tokens internally (batch)
   */
  async transferBatch(params: TransferBatchParams): Promise<TransactionResult> {
    if (!this.isConnected) throw new Error('Wallet not connected');

    const sender = this.walletPublicKey!;
    const { mint, items } = params;

    if (items.length > MAX_BATCH_TRANSFER_RECIPIENTS) {
      throw new Error(`Max ${MAX_BATCH_TRANSFER_RECIPIENTS} recipients per batch`);
    }

    const senderPdas = this.pda.getAllPdas(sender, mint);

    // Build remaining accounts for recipients
    const remainingAccounts: any[] = [];
    for (const item of items) {
      const [recipientUserState] = this.pda.deriveUserState(item.toOwner);
      const [recipientBalance] = this.pda.deriveUserBalance(item.toOwner, mint);
      
      remainingAccounts.push(
        { pubkey: recipientUserState, isWritable: true, isSigner: false },
        { pubkey: recipientBalance, isWritable: true, isSigner: false }
      );
    }

    const tx = await this.program.methods
      .transferBatch(
        items.map((item) => ({
          toOwner: item.toOwner,
          amount: new BN(item.amount.toString()),
        }))
      )
      .accounts({
        sender,
        senderUserState: senderPdas.userState,
        senderBalance: senderPdas.userBalance,
        mint,
        owner: sender,
      })
      .remainingAccounts(remainingAccounts)
      .transaction();

    return this.sendTransaction(tx);
  }

  /**
   * Chunk batch transfers into multiple transactions
   */
  async transferBatchChunked(
    mint: PublicKey,
    items: TransferItem[],
    chunkSize: number = MAX_BATCH_TRANSFER_RECIPIENTS
  ): Promise<TransactionResult[]> {
    const chunks: TransferItem[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
      chunks.push(items.slice(i, i + chunkSize));
    }

    const results: TransactionResult[] = [];
    for (const chunk of chunks) {
      const result = await this.transferBatch({ mint, items: chunk });
      results.push(result);
    }

    return results;
  }

  /**
   * Parse batch transfer input from string format
   * Format: "address1,amount1\naddress2,amount2" or comma-separated addresses
   */
  parseBatchTransferInput(
    input: string,
    defaultAmount?: string
  ): TransferItem[] {
    const lines = input.trim().split('\n');
    const items: TransferItem[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parts = trimmed.split(',').map((p) => p.trim());
      
      if (parts.length === 2) {
        // Format: address,amount
        items.push({
          toOwner: new PublicKey(parts[0]),
          amount: new BN(parts[1]),
        });
      } else if (parts.length === 1 && defaultAmount) {
        // Format: address (use default amount)
        items.push({
          toOwner: new PublicKey(parts[0]),
          amount: new BN(defaultAmount),
        });
      }
    }

    return items;
  }

  /**
   * Withdraw tokens from vault
   */
  async withdraw(params: WithdrawParams): Promise<TransactionResult> {
    if (!this.isConnected) throw new Error('Wallet not connected');

    const owner = this.walletPublicKey!;
    const { mint, amount, destinationAta } = params;
    const pdas = this.pda.getAllPdas(owner, mint);

    const destAta = destinationAta || getAssociatedTokenAddressSync(mint, owner);
    const vaultAta = getAssociatedTokenAddressSync(mint, pdas.vaultAuthority, true);

    const tx = new Transaction();

    // Check if destination ATA exists, create if needed
    const destAtaInfo = await this.config.connection.getAccountInfo(destAta);
    if (!destAtaInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          owner,
          destAta,
          owner,
          mint
        )
      );
    }

    const withdrawIx = await this.program.methods
      .withdraw(new BN(amount.toString()))
      .accounts({
        owner,
        userState: pdas.userState,
        userBalance: pdas.userBalance,
        mint,
        vaultAuthority: pdas.vaultAuthority,
        vaultAta,
        destinationAta: destAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    tx.add(withdrawIx);
    return this.sendTransaction(tx);
  }

  /**
   * Delegate user state and balances to Ephemeral Rollup
   */
  async delegate(params: DelegateParams): Promise<TransactionResult> {
    if (!this.isConnected) throw new Error('Wallet not connected');

    const { mintList } = params;
    if (mintList.length > MAX_MINTS_PER_DELEGATION) {
      throw new Error(`Max ${MAX_MINTS_PER_DELEGATION} mints per delegation`);
    }

    const owner = this.walletPublicKey!;
    const [userState] = this.pda.deriveUserState(owner);

    // Build remaining accounts for balance PDAs
    const remainingAccounts: any[] = [];
    for (const mint of mintList) {
      const [balance] = this.pda.deriveUserBalance(owner, mint);
      remainingAccounts.push({
        pubkey: balance,
        isWritable: true,
        isSigner: false,
      });
    }

    const tx = await this.program.methods
      .delegateUserStateAndBalances(mintList)
      .accounts({
        owner,
        userState,
        magicContext: this.getMagicContext(),
        magicProgram: L2ConceptSdk.DEFAULT_DELEGATION_PROGRAM,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(remainingAccounts)
      .transaction();

    return this.sendTransaction(tx);
  }

  /**
   * Commit and undelegate from ER back to L1
   */
  async commitAndUndelegate(
    params: CommitUndelegateParams
  ): Promise<TransactionResult> {
    if (!this.isConnected) throw new Error('Wallet not connected');

    const { mintList } = params;
    if (mintList.length > MAX_MINTS_PER_DELEGATION) {
      throw new Error(`Max ${MAX_MINTS_PER_DELEGATION} mints per operation`);
    }

    const owner = this.walletPublicKey!;
    const [userState] = this.pda.deriveUserState(owner);

    // Build remaining accounts for balance PDAs
    const remainingAccounts: any[] = [];
    for (const mint of mintList) {
      const [balance] = this.pda.deriveUserBalance(owner, mint);
      remainingAccounts.push({
        pubkey: balance,
        isWritable: true,
        isSigner: false,
      });
    }

    const tx = await this.program.methods
      .commitAndUndelegateUserStateAndBalances(mintList)
      .accounts({
        payer: owner,
        owner,
        userState,
        magicContext: this.getMagicContext(),
        magicProgram: L2ConceptSdk.DEFAULT_DELEGATION_PROGRAM,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(remainingAccounts)
      .transaction();

    return this.sendTransaction(tx);
  }

  /**
   * Get MagicBlock context PDA
   */
  private getMagicContext(): PublicKey {
    // MagicBlock context is a PDA derived from delegation program
    const [context] = PublicKey.findProgramAddressSync(
      [Buffer.from('magic_context')],
      L2ConceptSdk.DEFAULT_DELEGATION_PROGRAM
    );
    return context;
  }

  /**
   * Fetch user state
   */
  async getUserState(owner: PublicKey): Promise<any | null> {
    const [userState] = this.pda.deriveUserState(owner);
    try {
      return await this.program.account.userState.fetch(userState);
    } catch {
      return null;
    }
  }

  /**
   * Fetch user balance for a mint
   */
  async getUserBalance(owner: PublicKey, mint: PublicKey): Promise<any | null> {
    const [userBalance] = this.pda.deriveUserBalance(owner, mint);
    try {
      return await this.program.account.userBalance.fetch(userBalance);
    } catch {
      return null;
    }
  }

  /**
   * Fetch all user balances
   */
  async getAllUserBalances(owner: PublicKey): Promise<any[]> {
    return await this.program.account.userBalance.all([
      {
        memcmp: {
          offset: 8, // Skip discriminator
          bytes: owner.toBase58(),
        },
      },
    ]);
  }

  /**
   * Get vault ATA for a mint
   */
  getVaultAta(mint: PublicKey): PublicKey {
    const [vaultAuthority] = this.pda.deriveVaultAuthority();
    return getAssociatedTokenAddressSync(mint, vaultAuthority, true);
  }

  /**
   * Send a transaction
   */
  private async sendTransaction(tx: Transaction): Promise<TransactionResult> {
    if (!this.config.wallet) {
      throw new Error('Wallet not connected');
    }

    const { blockhash, lastValidBlockHeight } = await this.config.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = this.config.wallet.publicKey;

    const signed = await this.config.wallet.signTransaction(tx);
    const signature = await this.config.connection.sendRawTransaction(signed.serialize());

    const confirmation = await this.config.connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    });

    return { signature, confirmation };
  }
}
