'use client';

import { useEffect, useMemo, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { SableSdk, DelegationStatus } from '@sable/sdk';
import { GlassPanel, LuxuryButton, Pill, truncateAddress, cn } from '@/components/ui/luxury';

interface DelegationStatusProps {
  sdk: SableSdk | null;
  owner: PublicKey | null;
  mints: PublicKey[];
  refreshInterval?: number;
  embedded?: boolean;
}

export function DelegationStatusComponent({
  sdk,
  owner,
  mints,
  refreshInterval = 30000,
  embedded = false,
}: DelegationStatusProps) {
  const [status, setStatus] = useState<DelegationStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mintsKey = useMemo(
    () => mints.map((m) => m.toBase58()).sort().join(','),
    [mints]
  );
  const ownerKey = owner?.toBase58() ?? '';

  const fetchStatus = async () => {
    if (!sdk || !owner) return;

    try {
      setLoading(true);
      setError(null);
      const delegationStatus = await sdk.getDelegationStatus(owner, mints);
      setStatus(delegationStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch delegation status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    if (refreshInterval > 0) {
      const interval = setInterval(fetchStatus, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [sdk, ownerKey, mintsKey, refreshInterval]);

  const delegatedCount = status.filter((s) => s.isDelegated).length;
  const totalCount = status.length;
  const widthPct = totalCount > 0 ? (delegatedCount / totalCount) * 100 : 0;

  if (!sdk || !owner) {
    return null;
  }

  const body = (
    <div className={cn('p-4', embedded ? 'rounded-2xl border border-white/8 bg-black/30' : '')}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">
            Delegation Status
          </p>
          <p className="mt-1 text-sm text-zinc-300">
            {delegatedCount} of {totalCount} tracked account(s) delegated
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Includes `UserState` plus {mints.length} mint balance account(s)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {delegatedCount > 0 ? <Pill tone="amber">Withdrawals blocked</Pill> : <Pill>Withdrawals available</Pill>}
          <LuxuryButton
            variant="secondary"
            className="px-4 py-2"
            onClick={fetchStatus}
            isLoading={loading}
          >
            Refresh
          </LuxuryButton>
        </div>
      </div>

      <div className="mt-4">
        <div className="h-2 overflow-hidden rounded-full bg-white/6">
          <div
            className={cn(
              'h-full transition-all duration-300',
              delegatedCount === totalCount && totalCount > 0
                ? 'bg-emerald-300/80'
                : delegatedCount > 0
                ? 'bg-amber-300/80'
                : 'bg-zinc-500/50'
            )}
            style={{ width: `${widthPct}%` }}
          />
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-300/15 bg-rose-300/5 p-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {status.length > 0 ? (
        <div className="mt-4 max-h-56 space-y-2 overflow-auto pr-1 l2-subtle-scrollbar">
          {status.map((item, idx) => (
            <div
              key={item.account.toBase58()}
              className="flex flex-col gap-2 rounded-xl border border-white/6 bg-white/[0.02] p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  {idx === 0 ? 'UserState' : `UserBalance #${idx}`}
                </p>
                <p className="mt-1 font-mono text-xs text-zinc-300">
                  {truncateAddress(item.account.toBase58(), 12, 12)}
                </p>
              </div>
              <Pill tone={item.isDelegated ? 'green' : 'default'}>
                {item.isDelegated ? 'Delegated' : 'L1'}
              </Pill>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-white/6 bg-white/[0.02] p-3">
        <p className="text-xs text-zinc-400">
          Delegation detection checks whether each account owner equals the MagicBlock delegation program. If delegation requests are event-based, status updates depend on the MagicBlock indexer/validator applying changes.
        </p>
      </div>
    </div>
  );

  if (embedded) return body;
  return <GlassPanel>{body}</GlassPanel>;
}
