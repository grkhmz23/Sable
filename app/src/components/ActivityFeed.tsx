'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWalletContext } from '@/contexts/WalletContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { env } from '@/utils/env';
import {
  GlassPanel,
  Pill,
  SectionHeader,
  truncateAddress,
} from '@/components/ui/luxury';

interface ActivityItem {
  signature: string;
  timestamp: number | null | undefined;
  status: 'success' | 'error' | 'unknown';
  description: string;
}

const POLL_INTERVAL_MS = 10_000;
const ACTIVITY_LIMIT = 20;

export function ActivityFeed() {
  const { solanaSdk } = useWalletContext();
  const { publicKey } = useWallet();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const programId = new PublicKey(env.SABLE_PROGRAM_ID);

  const fetchActivity = useCallback(async () => {
    if (!solanaSdk || !publicKey) return;
    setIsLoading(true);

    try {
      const signatures = await solanaSdk.config.connection.getSignaturesForAddress(publicKey, {
        limit: ACTIVITY_LIMIT,
      });

      const items: ActivityItem[] = await Promise.all(
        signatures.map(async (sigInfo) => {
          let description = 'Transaction';
          let status: ActivityItem['status'] = sigInfo.err ? 'error' : 'success';

          try {
            const tx = await solanaSdk.config.connection.getTransaction(sigInfo.signature, {
              commitment: 'confirmed',
              maxSupportedTransactionVersion: 0,
            });

            if (tx) {
              const message = tx.transaction.message;
              const accountKeys = message.staticAccountKeys.map((k: PublicKey) => k.toBase58());
              const involvesProgram = accountKeys.includes(programId.toBase58());

              if (involvesProgram) {
                // Try to infer instruction type from logs
                const logs = tx.meta?.logMessages || [];
                if (logs.some((l) => l.includes('Instruction: Initialize'))) {
                  description = 'Initialize Sable';
                } else if (logs.some((l) => l.includes('Instruction: Join'))) {
                  description = 'Join Sable';
                } else if (logs.some((l) => l.includes('Instruction: CompleteSetup'))) {
                  description = 'Complete Setup';
                } else if (logs.some((l) => l.includes('Instruction: AddMint'))) {
                  description = 'Add Mint';
                } else if (logs.some((l) => l.includes('Instruction: Deposit'))) {
                  description = 'Deposit';
                } else if (logs.some((l) => l.includes('Instruction: Withdraw'))) {
                  description = 'Withdraw';
                } else if (logs.some((l) => l.includes('Instruction: TransferBatch'))) {
                  description = 'Transfer Batch';
                } else if (logs.some((l) => l.includes('Instruction: DelegateUserState'))) {
                  description = 'Delegate to ER';
                } else if (logs.some((l) => l.includes('Instruction: CommitAndUndelegate'))) {
                  description = 'Commit / Undelegate';
                } else if (logs.some((l) => l.includes('Instruction: SpawnAgent'))) {
                  description = 'Spawn Agent';
                } else if (logs.some((l) => l.includes('Instruction: CloseAgent'))) {
                  description = 'Close Agent';
                } else if (logs.some((l) => l.includes('Instruction: FundAgent'))) {
                  description = 'Fund Agent';
                } else if (logs.some((l) => l.includes('Instruction: DefundAgent'))) {
                  description = 'Defund Agent';
                } else if (logs.some((l) => l.includes('Instruction: AgentTransfer'))) {
                  description = 'Agent Transfer';
                } else if (logs.some((l) => l.includes('Instruction: SetPolicy'))) {
                  description = 'Set Policy';
                } else if (logs.some((l) => l.includes('Instruction: FreezeAgent'))) {
                  description = 'Freeze Agent';
                } else if (logs.some((l) => l.includes('Instruction: UnfreezeAgent'))) {
                  description = 'Unfreeze Agent';
                } else if (logs.some((l) => l.includes('Instruction: RevokeAgent'))) {
                  description = 'Revoke Agent';
                } else if (logs.some((l) => l.includes('Instruction: CreateTask'))) {
                  description = 'Create Task';
                } else if (logs.some((l) => l.includes('Instruction: CancelTask'))) {
                  description = 'Cancel Task';
                } else if (logs.some((l) => l.includes('Instruction: CommitBid'))) {
                  description = 'Commit Bid';
                } else if (logs.some((l) => l.includes('Instruction: RevealBid'))) {
                  description = 'Reveal Bid';
                } else if (logs.some((l) => l.includes('Instruction: SettleAuction'))) {
                  description = 'Settle Auction';
                } else {
                  description = 'Sable Interaction';
                }
              } else {
                description = 'External Transaction';
              }
            }
          } catch {
            // Leave description as default
          }

          return {
            signature: sigInfo.signature,
            timestamp: sigInfo.blockTime,
            status,
            description,
          };
        })
      );

      // Filter to only show Sable-related and successful/error transactions
      const filtered = items.filter(
        (i) =>
          i.description !== 'External Transaction' &&
          i.description !== 'Transaction'
      );

      setActivities(filtered.length > 0 ? filtered : items.slice(0, 10));
      setLastPoll(new Date());
    } catch (error) {
      console.error('Activity feed error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [solanaSdk, publicKey, programId]);

  useEffect(() => {
    fetchActivity();
    intervalRef.current = setInterval(fetchActivity, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchActivity]);

  const formatTime = (unix: number | null | undefined) => {
    if (!unix) return 'Unknown time';
    const d = new Date(unix * 1000);
    return d.toLocaleString();
  };

  const explorerUrl = (sig: string) =>
    `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

  return (
    <GlassPanel className="p-6 md:p-7">
      <SectionHeader
        eyebrow="History"
        title="Activity Feed"
        subtitle="Recent Sable transactions for your treasury."
        action={
          <div className="flex items-center gap-2">
            {lastPoll ? (
              <span className="text-[10px] text-zinc-600">
                Updated {lastPoll.toLocaleTimeString()}
              </span>
            ) : null}
            <button
              type="button"
              onClick={fetchActivity}
              disabled={isLoading}
              className="rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200 disabled:opacity-50"
            >
              {isLoading ? '...' : 'Refresh'}
            </button>
          </div>
        }
      />

      <div className="mt-6 space-y-2">
        {activities.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-black/30 p-5">
            <p className="text-sm text-zinc-300">No activity yet.</p>
            <p className="mt-2 text-xs text-zinc-500">
              Transactions will appear here once you start using your treasury.
            </p>
          </div>
        ) : (
          activities.map((item) => (
            <a
              key={item.signature}
              href={explorerUrl(item.signature)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col gap-1 rounded-xl border border-white/6 bg-white/[0.02] p-4 transition hover:border-white/12 hover:bg-white/[0.035] sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`h-2 w-2 rounded-full ${
                    item.status === 'success'
                      ? 'bg-emerald-400'
                      : item.status === 'error'
                      ? 'bg-rose-400'
                      : 'bg-zinc-500'
                  }`}
                />
                <div>
                  <p className="text-sm text-white">{item.description}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-zinc-500">
                    {truncateAddress(item.signature, 16, 12)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:text-right">
                <Pill tone={item.status === 'success' ? 'green' : item.status === 'error' ? 'red' : 'default'}>
                  {item.status === 'success' ? 'Success' : item.status === 'error' ? 'Failed' : 'Unknown'}
                </Pill>
                <span className="text-[10px] text-zinc-600">{formatTime(item.timestamp)}</span>
              </div>
            </a>
          ))
        )}
      </div>
    </GlassPanel>
  );
}
