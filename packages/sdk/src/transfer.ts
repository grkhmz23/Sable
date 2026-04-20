import { PublicKey, Transaction } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from '@solana/spl-token';
import type { SableClient } from './client';
import type {
  TransferBatchParams,
  TransferItem,
  TransactionResult,
  BatchTransferInput,
  SendTransactionOpts,
} from './types';
import { MAX_BATCH_TRANSFER_RECIPIENTS } from './types';

export class TransferModule {
  constructor(private client: SableClient) {}

  /**
   * Transfer tokens internally (batch)
   */
  async transferBatch(
    params: TransferBatchParams,
    opts?: SendTransactionOpts
  ): Promise<TransactionResult> {
    if (!this.client.isConnected) throw new Error('Wallet not connected');

    const sender = this.client.walletPublicKey!;
    const { mint, items } = params;

    if (items.length > MAX_BATCH_TRANSFER_RECIPIENTS) {
      throw new Error(`Max ${MAX_BATCH_TRANSFER_RECIPIENTS} recipients per batch`);
    }

    const senderPdas = this.client.pda.getAllPdas(sender, mint);

    // Build remaining accounts for recipients
    const remainingAccounts: any[] = [];
    for (const item of items) {
      const [recipientUserState] = this.client.pda.deriveUserState(item.toOwner);
      const [recipientBalance] = this.client.pda.deriveUserBalance(item.toOwner, mint);

      remainingAccounts.push(
        { pubkey: recipientUserState, isWritable: true, isSigner: false },
        { pubkey: recipientBalance, isWritable: true, isSigner: false }
      );
    }

    const tx = await this.client.program.methods
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

    return this.client.sendTransaction(tx, opts);
  }

  /**
   * Chunk batch transfers into multiple transactions
   */
  async transferBatchChunked(
    mint: PublicKey,
    items: TransferItem[],
    chunkSize: number = MAX_BATCH_TRANSFER_RECIPIENTS,
    opts?: SendTransactionOpts
  ): Promise<TransactionResult[]> {
    const chunks: TransferItem[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
      chunks.push(items.slice(i, i + chunkSize));
    }

    const results: TransactionResult[] = [];
    for (const chunk of chunks) {
      const result = await this.transferBatch({ mint, items: chunk }, opts);
      results.push(result);
    }

    return results;
  }

  /**
   * Send tokens externally from the program vault to recipient ATAs.
   * Requires sender accounts to be committed/undelegated on L1.
   */
  async externalSendBatch(
    params: TransferBatchParams,
    opts?: SendTransactionOpts
  ): Promise<TransactionResult> {
    if (!this.client.isConnected) throw new Error('Wallet not connected');

    const owner = this.client.walletPublicKey!;
    const { mint, items } = params;

    if (items.length > MAX_BATCH_TRANSFER_RECIPIENTS) {
      throw new Error(`Max ${MAX_BATCH_TRANSFER_RECIPIENTS} recipients per batch`);
    }
    if (items.length === 0) {
      throw new Error('No recipients provided');
    }

    const pdas = this.client.pda.getAllPdas(owner, mint);
    const vaultAta = getAssociatedTokenAddressSync(mint, pdas.vaultAuthority, true);
    const tx = new Transaction();

    // Prepare recipient ATAs (create if missing)
    const recipientAtaByOwner = new Map<string, PublicKey>();
    for (const item of items) {
      const ownerKey = item.toOwner.toBase58();
      if (!recipientAtaByOwner.has(ownerKey)) {
        recipientAtaByOwner.set(ownerKey, getAssociatedTokenAddressSync(mint, item.toOwner));
      }
    }

    const uniqueRecipientOwners = Array.from(recipientAtaByOwner.keys());
    const uniqueRecipientAtas = uniqueRecipientOwners.map((ownerKey) => {
      const ata = recipientAtaByOwner.get(ownerKey);
      if (!ata) throw new Error('Internal error deriving recipient ATA');
      return ata;
    });

    const ataInfos = await this.client.config.connection.getMultipleAccountsInfo(uniqueRecipientAtas);
    uniqueRecipientOwners.forEach((ownerKey, idx) => {
      const ataExists = !!ataInfos[idx];
      if (ataExists) return;

      const recipientOwner = new PublicKey(ownerKey);
      const recipientAta = recipientAtaByOwner.get(ownerKey);
      if (!recipientAta) throw new Error('Internal error resolving recipient ATA');

      tx.add(
        createAssociatedTokenAccountInstruction(
          owner,
          recipientAta,
          recipientOwner,
          mint
        )
      );
    });

    const remainingAccounts = items.map((item) => {
      const recipientAta = recipientAtaByOwner.get(item.toOwner.toBase58());
      if (!recipientAta) throw new Error('Internal error resolving recipient ATA');
      return {
        pubkey: recipientAta,
        isWritable: true,
        isSigner: false,
      };
    });

    const externalSendIx = await this.client.program.methods
      .externalSendBatch(
        items.map((item) => ({
          toOwner: item.toOwner,
          amount: new BN(item.amount.toString()),
        }))
      )
      .accounts({
        owner,
        senderUserState: pdas.userState,
        senderBalance: pdas.userBalance,
        mint,
        vaultAuthority: pdas.vaultAuthority,
        vaultAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(remainingAccounts)
      .instruction();

    tx.add(externalSendIx);
    return this.client.sendTransaction(tx, opts);
  }

  /**
   * Chunked external sends from the program vault.
   */
  async externalSendBatchChunked(
    mint: PublicKey,
    items: TransferItem[],
    chunkSize: number = MAX_BATCH_TRANSFER_RECIPIENTS,
    opts?: SendTransactionOpts
  ): Promise<TransactionResult[]> {
    if (chunkSize <= 0) {
      throw new Error('chunkSize must be > 0');
    }

    const results: TransactionResult[] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const result = await this.externalSendBatch({ mint, items: chunk });
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
   * Send standard SPL transfers from the connected wallet ATA to recipient ATAs (L1 fallback path).
   * Creates recipient ATAs if needed.
   */
  async sendExternalTransfers(
    mint: PublicKey,
    items: TransferItem[]
  ): Promise<TransactionResult> {
    if (!this.client.isConnected) throw new Error('Wallet not connected');
    if (items.length === 0) throw new Error('No recipients provided');

    const owner = this.client.walletPublicKey!;
    const sourceAta = getAssociatedTokenAddressSync(mint, owner);
    const tx = new Transaction();

    // Deduplicate recipient ATA creation checks within the transaction.
    const recipientAtaByOwner = new Map<string, PublicKey>();
    for (const item of items) {
      const key = item.toOwner.toBase58();
      if (!recipientAtaByOwner.has(key)) {
        recipientAtaByOwner.set(key, getAssociatedTokenAddressSync(mint, item.toOwner));
      }
    }

    const uniqueRecipientOwners = Array.from(recipientAtaByOwner.keys());
    const uniqueRecipientAtas = uniqueRecipientOwners.map((ownerKey) => {
      const ata = recipientAtaByOwner.get(ownerKey);
      if (!ata) throw new Error('Internal error deriving recipient ATA');
      return ata;
    });

    const ataInfos = await this.client.config.connection.getMultipleAccountsInfo(uniqueRecipientAtas);
    const ataExists = new Map<string, boolean>();
    uniqueRecipientOwners.forEach((ownerKey, idx) => {
      ataExists.set(ownerKey, !!ataInfos[idx]);
    });

    for (const ownerKey of uniqueRecipientOwners) {
      if (!ataExists.get(ownerKey)) {
        const recipientOwner = new PublicKey(ownerKey);
        const recipientAta = recipientAtaByOwner.get(ownerKey);
        if (!recipientAta) throw new Error('Internal error resolving recipient ATA');

        tx.add(
          createAssociatedTokenAccountInstruction(
            owner,
            recipientAta,
            recipientOwner,
            mint
          )
        );
      }
    }

    for (const item of items) {
      const recipientAta = recipientAtaByOwner.get(item.toOwner.toBase58());
      if (!recipientAta) throw new Error('Internal error resolving recipient ATA');

      tx.add(
        createTransferInstruction(
          sourceAta,
          recipientAta,
          owner,
          BigInt(item.amount.toString())
        )
      );
    }

    return this.client.sendTransaction(tx);
  }

  /**
   * Chunked external SPL transfers for mixed/non-delegated recipient fallback.
   */
  async sendExternalTransfersChunked(
    mint: PublicKey,
    items: TransferItem[],
    chunkSize: number = 8
  ): Promise<TransactionResult[]> {
    if (chunkSize <= 0) {
      throw new Error('chunkSize must be > 0');
    }

    const results: TransactionResult[] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const result = await this.sendExternalTransfers(mint, chunk);
      results.push(result);
    }

    return results;
  }
}
