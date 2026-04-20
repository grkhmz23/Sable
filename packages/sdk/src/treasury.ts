import * as anchor from '@coral-xyz/anchor';
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { PERMISSION_PROGRAM_ID } from './pda';
import type { SableClient } from './client';
import type {
  DepositParams,
  WithdrawParams,
  TransactionResult,
  SendTransactionOpts,
} from './types';

export class TreasuryModule {
  constructor(private client: SableClient) {}

  /**
   * Initialize the program
   */
  async initialize(
    configAdmin: PublicKey,
    delegationProgramId?: PublicKey
  ): Promise<TransactionResult> {
    const [config] = this.client.pda.deriveConfig();
    const [vaultAuthority] = this.client.pda.deriveVaultAuthority();

    const tx = await this.client.program.methods
      .initialize(delegationProgramId || null)
      .accounts({
        configAdmin,
        config,
        vaultAuthority,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    return this.client.sendTransaction(tx);
  }

  /**
   * Join the program (create UserState)
   */
  async join(): Promise<TransactionResult> {
    if (!this.client.isConnected) throw new Error('Wallet not connected');

    const owner = this.client.walletPublicKey!;
    const [userState] = this.client.pda.deriveUserState(owner);

    const tx = await this.client.program.methods
      .join()
      .accounts({
        owner,
        userState,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    return this.client.sendTransaction(tx);
  }

  /**
   * Complete setup - creates UserState and wSOL UserBalance (wSOL always included by default)
   * Additional mints can be included in the same transaction
   */
  async completeSetup(additionalMints: PublicKey[] = []): Promise<TransactionResult> {
    if (!this.client.isConnected) throw new Error('Wallet not connected');

    const owner = this.client.walletPublicKey!;
    const [userState] = this.client.pda.deriveUserState(owner);
    const [wsolBalance] = this.client.pda.deriveUserBalance(owner, this.client.wsolMint);
    const [wsolPermission] = this.client.pda.derivePermission(wsolBalance);

    // Build remaining accounts for additional mints
    // Format: [mint1, mint2, ..., balance1, balance2, ..., permission1, permission2, ...]
    const remainingAccounts: any[] = [];

    for (const mint of additionalMints) {
      remainingAccounts.push({
        pubkey: mint,
        isWritable: false,
        isSigner: false,
      });
    }

    for (const mint of additionalMints) {
      const [balancePda] = this.client.pda.deriveUserBalance(owner, mint);
      remainingAccounts.push({
        pubkey: balancePda,
        isWritable: true,
        isSigner: false,
      });
    }

    for (const mint of additionalMints) {
      const [balancePda] = this.client.pda.deriveUserBalance(owner, mint);
      const [permissionPda] = this.client.pda.derivePermission(balancePda);
      remainingAccounts.push({
        pubkey: permissionPda,
        isWritable: true,
        isSigner: false,
      });
    }

    const tx = await this.client.program.methods
      .completeSetup(additionalMints)
      .accounts({
        owner,
        userState,
        wsolBalance,
        systemProgram: SystemProgram.programId,
        permissionProgram: PERMISSION_PROGRAM_ID,
        wsolPermission,
      })
      .remainingAccounts(remainingAccounts)
      .transaction();

    return this.client.sendTransaction(tx);
  }

  /**
   * Complete setup with multiple mints (convenience method)
   */
  async completeSetupWithMints(mintStrings: string[]): Promise<TransactionResult> {
    const mints = mintStrings
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => new PublicKey(s));

    const uniqueMints = [...new Set(mints.map((m) => m.toBase58()))].map(
      (s) => new PublicKey(s)
    );
    if (uniqueMints.length !== mints.length) {
      throw new Error('Duplicate mint addresses found');
    }

    const nonWsolMints = uniqueMints.filter((m) => !m.equals(this.client.wsolMint));

    if (nonWsolMints.length > 9) {
      throw new Error('Maximum 9 additional mints allowed (wSOL is always included)');
    }

    return this.completeSetup(nonWsolMints);
  }

  /**
   * Add a mint to track
   */
  async addMint(mint: PublicKey): Promise<TransactionResult> {
    if (!this.client.isConnected) throw new Error('Wallet not connected');

    const owner = this.client.walletPublicKey!;
    const [userState] = this.client.pda.deriveUserState(owner);
    const [userBalance] = this.client.pda.deriveUserBalance(owner, mint);
    const [permission] = this.client.pda.derivePermission(userBalance);

    const tx = await this.client.program.methods
      .addMint()
      .accounts({
        owner,
        mint,
        userState,
        userBalance,
        systemProgram: SystemProgram.programId,
        permissionProgram: PERMISSION_PROGRAM_ID,
        permission,
      })
      .transaction();

    return this.client.sendTransaction(tx);
  }

  /**
   * Deposit tokens into the vault
   */
  async deposit(
    params: DepositParams,
    opts?: SendTransactionOpts
  ): Promise<TransactionResult> {
    if (!this.client.isConnected) throw new Error('Wallet not connected');

    const owner = this.client.walletPublicKey!;
    const { mint, amount } = params;
    const pdas = this.client.pda.getAllPdas(owner, mint);

    const userAta = getAssociatedTokenAddressSync(mint, owner);
    const vaultAta = getAssociatedTokenAddressSync(mint, pdas.vaultAuthority, true);

    const tx = new Transaction();

    // Check if vault ATA exists, create if needed
    const vaultAtaInfo = await this.client.config.connection.getAccountInfo(vaultAta);
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

    const depositIx = await this.client.program.methods
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
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .instruction();

    tx.add(depositIx);
    return this.client.sendTransaction(tx, opts);
  }

  /**
   * Withdraw tokens from vault
   */
  async withdraw(
    params: WithdrawParams,
    opts?: SendTransactionOpts
  ): Promise<TransactionResult> {
    if (!this.client.isConnected) throw new Error('Wallet not connected');

    const owner = this.client.walletPublicKey!;
    const { mint, amount, destinationAta } = params;
    const pdas = this.client.pda.getAllPdas(owner, mint);

    const destAta = destinationAta || getAssociatedTokenAddressSync(mint, owner);
    const vaultAta = getAssociatedTokenAddressSync(mint, pdas.vaultAuthority, true);

    const tx = new Transaction();

    // Check if destination ATA exists, create if needed
    const destAtaInfo = await this.client.config.connection.getAccountInfo(destAta);
    if (!destAtaInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(owner, destAta, owner, mint)
      );
    }

    const withdrawIx = await this.client.program.methods
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
    return this.client.sendTransaction(tx, opts);
  }

  /**
   * Fetch user state
   */
  async getUserState(owner: PublicKey): Promise<any | null> {
    const [userState] = this.client.pda.deriveUserState(owner);
    try {
      return await this.client.program.account.userState.fetch(userState);
    } catch {
      return null;
    }
  }

  /**
   * Fetch user balance for a mint
   */
  async getUserBalance(owner: PublicKey, mint: PublicKey): Promise<any | null> {
    const [userBalance] = this.client.pda.deriveUserBalance(owner, mint);
    try {
      return await this.client.program.account.userBalance.fetch(userBalance);
    } catch {
      return null;
    }
  }

  /**
   * Fetch all user balances
   */
  async getAllUserBalances(owner: PublicKey): Promise<any[]> {
    return await this.client.program.account.userBalance.all([
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
    const [vaultAuthority] = this.client.pda.deriveVaultAuthority();
    return getAssociatedTokenAddressSync(mint, vaultAuthority, true);
  }
}
