import { PublicKey, SystemProgram, SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import type { SableClient } from './client';
import { PERMISSION_PROGRAM_ID } from './pda';
import type { TransactionResult } from './types';

export type ParentKind = 'user' | 'agent';
export type RecipientKind = 'user' | 'agent';

export interface SpendPolicy {
  perTxLimit: BN;
  dailyLimit: BN;
  totalLimit: BN;
  counterpartyMode: 'any' | 'allowlistOnly';
  allowedCounterparties: PublicKey[]; // max 4
  allowedMints: PublicKey[]; // max 4
  expiresAt: BN;
}

export interface AgentSnapshot {
  pubkey: PublicKey;
  version: number;
  bump: number;
  parentKind: ParentKind;
  parent: PublicKey;
  owner: PublicKey;
  rootUser: PublicKey;
  label: string;
  nonce: number;
  childCount: number;
  frozen: boolean;
  revoked: boolean;
  createdAt: BN;
  policy: SpendPolicy;
  taskCount: BN;
}

function toParentKindEnum(kind: ParentKind): any {
  return kind === 'user' ? { user: {} } : { agent: {} };
}

function toRecipientKindEnum(kind: RecipientKind): any {
  return kind === 'user' ? { user: {} } : { agent: {} };
}

function parseLabel(labelArr: number[]): string {
  const buf = Buffer.from(labelArr);
  const nullIdx = buf.indexOf(0);
  return buf.slice(0, nullIdx === -1 ? 32 : nullIdx).toString('utf8');
}

function buildSpendPolicy(policy: SpendPolicy): any {
  const padPubkeys = (arr: PublicKey[]) => {
    const out = [...arr];
    while (out.length < 4) {
      out.push(PublicKey.default);
    }
    return out;
  };

  return {
    per_tx_limit: policy.perTxLimit,
    daily_limit: policy.dailyLimit,
    total_limit: policy.totalLimit,
    counterparty_mode:
      policy.counterpartyMode === 'any' ? { any: {} } : { allowlistOnly: {} },
    allowed_counterparties: padPubkeys(policy.allowedCounterparties),
    allowed_mints: padPubkeys(policy.allowedMints),
    expires_at: policy.expiresAt,
  };
}

function parseAgentAccount(pubkey: PublicKey, data: any): AgentSnapshot {
  return {
    pubkey,
    version: data.version,
    bump: data.bump,
    parentKind: data.parent_kind?.user !== undefined ? 'user' : 'agent',
    parent: data.parent,
    owner: data.owner,
    rootUser: data.root_user,
    label: parseLabel(data.label),
    nonce: data.nonce,
    childCount: data.child_count,
    frozen: data.frozen,
    revoked: data.revoked,
    createdAt: data.created_at,
    policy: {
      perTxLimit: data.policy.per_tx_limit,
      dailyLimit: data.policy.daily_limit,
      totalLimit: data.policy.total_limit,
      counterpartyMode:
        data.policy.counterparty_mode?.any !== undefined
          ? 'any'
          : 'allowlistOnly',
      allowedCounterparties: data.policy.allowed_counterparties,
      allowedMints: data.policy.allowed_mints,
      expiresAt: data.policy.expires_at,
    },
    taskCount: data.task_count,
  };
}

function asRemainingAccounts(
  pubkeys: PublicKey[],
  isWritable = false
): { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[] {
  return pubkeys.map((pk) => ({
    pubkey: pk,
    isWritable,
    isSigner: false,
  }));
}

export class AgentsModule {
  constructor(private client: SableClient) {}

  // ─── Helpers ────────────────────────────────────────────────

  /**
   * Build the ancestor chain remaining accounts for an AgentState parent.
   * Returns ordered array from root UserState to the grandparent of the new agent
   * (i.e. up to the parent of `parentAgent`).
   */
  private async buildAncestorChainForSpawn(
    parentAgent: PublicKey
  ): Promise<PublicKey[]> {
    const chain: PublicKey[] = [];
    let currentPk = parentAgent;

    // Walk up from parentAgent to root user, collecting in reverse
    const visited = new Set<string>();
    while (true) {
      const key = currentPk.toBase58();
      if (visited.has(key)) throw new Error('Cycle detected in ancestor chain');
      visited.add(key);

      const data = (await this.client.program.account.agentState.fetch(currentPk)) as any;

      if (data.parent_kind?.user !== undefined) {
        // Parent is a UserState — this is the root
        chain.unshift(data.parent as PublicKey);
        break;
      }

      // Parent is another agent — add it and continue walking up
      chain.unshift(data.parent as PublicKey);
      currentPk = data.parent as PublicKey;
    }

    return chain;
  }

  /**
   * Build the ancestor chain remaining accounts for auth operations
   * (freeze/unfreeze/agent_transfer) from root user to the parent of `agent`.
   */
  private async buildAncestorChainForAuth(
    agent: PublicKey
  ): Promise<PublicKey[]> {
    const chain: PublicKey[] = [];
    let currentPk = agent;

    const visited = new Set<string>();
    while (true) {
      const key = currentPk.toBase58();
      if (visited.has(key)) throw new Error('Cycle detected in ancestor chain');
      visited.add(key);

      const data = (await this.client.program.account.agentState.fetch(currentPk)) as any;

      if (data.parent_kind?.user !== undefined) {
        // Parent is a UserState — this is the root, we're done
        break;
      }

      // Add the parent (which is an AgentState) to the chain
      chain.push(data.parent as PublicKey);
      currentPk = data.parent as PublicKey;
    }

    return chain;
  }

  // ─── Agent Lifecycle ────────────────────────────────────────

  /**
   * Spawn a new agent under a UserState or existing AgentState.
   * The connected wallet must be the owner of the parent.
   *
   * @param parentKind - 'user' or 'agent'
   * @param parent - Parent account pubkey (UserState or AgentState)
   * @param label - UTF-8 label, max 32 bytes
   */
  async spawnAgent({
    parentKind,
    parent,
    label,
  }: {
    parentKind: ParentKind;
    parent: PublicKey;
    label: string;
  }): Promise<{ agent: PublicKey; tx: TransactionResult }> {
    if (!this.client.isConnected) throw new Error('Wallet not connected');
    if (Buffer.from(label, 'utf8').length > 32) {
      throw new Error('Agent label must be <= 32 bytes');
    }

    const parentOwner = this.client.walletPublicKey!;
    const payer = parentOwner;

    // Fetch parent to get current count (nonce)
    const parentAccount = await this.client.config.connection.getAccountInfo(
      parent
    );
    if (!parentAccount) {
      throw new Error('Parent account not found');
    }

    let nonce: number;
    if (parentKind === 'user') {
      // UserState: agent_count at offset 49
      nonce = parentAccount.data.readUInt32LE(49);
    } else {
      // AgentState: child_count at offset 143
      nonce = parentAccount.data.readUInt32LE(143);
    }

    const [agent] = this.client.pda.deriveAgentState(parent, nonce);
    const [agentCounters] = this.client.pda.deriveAgentCounters(agent);

    // Build ancestor chain remaining accounts for Agent parent
    let remainingAccounts: { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[] = [];
    if (parentKind === 'agent') {
      const ancestors = await this.buildAncestorChainForSpawn(parent);
      remainingAccounts = asRemainingAccounts(ancestors);
    }

    const tx = await this.client.program.methods
      .spawnAgent(toParentKindEnum(parentKind), label, nonce)
      .accounts({
        payer,
        parent,
        newAgent: agent,
        newAgentCounters: agentCounters,
        parentOwner,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(remainingAccounts)
      .transaction();

    const result = await this.client.sendTransaction(tx);
    return { agent, tx: result };
  }

  /**
   * Close an agent. Only root_user owner can close. Agent must have no children
   * and all provided AgentBalance accounts have amount == 0.
   */
  async closeAgent({
    agent,
    zeroBalances = [],
  }: {
    agent: PublicKey;
    zeroBalances?: PublicKey[];
  }): Promise<{ tx: TransactionResult }> {
    if (!this.client.isConnected) throw new Error('Wallet not connected');

    const rootOwner = this.client.walletPublicKey!;

    const agentData = (await this.client.program.account.agentState.fetch(agent)) as any;
    const [rootUser] = this.client.pda.deriveUserState(agentData.root_user as PublicKey);

    const remainingAccounts = asRemainingAccounts(zeroBalances);

    const tx = await this.client.program.methods
      .closeAgent()
      .accounts({
        payer: rootOwner,
        agent,
        parent: agentData.parent,
        rootUser,
        rootOwner,
      })
      .remainingAccounts(remainingAccounts)
      .transaction();

    const result = await this.client.sendTransaction(tx);
    return { tx: result };
  }

  // ─── Funding ────────────────────────────────────────────────

  /**
   * Fund an agent by debiting root user's balance and crediting agent's balance.
   * Creates PER permission on first fund.
   */
  async fundAgent({
    agent,
    mint,
    amount,
  }: {
    agent: PublicKey;
    mint: PublicKey;
    amount: BN;
  }): Promise<{ tx: TransactionResult }> {
    if (!this.client.isConnected) throw new Error('Wallet not connected');

    const rootOwner = this.client.walletPublicKey!;
    const [rootUserState] = this.client.pda.deriveUserState(rootOwner);
    const [rootUserBalance] = this.client.pda.deriveUserBalance(rootOwner, mint);
    const [agentBalance] = this.client.pda.deriveAgentBalance(agent, mint);
    const [permission] = this.client.pda.derivePermission(agentBalance);

    const tx = await this.client.program.methods
      .fundAgent(amount)
      .accounts({
        rootOwner,
        rootUserState,
        rootUserBalance,
        agent,
        agentBalance,
        mint,
        systemProgram: SystemProgram.programId,
        permissionProgram: PERMISSION_PROGRAM_ID,
        permission,
      })
      .transaction();

    const result = await this.client.sendTransaction(tx);
    return { tx: result };
  }

  /**
   * Defund an agent by debiting agent's balance and crediting root user's balance.
   */
  async defundAgent({
    agent,
    mint,
    amount,
  }: {
    agent: PublicKey;
    mint: PublicKey;
    amount: BN;
  }): Promise<{ tx: TransactionResult }> {
    if (!this.client.isConnected) throw new Error('Wallet not connected');

    const rootOwner = this.client.walletPublicKey!;
    const [rootUserState] = this.client.pda.deriveUserState(rootOwner);
    const [rootUserBalance] = this.client.pda.deriveUserBalance(rootOwner, mint);
    const [agentBalance] = this.client.pda.deriveAgentBalance(agent, mint);

    const tx = await this.client.program.methods
      .defundAgent(amount)
      .accounts({
        rootOwner,
        rootUserState,
        rootUserBalance,
        agent,
        agentBalance,
        mint,
      })
      .transaction();

    const result = await this.client.sendTransaction(tx);
    return { tx: result };
  }

  // ─── Policy ─────────────────────────────────────────────────

  /**
   * Update an agent's spend policy. Only root_user owner can set policy.
   */
  async setPolicy({
    agent,
    policy,
  }: {
    agent: PublicKey;
    policy: SpendPolicy;
  }): Promise<{ tx: TransactionResult }> {
    if (!this.client.isConnected) throw new Error('Wallet not connected');

    const rootOwner = this.client.walletPublicKey!;
    const agentData = (await this.client.program.account.agentState.fetch(agent)) as any;
    const [rootUser] = this.client.pda.deriveUserState(agentData.root_user as PublicKey);

    const tx = await this.client.program.methods
      .setPolicy(buildSpendPolicy(policy))
      .accounts({
        payer: rootOwner,
        agent,
        rootUser,
        rootOwner,
      })
      .transaction();

    const result = await this.client.sendTransaction(tx);
    return { tx: result };
  }

  // ─── Kill Switches ──────────────────────────────────────────

  /**
   * Freeze an agent. Callable by root_user owner or any ancestor agent's owner.
   * Automatically builds ancestor chain if not provided.
   */
  async freezeAgent({
    agent,
    ancestors,
  }: {
    agent: PublicKey;
    ancestors?: PublicKey[];
  }): Promise<{ tx: TransactionResult }> {
    if (!this.client.isConnected) throw new Error('Wallet not connected');

    const signer = this.client.walletPublicKey!;
    const agentData = (await this.client.program.account.agentState.fetch(agent)) as any;
    const [rootUser] = this.client.pda.deriveUserState(agentData.root_user as PublicKey);

    const ancestorChain = ancestors ?? (await this.buildAncestorChainForAuth(agent));
    const remainingAccounts = asRemainingAccounts(ancestorChain);

    const tx = await this.client.program.methods
      .freezeAgent()
      .accounts({
        agent,
        rootUser,
        signer,
      })
      .remainingAccounts(remainingAccounts)
      .transaction();

    const result = await this.client.sendTransaction(tx);
    return { tx: result };
  }

  /**
   * Unfreeze an agent. Callable by root_user owner or any ancestor agent's owner.
   * Automatically builds ancestor chain if not provided.
   */
  async unfreezeAgent({
    agent,
    ancestors,
  }: {
    agent: PublicKey;
    ancestors?: PublicKey[];
  }): Promise<{ tx: TransactionResult }> {
    if (!this.client.isConnected) throw new Error('Wallet not connected');

    const signer = this.client.walletPublicKey!;
    const agentData = (await this.client.program.account.agentState.fetch(agent)) as any;
    const [rootUser] = this.client.pda.deriveUserState(agentData.root_user as PublicKey);

    const ancestorChain = ancestors ?? (await this.buildAncestorChainForAuth(agent));
    const remainingAccounts = asRemainingAccounts(ancestorChain);

    const tx = await this.client.program.methods
      .unfreezeAgent()
      .accounts({
        agent,
        rootUser,
        signer,
      })
      .remainingAccounts(remainingAccounts)
      .transaction();

    const result = await this.client.sendTransaction(tx);
    return { tx: result };
  }

  /**
   * Revoke an agent. Only root_user owner can revoke. Irreversible.
   */
  async revokeAgent({
    agent,
  }: {
    agent: PublicKey;
  }): Promise<{ tx: TransactionResult }> {
    if (!this.client.isConnected) throw new Error('Wallet not connected');

    const rootOwner = this.client.walletPublicKey!;
    const agentData = (await this.client.program.account.agentState.fetch(agent)) as any;
    const [rootUser] = this.client.pda.deriveUserState(agentData.root_user as PublicKey);

    const tx = await this.client.program.methods
      .revokeAgent()
      .accounts({
        agent,
        rootUser,
        rootOwner,
      })
      .transaction();

    const result = await this.client.sendTransaction(tx);
    return { tx: result };
  }

  // ─── Agent Transfers ────────────────────────────────────────

  /**
   * Transfer from an AgentBalance to a UserBalance or AgentBalance.
   * Automatically builds ancestor chain if not provided.
   */
  async agentTransfer({
    agent,
    mint,
    to,
    toKind,
    amount,
    ancestors,
  }: {
    agent: PublicKey;
    mint: PublicKey;
    to: PublicKey;
    toKind: RecipientKind;
    amount: BN;
    ancestors?: PublicKey[];
  }): Promise<{ tx: TransactionResult }> {
    if (!this.client.isConnected) throw new Error('Wallet not connected');

    const agentOwner = this.client.walletPublicKey!;
    const [agentBalance] = this.client.pda.deriveAgentBalance(agent, mint);
    const [agentCounters] = this.client.pda.deriveAgentCounters(agent);

    // Derive destination balance PDA
    let dest: PublicKey;
    if (toKind === 'user') {
      [dest] = this.client.pda.deriveUserBalance(to, mint);
    } else {
      [dest] = this.client.pda.deriveAgentBalance(to, mint);
    }

    const ancestorChain = ancestors ?? (await this.buildAncestorChainForAuth(agent));
    const remainingAccounts = asRemainingAccounts(ancestorChain);

    const tx = await this.client.program.methods
      .agentTransfer(amount, to, toRecipientKindEnum(toKind))
      .accounts({
        agentOwner,
        agent,
        agentBalance,
        agentCounters,
        dest,
        mint,
        clock: SYSVAR_CLOCK_PUBKEY,
      })
      .remainingAccounts(remainingAccounts)
      .transaction();

    const result = await this.client.sendTransaction(tx);
    return { tx: result };
  }

  /**
   * Batch transfer from an AgentBalance to multiple recipients.
   * Automatically builds ancestor chain if not provided.
   */
  async agentTransferBatch({
    agent,
    mint,
    items,
    ancestors,
  }: {
    agent: PublicKey;
    mint: PublicKey;
    items: { to: PublicKey; toKind: RecipientKind; amount: BN }[];
    ancestors?: PublicKey[];
  }): Promise<{ tx: TransactionResult }> {
    if (!this.client.isConnected) throw new Error('Wallet not connected');

    const agentOwner = this.client.walletPublicKey!;
    const [agentBalance] = this.client.pda.deriveAgentBalance(agent, mint);
    const [agentCounters] = this.client.pda.deriveAgentCounters(agent);

    // Build transfer items for the program
    const transferItems = items.map((item) => ({
      to_owner: item.to,
      amount: item.amount,
      kind: toRecipientKindEnum(item.toKind),
    }));

    const ancestorChain = ancestors ?? (await this.buildAncestorChainForAuth(agent));
    const remainingAccounts = asRemainingAccounts(ancestorChain);

    // Append destination accounts (writable)
    for (const item of items) {
      let dest: PublicKey;
      if (item.toKind === 'user') {
        [dest] = this.client.pda.deriveUserBalance(item.to, mint);
      } else {
        [dest] = this.client.pda.deriveAgentBalance(item.to, mint);
      }
      remainingAccounts.push({ pubkey: dest, isWritable: true, isSigner: false });
    }

    const tx = await this.client.program.methods
      .agentTransferBatch(transferItems, ancestorChain.length)
      .accounts({
        agentOwner,
        agent,
        agentBalance,
        agentCounters,
        mint,
        clock: SYSVAR_CLOCK_PUBKEY,
      })
      .remainingAccounts(remainingAccounts)
      .transaction();

    const result = await this.client.sendTransaction(tx);
    return { tx: result };
  }

  // ─── Queries ────────────────────────────────────────────────

  /**
   * List all agents for a given root user.
   */
  async listAgents(rootUser: PublicKey): Promise<AgentSnapshot[]> {
    const accounts = await this.client.program.account.agentState.all([
      {
        memcmp: {
          offset: 8 + 1 + 1 + 1 + 32, // Skip disc + version + bump + parent_kind + parent
          bytes: rootUser.toBase58(),
        },
      },
    ]);

    return accounts.map((a: any) => parseAgentAccount(a.publicKey, a.account));
  }

  /**
   * Get a single agent by pubkey.
   */
  async getAgent(agent: PublicKey): Promise<AgentSnapshot | null> {
    try {
      const data = await this.client.program.account.agentState.fetch(agent);
      return parseAgentAccount(agent, data);
    } catch {
      return null;
    }
  }

  /**
   * Get agent counters.
   */
  async getAgentCounters(agent: PublicKey): Promise<any | null> {
    const [countersPda] = this.client.pda.deriveAgentCounters(agent);
    try {
      return await this.client.program.account.agentCounters.fetch(countersPda);
    } catch {
      return null;
    }
  }

  /**
   * Get agent balance for a mint.
   */
  async getAgentBalance(
    agent: PublicKey,
    mint: PublicKey
  ): Promise<any | null> {
    const [balancePda] = this.client.pda.deriveAgentBalance(agent, mint);
    try {
      return await this.client.program.account.agentBalance.fetch(balancePda);
    } catch {
      return null;
    }
  }
}
