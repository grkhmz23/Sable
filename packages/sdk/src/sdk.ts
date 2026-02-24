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

// IDL type (minimal structure for SDK)
export type L2conceptv1 = any;

// Default MagicBlock delegation program
const DEFAULT_DELEGATION_PROGRAM = new PublicKey(
  'DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh'
);

// wSOL mint address - always included by default
export const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

export class L2ConceptSdk {
  program: Program<L2conceptv1>;
  provider: AnchorProvider;
  pda: PdaHelper;
  config: SdkConfig;
  wsolMint: PublicKey = WSOL_MINT;

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

    // Create a minimal IDL for the program
    const idl = this.createMinimalIdl();
    this.program = new Program(idl, config.programId, this.provider);
  }

  private createMinimalIdl(): any {
    return {
      version: '1.0.0',
      name: 'l2conceptv1',
      instructions: [
        { name: 'initialize', accounts: [], args: [] },
        { name: 'join', accounts: [], args: [] },
        { name: 'completeSetup', accounts: [], args: [] },
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
        { code: 6000, name: 'NotInitialized' },
        { code: 6003, name: 'InsufficientBalance' },
        { code: 6007, name: 'WithdrawWhileDelegated' },
      ],
    };
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
   * Complete setup - creates UserState and wSOL UserBalance (wSOL always included by default)
   * Additional mints can be included in the same transaction
   * @param additionalMints - Optional array of mint addresses to also create balances for
   */
  async completeSetup(additionalMints: PublicKey[] = []): Promise<TransactionResult> {
    if (!this.isConnected) throw new Error('Wallet not connected');

    const owner = this.walletPublicKey!;
    const [userState] = this.pda.deriveUserState(owner);
    const [wsolBalance] = this.pda.deriveUserBalance(owner, this.wsolMint);

    // Build remaining accounts for additional mints
    // Format: [mint1, mint2, ..., balance1, balance2, ...]
    const remainingAccounts: any[] = [];
    
    for (const mint of additionalMints) {
      remainingAccounts.push({
        pubkey: mint,
        isWritable: false,
        isSigner: false,
      });
    }

    for (const mint of additionalMints) {
      const [balancePda] = this.pda.deriveUserBalance(owner, mint);
      remainingAccounts.push({
        pubkey: balancePda,
        isWritable: true,
        isSigner: false,
      });
    }

    const tx = await this.program.methods
      .completeSetup(additionalMints)
      .accounts({
        owner,
        userState,
        wsolBalance,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(remainingAccounts)
      .transaction();

    return this.sendTransaction(tx);
  }

  /**
   * Complete setup with multiple mints (convenience method)
   * Validates all mints are valid public keys before sending
   */
  async completeSetupWithMints(mintStrings: string[]): Promise<TransactionResult> {
    const mints = mintStrings
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(s => new PublicKey(s));
    
    // Check for duplicates
    const uniqueMints = [...new Set(mints.map(m => m.toBase58()))].map(s => new PublicKey(s));
    if (uniqueMints.length !== mints.length) {
      throw new Error('Duplicate mint addresses found');
    }

    // Check for wSOL (it's always included, shouldn't be in the list)
    const nonWsolMints = uniqueMints.filter(m => !m.equals(this.wsolMint));
    if (nonWsolMints.length !== uniqueMints.length) {
      console.log('wSOL removed from list (always included by default)');
    }

    // Check limit
    if (nonWsolMints.length > 9) {
      throw new Error('Maximum 9 additional mints allowed (wSOL is always included)');
    }

    return this.completeSetup(nonWsolMints);
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

    const tx = await this.program.methods
      .delegateUserStateAndBalances(mintList)
      .accounts({
        owner,
        userState,
        systemProgram: SystemProgram.programId,
      })
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

    const tx = await this.program.methods
      .commitAndUndelegateUserStateAndBalances(mintList)
      .accounts({
        payer: owner,
        owner,
        userState,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    return this.sendTransaction(tx);
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
