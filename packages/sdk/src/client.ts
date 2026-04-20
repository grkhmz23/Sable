import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { PdaHelper, PERMISSION_PROGRAM_ID } from './pda';
import { TreasuryModule } from './treasury';
import { TransferModule } from './transfer';
import { DelegationModule } from './delegation';
import { AgentsModule } from './agents';
import { AuctionsModule } from './auctions';
import { SableSession, SessionExpiredError } from './session';
import { SablePayments } from './payments';
import { PROGRAM_ID_DEVNET } from '@sable/common';
import type { SdkConfig, TransactionResult, SendTransactionOpts } from './types';

// Load the generated IDL
import idlJson from '../idl/sable.json';

// Anchor 0.32 IDL format has metadata.name/version; Program constructor expects top-level fields.
// Also strip Rust module path prefixes (e.g. "sable::state::UserState" -> "UserState") so
// runtime account namespace keys match the camelCase names SDK code expects (userState, etc.).
// Anchor 0.32 preserves Rust module paths in IDL account names (e.g. sable::state::userState).
// Runtime namespace access expects bare names. This preprocessor strips the module prefix.
// Remove if Anchor's TS client handles this automatically in a future version.
function stripModulePrefix(obj: any): any {
  if (Array.isArray(obj)) return obj.map(stripModulePrefix);
  if (typeof obj === 'object' && obj !== null) {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'name' && typeof value === 'string') {
        result[key] = value.replace(/^sable::state::/, '');
      } else {
        result[key] = stripModulePrefix(value);
      }
    }
    return result;
  }
  return obj;
}

const idl = stripModulePrefix({
  ...idlJson,
  name: (idlJson as any).metadata?.name || (idlJson as any).name,
  version: (idlJson as any).metadata?.version || (idlJson as any).version,
});

export class SableClient {
  program: any;
  provider: AnchorProvider;
  pda: PdaHelper;
  config: SdkConfig;
  wsolMint: PublicKey = new PublicKey('So11111111111111111111111111111111111111112');

  // Module accessors for structured API
  treasury: import('./treasury').TreasuryModule;
  transfer: import('./transfer').TransferModule;
  delegation: import('./delegation').DelegationModule;
  agents: import('./agents').AgentsModule;
  auctions: import('./auctions').AuctionsModule;

  // PER session
  session: SableSession | null = null;

  // Private Payments API
  payments: SablePayments;

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

    this.program = new Program(idl as any, this.provider) as any;

    // Initialize modules
    this.treasury = new TreasuryModule(this);
    this.transfer = new TransferModule(this);
    this.delegation = new DelegationModule(this);
    this.agents = new AgentsModule(this);
    this.auctions = new AuctionsModule(this);

    // Initialize payments adapter from env if available
    const paymentsApiUrl =
      typeof process !== 'undefined'
        ? (process.env.SABLE_PRIVATE_PAYMENTS_API_URL || process.env.NEXT_PUBLIC_SABLE_PRIVATE_PAYMENTS_API_URL || '')
        : '';
    const paymentsApiKey =
      typeof process !== 'undefined'
        ? (process.env.SABLE_PRIVATE_PAYMENTS_API_KEY || process.env.NEXT_PUBLIC_SABLE_PRIVATE_PAYMENTS_API_KEY || undefined)
        : undefined;

    if (paymentsApiUrl) {
      this.payments = new SablePayments({
        apiUrl: paymentsApiUrl,
        apiKey: paymentsApiKey,
        routerConnection: config.routerConnection,
      });
    } else {
      // Create a no-op instance that throws on first use so callers get a clear error
      this.payments = new Proxy({} as SablePayments, {
        get(_target, prop) {
          if (prop === 'aml') {
            return new Proxy({} as any, {
              get() {
                throw new Error(
                  'SablePayments is not configured. Set SABLE_PRIVATE_PAYMENTS_API_URL environment variable.'
                );
              },
            });
          }
          throw new Error(
            'SablePayments is not configured. Set SABLE_PRIVATE_PAYMENTS_API_URL environment variable.'
          );
        },
      });
    }
  }

  /**
   * Open a PER session for private balance reads.
   * Auto-refreshes an expired session once per call.
   */
  async openSession(perRpcUrl: string, ttlSeconds?: number): Promise<SableSession> {
    if (!this.isConnected) throw new Error('Wallet not connected');
    if (!this.config.wallet?.signMessage) {
      throw new Error('Wallet does not support message signing');
    }

    const signer = {
      publicKey: this.config.wallet.publicKey,
      signMessage: this.config.wallet.signMessage.bind(this.config.wallet),
    };

    this.session = await SableSession.openSession({ signer, perRpcUrl, ttlSeconds });
    return this.session;
  }

  /**
   * Close the current PER session (server-side + client-side).
   */
  async closeSession(): Promise<void> {
    if (this.session) {
      await this.session.close();
      this.session = null;
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
    const [userBalance] = this.pda.deriveUserBalance(owner, mint);

    // If we have an active PER session and the account is delegated,
    // read the private balance through PER.
    if (this.session && !this.session.isExpired) {
      try {
        const isDel = await this.delegation.isDelegated(userBalance);
        if (isDel) {
          const amount = await this.session.getBalance(userBalance);
          return { owner, mint, amount, version: new BN(0) };
        }
      } catch (err: any) {
        if (err instanceof SessionExpiredError) {
          // Attempt one refresh using the same perEndpoint, then retry
          if (this.config.wallet?.signMessage) {
            try {
              await this.session.refresh({
                publicKey: this.config.wallet.publicKey,
                signMessage: this.config.wallet.signMessage.bind(this.config.wallet),
              });
              const amount = await this.session.getBalance(userBalance);
              return { owner, mint, amount, version: new BN(0) };
            } catch {
              // Refresh failed — fall through to on-chain read
            }
          }
        }
        // Other PER errors fall through to on-chain read
      }
    }

    // Fallback to on-chain read
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
  /**
   * Get an ER-valid blockhash for delegated accounts via Magic Router.
   */
  async getBlockhashForAccounts(accounts: PublicKey[]): Promise<string> {
    const router = this.config.routerConnection;
    if (!router) {
      throw new Error('Magic Router connection not configured');
    }
    const response = await (router as any)._rpcRequest('getBlockhashForAccounts', [
      accounts.map((a) => a.toBase58()),
    ]);
    if (response.error) {
      throw new Error(`Router getBlockhashForAccounts failed: ${JSON.stringify(response.error)}`);
    }
    return response.result as string;
  }

  /**
   * Send a transaction.
   *
   * For ER-bound transactions (operating on delegated accounts), pass
   * `{ useRouter: true, delegatedAccounts: [...] }` to fetch an ER-valid
   * blockhash from the Magic Router instead of the base layer.
   */
  async sendTransaction(
    tx: Transaction,
    opts?: SendTransactionOpts
  ): Promise<TransactionResult> {
    if (!this.config.wallet) {
      throw new Error('Wallet not connected');
    }

    const useRouter = opts?.useRouter && this.config.routerConnection;
    let blockhash: string;
    let lastValidBlockHeight: number;
    let erBlockhash: string | undefined;

    if (useRouter) {
      if (!opts.delegatedAccounts || opts.delegatedAccounts.length === 0) {
        throw new Error('delegatedAccounts required when useRouter=true');
      }
      erBlockhash = await this.getBlockhashForAccounts(opts.delegatedAccounts);
      blockhash = erBlockhash;
      // Router blockhashes have a short TTL; use a conservative lastValidBlockHeight
      const slot = await this.config.routerConnection!.getSlot('confirmed');
      lastValidBlockHeight = slot + 30;
    } else {
      const latest = await this.config.connection.getLatestBlockhash();
      blockhash = latest.blockhash;
      lastValidBlockHeight = latest.lastValidBlockHeight;
    }

    tx.recentBlockhash = blockhash;
    tx.feePayer = this.config.wallet.publicKey;

    const signed = await this.config.wallet.signTransaction(tx);
    const connection = useRouter ? this.config.routerConnection! : this.config.connection;

    const signature = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    const confirmation = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed'
    );

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    return { signature, confirmation, erBlockhash };
  }
}
