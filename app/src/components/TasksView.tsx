'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWalletContext } from '@/contexts/WalletContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import type { TaskSnapshot, BidSnapshot, AgentSnapshot, TaskState } from '@sable/sdk';
import { sha256, computeCommitHash } from '@sable/common';
import {
  GlassPanel,
  LuxuryButton,
  LuxuryInput,
  LuxuryTextarea,
  Pill,
  SectionHeader,
  truncateAddress,
  cn,
} from '@/components/ui/luxury';
import toast from 'react-hot-toast';

type TabId = 'open' | 'my-tasks' | 'my-bids';

interface TaskWithBids extends TaskSnapshot {
  myBid?: BidSnapshot;
}

export function TasksView() {
  const { sdk } = useWalletContext();
  const { publicKey, connected } = useWallet();
  const [activeTab, setActiveTab] = useState<TabId>('open');
  const [tasks, setTasks] = useState<TaskWithBids[]>([]);
  const [agents, setAgents] = useState<AgentSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskWithBids | null>(null);

  const fetchAgents = useCallback(async () => {
    if (!sdk || !publicKey) return;
    try {
      const list = await sdk.agents.listAgents(publicKey);
      setAgents(list);
    } catch {
      setAgents([]);
    }
  }, [sdk, publicKey]);

  const fetchTasks = useCallback(async () => {
    if (!sdk || !publicKey) return;
    setLoading(true);
    try {
      let list: TaskSnapshot[] = [];

      if (activeTab === 'open') {
        list = await sdk.auctions.listTasks({ state: 'open' });
        // Exclude tasks where user is the poster
        list = list.filter((t) => !t.poster.equals(publicKey));
      } else if (activeTab === 'my-tasks') {
        // Tasks posted by user or their agents
        const myTasks = await sdk.auctions.listTasks({ poster: publicKey });
        const agentTasks = await Promise.all(
          agents.map((a) => sdk!.auctions.listTasks({ poster: a.pubkey }))
        );
        list = [...myTasks, ...agentTasks.flat()];
      } else if (activeTab === 'my-bids') {
        // Get all bids for user + agents, then fetch corresponding tasks
        const allBids = await sdk.program.account.bid.all();
        const myBids = allBids.filter((b: any) => {
          const bidder = b.account.bidder as PublicKey;
          return bidder.equals(publicKey) || agents.some((a) => a.pubkey.equals(bidder));
        });

        const taskMap = new Map<string, TaskSnapshot>();
        await Promise.all(
          myBids.map(async (b: any) => {
            const taskPk = b.account.task as PublicKey;
            const key = taskPk.toBase58();
            if (!taskMap.has(key)) {
              const task = await sdk!.auctions.getTask(taskPk);
              if (task) taskMap.set(key, task);
            }
          })
        );
        list = Array.from(taskMap.values());
      }

      // For my-bids tab, attach bid info
      const enriched: TaskWithBids[] = await Promise.all(
        list.map(async (t) => {
          if (activeTab === 'my-bids') {
            const bid = await sdk!.auctions.getBid(t.pubkey, publicKey);
            return { ...t, myBid: bid || undefined };
          }
          return t;
        })
      );

      // Deduplicate
      const seen = new Set<string>();
      const unique = enriched.filter((t) => {
        if (seen.has(t.pubkey.toBase58())) return false;
        seen.add(t.pubkey.toBase58());
        return true;
      });

      setTasks(unique);
    } catch (error: any) {
      console.error('Error fetching tasks:', error);
      toast.error(error.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [sdk, publicKey, activeTab, agents]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'open', label: 'Open Tasks' },
    { id: 'my-tasks', label: 'My Tasks' },
    { id: 'my-bids', label: 'My Bids' },
  ];

  if (!connected) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-lg text-white">Connect your wallet to view tasks.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <SectionHeader
          eyebrow="Auctions"
          title="Task Marketplace"
          subtitle="Sealed-bid tasks posted by you or your agents."
        />
        <LuxuryButton variant="secondary" className="px-4 py-2" onClick={() => setShowCreate(true)}>
          + Create Task
        </LuxuryButton>
      </div>

      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={cn(
              'rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.16em] transition',
              activeTab === t.id
                ? 'border border-white/12 bg-white/[0.08] text-amber-100'
                : 'text-zinc-500 hover:text-zinc-200'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <GlassPanel className="p-6">
        {loading ? (
          <p className="text-sm text-zinc-400">Loading tasks...</p>
        ) : tasks.length === 0 ? (
          <div className="rounded-xl border border-white/8 bg-black/30 p-5">
            <p className="text-sm text-zinc-300">No tasks found.</p>
            <p className="mt-2 text-xs text-zinc-500">
              {activeTab === 'open'
                ? 'No open tasks available right now.'
                : activeTab === 'my-tasks'
                ? 'You have not posted any tasks yet.'
                : 'You have not placed any bids yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <button
                key={task.pubkey.toBase58()}
                type="button"
                onClick={() => setSelectedTask(task)}
                className="w-full rounded-xl border border-white/6 bg-white/[0.02] p-4 text-left transition hover:border-white/12 hover:bg-white/[0.035]"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-white">Task #{task.taskId.toString()}</p>
                      <Pill
                        tone={
                          task.state === 'open'
                            ? 'green'
                            : task.state === 'revealing'
                            ? 'amber'
                            : task.state === 'settled'
                            ? 'default'
                            : 'red'
                        }
                      >
                        {task.state}
                      </Pill>
                      {task.myBid ? <Pill>Bid Placed</Pill> : null}
                    </div>
                    <p className="mt-1 font-mono text-xs text-zinc-500">
                      {truncateAddress(task.pubkey.toBase58(), 14, 14)}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-sm text-zinc-300">Budget: {task.budget.toString()}</p>
                    <p className="text-xs text-zinc-500">
                      Min deposit: {task.minDeposit.toString()}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </GlassPanel>

      {showCreate && (
        <CreateTaskModal
          agents={agents}
          onClose={() => setShowCreate(false)}
          onComplete={fetchTasks}
        />
      )}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          myBid={selectedTask.myBid}
          agents={agents}
          onClose={() => setSelectedTask(null)}
          onRefresh={fetchTasks}
        />
      )}
    </div>
  );
}

/* ───────── Create Task Modal ───────── */

function CreateTaskModal({
  agents,
  onClose,
  onComplete,
}: {
  agents: AgentSnapshot[];
  onClose: () => void;
  onComplete: () => void;
}) {
  const { sdk } = useWalletContext();
  const { publicKey } = useWallet();
  const [posterKind, setPosterKind] = useState<'user' | 'agent'>('user');
  const [posterAgent, setPosterAgent] = useState('');
  const [mint, setMint] = useState('');
  const [budget, setBudget] = useState('');
  const [minDeposit, setMinDeposit] = useState('');
  const [spec, setSpec] = useState('');
  const [commitSeconds, setCommitSeconds] = useState('300');
  const [revealSeconds, setRevealSeconds] = useState('600');
  const [isLoading, setIsLoading] = useState(false);

  const now = Math.floor(Date.now() / 1000);
  const commitDeadline = now + parseInt(commitSeconds || '0', 10);
  const revealDeadline = now + parseInt(revealSeconds || '0', 10);

  const handleCreate = async () => {
    if (!sdk || !publicKey) return;
    setIsLoading(true);
    try {
      const poster = posterKind === 'user' ? publicKey : new PublicKey(posterAgent);
      const mintPk = new PublicKey(mint.trim());
      const budgetBn = new BN(Math.floor(parseFloat(budget) * 1e9));
      const depositBn = new BN(Math.floor(parseFloat(minDeposit) * 1e9));

      const commitS = parseInt(commitSeconds, 10);
      const revealS = parseInt(revealSeconds, 10);

      if (revealS <= commitS) {
        throw new Error('Reveal deadline must be after commit deadline');
      }

      await sdk.auctions.createTask({
        posterKind,
        poster,
        mint: mintPk,
        budget: budgetBn,
        minDeposit: depositBn,
        specContent: spec,
        bidCommitSeconds: commitS,
        bidRevealSeconds: revealS,
      });

      toast.success('Task created successfully');
      onComplete();
      onClose();
    } catch (error: any) {
      console.error('Create task error:', error);
      toast.error(error.message || 'Failed to create task');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-xl" onClick={onClose} />
      <GlassPanel className="relative w-full max-w-lg p-6 md:p-8" highlight>
        <SectionHeader
          eyebrow="Auction"
          title="Create Task"
          subtitle="Post a sealed-bid task with a locked budget."
          action={
            <LuxuryButton variant="ghost" className="px-3 py-2" onClick={onClose}>
              Close
            </LuxuryButton>
          }
        />

        <div className="mt-6 space-y-4">
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-zinc-500">Poster</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPosterKind('user')}
                className={cn(
                  'rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.16em] transition',
                  posterKind === 'user'
                    ? 'border border-white/12 bg-white/[0.08] text-amber-100'
                    : 'text-zinc-500 hover:text-zinc-200'
                )}
              >
                Self
              </button>
              <button
                type="button"
                onClick={() => setPosterKind('agent')}
                className={cn(
                  'rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.16em] transition',
                  posterKind === 'agent'
                    ? 'border border-white/12 bg-white/[0.08] text-amber-100'
                    : 'text-zinc-500 hover:text-zinc-200'
                )}
              >
                Agent
              </button>
            </div>
            {posterKind === 'agent' ? (
              <select
                value={posterAgent}
                onChange={(e) => setPosterAgent(e.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-zinc-100 focus:border-[rgba(214,190,112,0.32)] focus:outline-none"
              >
                <option value="">Select agent</option>
                {agents.map((a) => (
                  <option key={a.pubkey.toBase58()} value={a.pubkey.toBase58()}>
                    {a.label} ({truncateAddress(a.pubkey.toBase58(), 8, 6)})
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          <LuxuryInput label="Mint" placeholder="Mint address" value={mint} onChange={(e) => setMint(e.target.value)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <LuxuryInput label="Budget" type="number" placeholder="0" value={budget} onChange={(e) => setBudget(e.target.value)} />
            <LuxuryInput label="Min Deposit" type="number" placeholder="0" value={minDeposit} onChange={(e) => setMinDeposit(e.target.value)} />
          </div>
          <LuxuryTextarea label="Specification" placeholder="Describe the task..." value={spec} onChange={(e) => setSpec(e.target.value)} rows={4} />
          <div className="grid gap-4 sm:grid-cols-2">
            <LuxuryInput label="Commit Duration (seconds)" type="number" value={commitSeconds} onChange={(e) => setCommitSeconds(e.target.value)} />
            <LuxuryInput label="Reveal Duration (seconds)" type="number" value={revealSeconds} onChange={(e) => setRevealSeconds(e.target.value)} />
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/35 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Deadline Preview</p>
            <div className="mt-2 space-y-1 text-sm text-zinc-300">
              <p>Commit ends: {new Date(commitDeadline * 1000).toLocaleString()}</p>
              <p>Reveal ends: {new Date(revealDeadline * 1000).toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <LuxuryButton variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </LuxuryButton>
          <LuxuryButton onClick={handleCreate} isLoading={isLoading} disabled={!mint || !budget || !minDeposit}>
            Create Task
          </LuxuryButton>
        </div>
      </GlassPanel>
    </div>
  );
}

/* ───────── Task Detail Modal ───────── */

function TaskDetailModal({
  task,
  myBid,
  agents,
  onClose,
  onRefresh,
}: {
  task: TaskWithBids;
  myBid?: BidSnapshot;
  agents: AgentSnapshot[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const { sdk } = useWalletContext();
  const { publicKey } = useWallet();
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [bids, setBids] = useState<BidSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Bid form state
  const [bidAmount, setBidAmount] = useState('');
  const [bidDeposit, setBidDeposit] = useState('');
  const [bidderKind, setBidderKind] = useState<'user' | 'agent'>('user');
  const [bidderAgent, setBidderAgent] = useState('');
  const [generatedNonce, setGeneratedNonce] = useState<BN | null>(null);
  const [commitHash, setCommitHash] = useState<Uint8Array | null>(null);
  const [nonceDownloaded, setNonceDownloaded] = useState(false);
  const [commitTxSig, setCommitTxSig] = useState<string | null>(null);

  // Reveal form state
  const [revealNonce, setRevealNonce] = useState<BN | null>(null);
  const [revealAmount, setRevealAmount] = useState('');
  const [nonceFile, setNonceFile] = useState<string>('');

  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!sdk) return;
    sdk.auctions.getTaskBids(task.pubkey).then(setBids).catch(console.error);
  }, [sdk, task.pubkey]);

  const commitDeadline = task.bidCommitDeadline.toNumber();
  const revealDeadline = task.bidRevealDeadline.toNumber();

  const phase: 'commit' | 'reveal' | 'settle' | 'cancelled' =
    task.state === 'cancelled'
      ? 'cancelled'
      : now < commitDeadline
      ? 'commit'
      : now < revealDeadline
      ? 'reveal'
      : 'settle';

  const countdownText = () => {
    const target = phase === 'commit' ? commitDeadline : phase === 'reveal' ? revealDeadline : 0;
    if (!target) return '';
    const diff = target - now;
    if (diff <= 0) return 'Ended';
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return `${h}h ${m}m ${s}s`;
  };

  const handleGenerateNonce = () => {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const nonce = new BN(bytes, 'le');
    const amount = new BN(Math.floor(parseFloat(bidAmount) * 1e9));
    const bidder = bidderKind === 'user' ? publicKey! : new PublicKey(bidderAgent);
    const hash = computeCommitHash(amount, nonce, bidder);
    setGeneratedNonce(nonce);
    setCommitHash(hash);
    setNonceDownloaded(false);
  };

  const downloadNonce = () => {
    if (!generatedNonce) return;
    const blob = new Blob([JSON.stringify({ nonce: generatedNonce.toString(10) })], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nonce-task-${task.taskId.toString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setNonceDownloaded(true);
  };

  const handleCommitBid = async () => {
    if (!sdk || !publicKey || !generatedNonce || !commitHash) return;
    if (!nonceDownloaded) {
      toast.error('Download your nonce first');
      return;
    }
    setIsLoading(true);
    try {
      const amount = new BN(Math.floor(parseFloat(bidAmount) * 1e9));
      const deposit = new BN(Math.floor(parseFloat(bidDeposit) * 1e9));
      const bidder = bidderKind === 'user' ? publicKey : new PublicKey(bidderAgent);

      const result = await sdk.auctions.commitBid({
        task: task.pubkey,
        bidder,
        bidderKind,
        amount,
        deposit,
        nonce: generatedNonce,
      });

      toast.success('Bid committed successfully');
      setCommitTxSig(result.tx.signature);
      setBidAmount('');
      setBidDeposit('');
      setGeneratedNonce(null);
      setCommitHash(null);
      setNonceDownloaded(false);
      onRefresh();
    } catch (error: any) {
      console.error('Commit bid error:', error);
      toast.error(error.message || 'Failed to commit bid');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevealBid = async () => {
    if (!sdk || !publicKey || !revealNonce) return;
    setIsLoading(true);
    try {
      const amount = new BN(Math.floor(parseFloat(revealAmount) * 1e9));
      const bidder = publicKey;

      await sdk.auctions.revealBid({
        task: task.pubkey,
        bidder,
        amount,
        nonce: revealNonce,
      });

      toast.success('Bid revealed successfully');
      setRevealNonce(null);
      setRevealAmount('');
      setNonceFile('');
      onRefresh();
    } catch (error: any) {
      console.error('Reveal bid error:', error);
      toast.error(error.message || 'Failed to reveal bid');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSettle = async () => {
    if (!sdk) return;
    setIsLoading(true);
    try {
      const result = await sdk.auctions.settleAuction({ task: task.pubkey });
      toast.success(`Auction settled. Winner: ${truncateAddress(result.winner.toBase58(), 8, 6)}`);
      onRefresh();
    } catch (error: any) {
      console.error('Settle error:', error);
      toast.error(error.message || 'Failed to settle auction');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNonceFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        setRevealNonce(new BN(data.nonce, 10));
        setNonceFile(file.name);
        toast.success('Nonce loaded');
      } catch {
        toast.error('Invalid nonce file');
      }
    };
    reader.readAsText(file);
  };

  const specHashHex = Buffer.from(task.specHash).toString('hex');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-xl" onClick={onClose} />
      <GlassPanel className="relative max-h-[90vh] w-full max-w-2xl overflow-auto p-6 md:p-8" highlight>
        <SectionHeader
          eyebrow="Task Detail"
          title={`Task #${task.taskId.toString()}`}
          action={
            <LuxuryButton variant="ghost" className="px-3 py-2" onClick={onClose}>
              Close
            </LuxuryButton>
          }
        />

        <div className="mt-5 space-y-4">
          {/* Info grid */}
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoRow label="Poster" value={truncateAddress(task.poster.toBase58(), 14, 14)} />
            <InfoRow label="Mint" value={truncateAddress(task.mint.toBase58(), 14, 14)} />
            <InfoRow label="Budget" value={task.budget.toString()} />
            <InfoRow label="Min Deposit" value={task.minDeposit.toString()} />
            <InfoRow label="State">
              <Pill
                tone={
                  task.state === 'open'
                    ? 'green'
                    : task.state === 'revealing'
                    ? 'amber'
                    : task.state === 'settled'
                    ? 'default'
                    : 'red'
                }
              >
                {task.state}
              </Pill>
            </InfoRow>
            <InfoRow label="Bids" value={String(bids.length)} />
          </div>

          {/* Countdown */}
          {phase !== 'cancelled' && phase !== 'settle' ? (
            <div className="rounded-2xl border border-amber-300/15 bg-amber-300/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-amber-200/70">
                {phase === 'commit' ? 'Commit Phase Ends In' : 'Reveal Phase Ends In'}
              </p>
              <p className="mt-2 text-2xl font-mono text-amber-100">{countdownText()}</p>
            </div>
          ) : null}

          {/* Spec hash */}
          <div className="rounded-2xl border border-white/8 bg-black/35 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Spec Hash (SHA-256)</p>
            <p className="mt-2 font-mono text-xs text-zinc-300 break-all">{specHashHex}</p>
          </div>

          {/* Privacy Proof */}
          {commitTxSig ? (
            <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-200/70">Privacy Proof</p>
              <p className="mt-2 text-sm text-zinc-300">
                Your bid amount was sealed with a keccak256 hash and submitted on-chain.
              </p>
              <a
                href={`https://explorer.solana.com/tx/${commitTxSig}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block font-mono text-xs text-emerald-300 hover:underline"
              >
                View commit tx: {truncateAddress(commitTxSig, 16, 14)}
              </a>
              <p className="mt-2 font-mono text-[10px] text-zinc-500 break-all">
                Commit hash: {commitHash ? Buffer.from(commitHash).toString('hex') : '—'}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                The amount is hidden as a hash — unreadable on L1 until reveal.
              </p>
            </div>
          ) : null}

          {/* Actions based on phase */}
          {phase === 'commit' && !myBid ? (
            <div className="rounded-2xl border border-white/8 bg-black/35 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Place Bid</p>

              <div className="mt-3 space-y-3">
                <div>
                  <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-zinc-500">Bidder</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setBidderKind('user')}
                      className={cn(
                        'rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.16em] transition',
                        bidderKind === 'user'
                          ? 'border border-white/12 bg-white/[0.08] text-amber-100'
                          : 'text-zinc-500 hover:text-zinc-200'
                      )}
                    >
                      Self
                    </button>
                    <button
                      type="button"
                      onClick={() => setBidderKind('agent')}
                      className={cn(
                        'rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.16em] transition',
                        bidderKind === 'agent'
                          ? 'border border-white/12 bg-white/[0.08] text-amber-100'
                          : 'text-zinc-500 hover:text-zinc-200'
                      )}
                    >
                      Agent
                    </button>
                  </div>
                  {bidderKind === 'agent' ? (
                    <select
                      value={bidderAgent}
                      onChange={(e) => setBidderAgent(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-zinc-100 focus:border-[rgba(214,190,112,0.32)] focus:outline-none"
                    >
                      <option value="">Select agent</option>
                      {agents.map((a) => (
                        <option key={a.pubkey.toBase58()} value={a.pubkey.toBase58()}>
                          {a.label} ({truncateAddress(a.pubkey.toBase58(), 8, 6)})
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <LuxuryInput label="Amount" type="number" placeholder="0" value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} />
                  <LuxuryInput label="Deposit" type="number" placeholder="0" value={bidDeposit} onChange={(e) => setBidDeposit(e.target.value)} />
                </div>

                {!generatedNonce ? (
                  <LuxuryButton
                    variant="secondary"
                    onClick={handleGenerateNonce}
                    disabled={!bidAmount || !bidDeposit || (bidderKind === 'agent' && !bidderAgent)}
                  >
                    Generate Commitment
                  </LuxuryButton>
                ) : (
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-300/5 p-4">
                    <p className="text-sm text-amber-100">🔒 Download your nonce before confirming</p>
                    <p className="mt-1 font-mono text-xs text-zinc-400">
                      Nonce: {generatedNonce.toString()}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <LuxuryButton variant="secondary" className="px-3 py-2 text-[10px]" onClick={downloadNonce}>
                        {nonceDownloaded ? 'Downloaded ✓' : 'Download Nonce'}
                      </LuxuryButton>
                      <LuxuryButton
                        onClick={handleCommitBid}
                        isLoading={isLoading}
                        disabled={!nonceDownloaded}
                        className="px-3 py-2 text-[10px]"
                      >
                        Confirm Commit
                      </LuxuryButton>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {phase === 'reveal' && myBid && !myBid.revealed ? (
            <div className="rounded-2xl border border-white/8 bg-black/35 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Reveal Bid</p>
              <div className="mt-3 space-y-3">
                <LuxuryInput label="Amount" type="number" placeholder="0" value={revealAmount} onChange={(e) => setRevealAmount(e.target.value)} />
                <div>
                  <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-zinc-500">Nonce File</p>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleNonceFileUpload}
                    className="block w-full text-sm text-zinc-300 file:mr-4 file:rounded-full file:border-0 file:bg-white/5 file:px-4 file:py-2 file:text-xs file:text-zinc-100"
                  />
                  {nonceFile ? <p className="mt-1 text-xs text-zinc-500">Loaded: {nonceFile}</p> : null}
                </div>
                <LuxuryButton
                  onClick={handleRevealBid}
                  isLoading={isLoading}
                  disabled={!revealAmount || !revealNonce}
                >
                  Reveal Bid
                </LuxuryButton>
              </div>
            </div>
          ) : null}

          {myBid?.revealed ? (
            <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/5 p-4">
              <p className="text-sm text-emerald-100">Bid revealed: {myBid.revealedAmount.toString()}</p>
            </div>
          ) : null}

          {phase === 'settle' && task.state !== 'settled' && task.state !== 'cancelled' ? (
            <div className="rounded-2xl border border-white/8 bg-black/35 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Settle Auction</p>
              <p className="mt-2 text-sm text-zinc-300">The reveal phase has ended. Anyone can settle the auction.</p>
              <LuxuryButton className="mt-3" onClick={handleSettle} isLoading={isLoading}>
                Settle Auction
              </LuxuryButton>
            </div>
          ) : null}

          {task.state === 'settled' ? (
            <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-200/70">Result</p>
              <p className="mt-2 text-sm text-white">
                Winner: {truncateAddress(task.winningBidder.toBase58(), 14, 14)}
              </p>
              <p className="mt-1 text-sm text-zinc-300">Winning bid: {task.winningBid.toString()}</p>
            </div>
          ) : null}
        </div>
      </GlassPanel>
    </div>
  );
}

function InfoRow({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      {children ? <div className="mt-1">{children}</div> : <p className="mt-1 text-sm text-white">{value}</p>}
    </div>
  );
}
