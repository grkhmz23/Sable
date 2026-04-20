import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { PdaHelper, PERMISSION_PROGRAM_ID } from './pda';
import { TreasuryModule } from './treasury';
import { TransferModule } from './transfer';
import { DelegationModule } from './delegation';
import { AgentsModule } from './agents';
import { PROGRAM_ID_DEVNET } from '@sable/common';
import type { SdkConfig, TransactionResult } from './types';

// Load the generated IDL
import idlJson from '../idl/sable.json';

// Anchor 0.32 IDL format has metadata.name/version; Program constructor expects top-level fields
const idl = {
  ...idlJson,
  name: (idlJson as any).metadata?.name || (idlJson as any).name,
  version: (idlJson as any).metadata?.version || (idlJson as any).version,
};

export class SableClient {
  program: Program;
  provider: AnchorProvider;
  pda: PdaHelper;
  config: SdkConfig;
  wsolMint: PublicKey = new PublicKey('So11111111111111111111111111111111111111112');

  // Module accessors for structured API
  treasury: import('./treasury').TreasuryModule;
  transfer: import('./transfer').TransferModule;
  delegation: import('./delegation').DelegationModule;
  agents: import('./agents').AgentsModule;

  constructor(config: SdkConfig) {
    this.config = config;
    const programId = config.programId || PROGRAM_ID_DEVNET;
    this.pda = new PdaHelper(programId);

    const wallet = config.wallet || ({} as any);
    this.provider = new AnchorProvider(
      config.connection,
      wallet,
      AnchorProvider.defaultOptions()
    );

    this.program = new Program(idl as any, programId, this.provider);

    // Initialize modules
    this.treasury = new TreasuryModule(this);
    this.transfer = new TransferModule(this);
    this.delegation = new DelegationModule(this);
    this.agents = new AgentsModule(this);
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

  // --- Backward-compatible delegating methods ---
  // These delegate to the focused modules so existing code keeps working.

  async initialize(
    configAdmin: PublicKey,
    delegationProgramId?: PublicKey
  ): Promise<TransactionResult> {
    return this.treasury.initialize(configAdmin, delegationProgramId);
  }

  async join(): Promise<TransactionResult> {
    return this.treasury.join();
  }

  async completeSetup(additionalMints: PublicKey[] = []): Promise<TransactionResult> {
    return this.treasury.completeSetup(additionalMints);
  }

  async completeSetupWithMints(mintStrings: string[]): Promise<TransactionResult> {
    return this.treasury.completeSetupWithMints(mintStrings);
  }

  async addMint(mint: PublicKey): Promise<TransactionResult> {
    return this.treasury.addMint(mint);
  }

  async deposit(params: import('./types').DepositParams): Promise<TransactionResult> {
    return this.treasury.deposit(params);
  }

  async withdraw(params: import('./types').WithdrawParams): Promise<TransactionResult> {
    return this.treasury.withdraw(params);
  }

  async getUserState(owner: PublicKey): Promise<any | null> {
    return this.treasury.getUserState(owner);
  }

  async getUserBalance(owner: PublicKey, mint: PublicKey): Promise<any | null> {
    return this.treasury.getUserBalance(owner, mint);
  }

  async getAllUserBalances(owner: PublicKey): Promise<any[]> {
    return this.treasury.getAllUserBalances(owner);
  }

  getVaultAta(mint: PublicKey): PublicKey {
    return this.treasury.getVaultAta(mint);
  }

  async transferBatch(params: import('./types').TransferBatchParams): Promise<TransactionResult> {
    return this.transfer.transferBatch(params);
  }

  async transferBatchChunked(
    mint: PublicKey,
    items: import('./types').TransferItem[],
    chunkSize?: number
  ): Promise<TransactionResult[]> {
    return this.transfer.transferBatchChunked(mint, items, chunkSize);
  }

  async externalSendBatch(params: import('./types').TransferBatchParams): Promise<TransactionResult> {
    return this.transfer.externalSendBatch(params);
  }

  async externalSendBatchChunked(
    mint: PublicKey,
    items: import('./types').TransferItem[],
    chunkSize?: number
  ): Promise<TransactionResult[]> {
    return this.transfer.externalSendBatchChunked(mint, items, chunkSize);
  }

  parseBatchTransferInput(
    input: string,
    defaultAmount?: string
  ): import('./types').TransferItem[] {
    return this.transfer.parseBatchTransferInput(input, defaultAmount);
  }

  async sendExternalTransfers(
    mint: PublicKey,
    items: import('./types').TransferItem[]
  ): Promise<TransactionResult> {
    return this.transfer.sendExternalTransfers(mint, items);
  }

  async sendExternalTransfersChunked(
    mint: PublicKey,
    items: import('./types').TransferItem[],
    chunkSize?: number
  ): Promise<TransactionResult[]> {
    return this.transfer.sendExternalTransfersChunked(mint, items, chunkSize);
  }

  async delegate(params: import('./types').DelegateParams): Promise<TransactionResult> {
    return this.delegation.delegate(params);
  }

  async commitAndUndelegate(
    params: import('./types').CommitUndelegateParams
  ): Promise<TransactionResult> {
    return this.delegation.commitAndUndelegate(params);
  }

  async isDelegated(accountPubkey: PublicKey): Promise<boolean> {
    return this.delegation.isDelegated(accountPubkey);
  }

  async getDelegationStatus(
    owner: PublicKey,
    mintList: PublicKey[]
  ): Promise<import('./types').DelegationStatus[]> {
    return this.delegation.getDelegationStatus(owner, mintList);
  }

  async hasDelegatedAccounts(owner: PublicKey, mintList: PublicKey[]): Promise<boolean> {
    return this.delegation.hasDelegatedAccounts(owner, mintList);
  }

  async waitForDelegationStatus(
    owner: PublicKey,
    mintList: PublicKey[],
    targetDelegated: boolean,
    opts?: { timeoutMs?: number; pollIntervalMs?: number }
  ): Promise<boolean> {
    return this.delegation.waitForDelegationStatus(owner, mintList, targetDelegated, opts);
  }

  /**
   * Send a transaction
   */
  async sendTransaction(tx: Transaction): Promise<TransactionResult> {
    if (!this.config.wallet) {
      throw new Error('Wallet not connected');
    }

    const { blockhash, lastValidBlockHeight } = await this.config.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = this.config.wallet.publicKey;

    const signed = await this.config.wallet.signTransaction(tx);
    const signature = await this.config.connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    const confirmation = await this.config.connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed'
    );

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    return { signature, confirmation };
  }
}
