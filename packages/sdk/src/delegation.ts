import { PublicKey, SystemProgram } from '@solana/web3.js';
import type { SableClient } from './client';
import type {
  DelegateParams,
  CommitUndelegateParams,
  DelegationStatus,
  TransactionResult,
} from './types';
import { DEFAULT_UPDATE_FREQUENCY_MS, DEFAULT_TTL_SECONDS, MAX_MINTS_PER_DELEGATION } from './types';

// Default MagicBlock delegation program
const DEFAULT_DELEGATION_PROGRAM = new PublicKey(
  'DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh'
);

export class DelegationModule {
  constructor(private client: SableClient) {}

  /**
   * Delegate user state and balances to Ephemeral Rollup
   */
  async delegate(params: DelegateParams): Promise<TransactionResult> {
    if (!this.client.isConnected) throw new Error('Wallet not connected');

    const { mintList } = params;
    if (mintList.length > MAX_MINTS_PER_DELEGATION) {
      throw new Error(`Max ${MAX_MINTS_PER_DELEGATION} mints per delegation`);
    }

    const owner = this.client.walletPublicKey!;
    const [userState] = this.client.pda.deriveUserState(owner);

    // Build remaining accounts for delegation (4 per mint: balance, buffer, record, metadata)
    const remainingAccounts: any[] = [];
    for (const mint of mintList) {
      const [balancePda] = this.client.pda.deriveUserBalance(owner, mint);
      const [bufferPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('delegate_buffer'), balancePda.toBuffer()],
        this.client.program.programId
      );
      const [recordPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('delegation_record'), balancePda.toBuffer()],
        new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh')
      );
      const [metadataPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('delegation_metadata'), balancePda.toBuffer()],
        new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh')
      );

      remainingAccounts.push(
        { pubkey: balancePda, isWritable: true, isSigner: false },
        { pubkey: bufferPda, isWritable: true, isSigner: false },
        { pubkey: recordPda, isWritable: true, isSigner: false },
        { pubkey: metadataPda, isWritable: true, isSigner: false }
      );
    }

    const tx = await this.client.program.methods
      .delegateUserStateAndBalances(mintList)
      .accounts({
        owner,
        userState,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(remainingAccounts)
      .transaction();

    return this.client.sendTransaction(tx);
  }

  /**
   * Commit and undelegate from ER back to L1
   */
  async commitAndUndelegate(
    params: CommitUndelegateParams
  ): Promise<TransactionResult> {
    if (!this.client.isConnected) throw new Error('Wallet not connected');

    const { mintList } = params;
    if (mintList.length > MAX_MINTS_PER_DELEGATION) {
      throw new Error(`Max ${MAX_MINTS_PER_DELEGATION} mints per operation`);
    }

    const owner = this.client.walletPublicKey!;
    const [userState] = this.client.pda.deriveUserState(owner);

    // Build remaining accounts (1 per mint: balance PDA)
    const remainingAccounts: any[] = [];
    for (const mint of mintList) {
      const [balancePda] = this.client.pda.deriveUserBalance(owner, mint);
      remainingAccounts.push({
        pubkey: balancePda,
        isWritable: true,
        isSigner: false,
      });
    }

    const tx = await this.client.program.methods
      .commitAndUndelegateUserStateAndBalances(mintList)
      .accounts({
        payer: owner,
        owner,
        userState,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(remainingAccounts)
      .transaction();

    return this.client.sendTransaction(tx);
  }

  /**
   * Check if an account is delegated to MagicBlock
   * Delegated accounts have their owner changed to the MagicBlock delegation program
   */
  async isDelegated(accountPubkey: PublicKey): Promise<boolean> {
    const accountInfo = await this.client.config.connection.getAccountInfo(accountPubkey);
    if (!accountInfo) return false;
    return accountInfo.owner.equals(DEFAULT_DELEGATION_PROGRAM);
  }

  /**
   * Get delegation status for user state and balances
   * Returns a map of account addresses to their delegation status
   */
  async getDelegationStatus(
    owner: PublicKey,
    mintList: PublicKey[]
  ): Promise<DelegationStatus[]> {
    const [userState] = this.client.pda.deriveUserState(owner);
    const accounts = [userState];

    for (const mint of mintList) {
      const [userBalance] = this.client.pda.deriveUserBalance(owner, mint);
      accounts.push(userBalance);
    }

    const results = await Promise.all(
      accounts.map(async (account) => ({
        account,
        isDelegated: await this.isDelegated(account),
      }))
    );

    return results;
  }

  /**
   * Check if any of the user's accounts are delegated
   */
  async hasDelegatedAccounts(owner: PublicKey, mintList: PublicKey[]): Promise<boolean> {
    const status = await this.getDelegationStatus(owner, mintList);
    return status.some((s) => s.isDelegated);
  }

  /**
   * Wait until all user state + mint balance accounts reach the desired delegation state.
   * Returns false on timeout.
   */
  async waitForDelegationStatus(
    owner: PublicKey,
    mintList: PublicKey[],
    targetDelegated: boolean,
    opts: { timeoutMs?: number; pollIntervalMs?: number } = {}
  ): Promise<boolean> {
    const timeoutMs = opts.timeoutMs ?? 60_000;
    const pollIntervalMs = opts.pollIntervalMs ?? 2_000;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const status = await this.getDelegationStatus(owner, mintList);
      if (status.length > 0 && status.every((s) => s.isDelegated === targetDelegated)) {
        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    return false;
  }
}
