'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWalletContext } from '@/contexts/WalletContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { WSOL_MINT } from '@sable/sdk';
import { env } from '@/utils/env';
import {
  GlassPanel,
  LuxuryButton,
  LuxuryInput,
  Pill,
  SectionHeader,
  truncateAddress,
} from '@/components/ui/luxury';
import toast from 'react-hot-toast';

interface BalanceInfo {
  pubkey?: PublicKey;
  mint: PublicKey;
  amount: string;
  version: string;
  isWsol: boolean;
  isDelegated?: boolean;
  isPrivate?: boolean;
}

export function BalanceList() {
  const { sdk, solanaSdk } = useWalletContext();
  const { publicKey } = useWallet();
  const [balances, setBalances] = useState<BalanceInfo[]>([]);
  const [newMint, setNewMint] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const fetchBalances = useCallback(async () => {
    if (!sdk || !publicKey) return;

    setIsRefreshing(true);
    try {
      const allBalances = await sdk.getAllUserBalances(publicKey);
      const baseList: BalanceInfo[] = allBalances.map((b: any) => ({
        pubkey: b.publicKey,
        mint: b.account.mint,
        amount: b.account.amount.toString(),
        version: b.account.version.toString(),
        isWsol: b.account.mint.toBase58() === WSOL_MINT.toBase58(),
      }));

      if (solanaSdk) {
        const delegatedFlags = await Promise.all(
          baseList.map(async (row) => {
            if (!row.pubkey) return false;
            try {
              return await solanaSdk.isDelegated(row.pubkey);
            } catch {
              return false;
            }
          })
        );

        baseList.forEach((row, idx) => {
          row.isDelegated = delegatedFlags[idx];
        });
      }

      // For delegated balances, try to read via session if available
      if (sdk.session) {
        for (const row of baseList) {
          if (row.isDelegated && row.pubkey) {
            try {
              const sessionAmount = await sdk.session.getBalance(row.pubkey);
              row.amount = sessionAmount.toString();
              row.isPrivate = false;
            } catch (err: any) {
              if (err.name === 'SessionExpiredError') {
                row.isPrivate = true;
              } else {
                row.isPrivate = true;
              }
            }
          } else if (row.isDelegated && !sdk.session) {
            row.isPrivate = true;
          }
        }
      } else {
        baseList.forEach((row) => {
          if (row.isDelegated) row.isPrivate = true;
        });
      }

      baseList.sort((a, b) => {
        if (a.isWsol && !b.isWsol) return -1;
        if (!a.isWsol && b.isWsol) return 1;
        return a.mint.toBase58().localeCompare(b.mint.toBase58());
      });

      setBalances(baseList);
    } catch (error) {
      console.error('Error fetching balances:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [sdk, solanaSdk, publicKey]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  const handleAddMint = async () => {
    if (!sdk || !newMint.trim()) return;

    setIsLoading(true);
    try {
      const mintPubkey = new PublicKey(newMint.trim());
      const result = await sdk.addMint(mintPubkey);
      toast.success('Mint added successfully');
      console.log('Add mint transaction:', result.signature);
      setNewMint('');
      await fetchBalances();
    } catch (error: any) {
      console.error('Add mint error:', error);
      toast.error(error.message || 'Failed to add mint');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnlock = async (balancePda: PublicKey) => {
    if (!sdk || !publicKey) return;

    const perHttpUrl = env.PER_HTTP_URL;
    if (!perHttpUrl) {
      toast.error('PER HTTP URL not configured. Set NEXT_PUBLIC_SABLE_PER_HTTP.');
      return;
    }

    setIsUnlocking(true);
    try {
      await sdk.openSession(perHttpUrl, 3600);
      toast.success('Session opened — private balances unlocked');
      await fetchBalances();
    } catch (error: any) {
      console.error('Session open error:', error);
      toast.error(error.message || 'Failed to open PER session');
    } finally {
      setIsUnlocking(false);
    }
  };

  const formatAmount = (amount: string, decimals = 9) => {
    const raw = Number(amount);
    if (!Number.isFinite(raw)) return amount;
    return (raw / Math.pow(10, decimals)).toLocaleString(undefined, {
      maximumFractionDigits: 9,
    });
  };

  const getMintDecimals = (mint: PublicKey) => {
    // Common devnet mints — expand as needed
    const usdcDevnet = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
    if (mint.toBase58() === usdcDevnet) return 6;
    return 9; // Default to 9 (wSOL, most SPL)
  };

  return (
    <GlassPanel className="p-6 md:p-7">
      <SectionHeader
        eyebrow="Treasury"
        title="Your Treasury"
        subtitle="Per-mint balance PDAs under your UserState. Balances are private when delegated to PER."
        action={
          <LuxuryButton
            variant="secondary"
            className="px-4 py-2"
            onClick={() => fetchBalances()}
            isLoading={isRefreshing}
          >
            Refresh
          </LuxuryButton>
        }
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <SummaryChip label="Assets" value={String(balances.length)} />
        <SummaryChip
          label="wSOL Ready"
          value={balances.some((b) => b.isWsol) ? 'Yes' : 'No'}
          tone={balances.some((b) => b.isWsol) ? 'green' : 'amber'}
        />
        <SummaryChip
          label="Private Balances"
          value={String(balances.filter((b) => b.isDelegated).length)}
          tone="amber"
        />
      </div>

      <div className="mt-6 rounded-2xl border border-white/8 bg-black/30 p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <LuxuryInput
            label="Add Mint"
            placeholder="Enter mint address"
            value={newMint}
            onChange={(e) => setNewMint(e.target.value)}
          />
          <div className="flex items-end">
            <LuxuryButton
              fullWidth
              onClick={handleAddMint}
              isLoading={isLoading}
              disabled={!newMint.trim()}
              className="sm:min-w-[180px]"
            >
              Add Mint
            </LuxuryButton>
          </div>
        </div>
      </div>

      <div className="mt-6">
        {balances.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-black/30 p-5">
            <p className="text-sm text-zinc-300">No treasury balances found yet.</p>
            <p className="mt-2 text-xs text-zinc-500">
              Create your treasury to initialize the default wSOL balance PDA, then add additional mints as needed.
            </p>
          </div>
        ) : (
          <div className="max-h-[420px] space-y-2 overflow-auto pr-1 sable-subtle-scrollbar">
            {balances.map((balance) => (
              <div
                key={balance.mint.toBase58()}
                className="group rounded-2xl border border-white/6 bg-white/[0.02] p-4 transition hover:border-white/12 hover:bg-white/[0.035]"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-sm text-zinc-100">
                        {truncateAddress(balance.mint.toBase58(), 10, 10)}
                      </p>
                      {balance.isWsol ? <Pill tone="amber">wSOL Default</Pill> : null}
                      {typeof balance.isDelegated === 'boolean' ? (
                        <Pill tone={balance.isDelegated ? 'green' : 'default'}>
                          {balance.isDelegated ? 'Delegated' : 'L1'}
                        </Pill>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      Ledger version{' '}
                      <span className="font-mono text-zinc-400">{balance.version}</span>
                    </p>
                  </div>

                  <div className="text-left sm:text-right">
                    {balance.isPrivate ? (
                      <button
                        type="button"
                        onClick={() => balance.pubkey && handleUnlock(balance.pubkey)}
                        disabled={isUnlocking}
                        className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/5 px-3 py-1.5 text-sm text-amber-100 transition hover:bg-amber-300/10 disabled:opacity-50"
                      >
                        <span>🔒</span>
                        <span>Tap to unlock</span>
                      </button>
                    ) : (
                      <>
                        <p className="text-lg text-white">
                          {formatAmount(balance.amount, getMintDecimals(balance.mint))}
                        </p>
                        <p className="font-mono text-xs text-zinc-500">{balance.amount} raw</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </GlassPanel>
  );
}

function SummaryChip({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'green' | 'amber';
}) {
  const toneClasses =
    tone === 'green'
      ? 'border-emerald-300/10 bg-emerald-300/5'
      : tone === 'amber'
      ? 'border-amber-300/10 bg-amber-300/5'
      : 'border-white/8 bg-white/[0.02]';

  return (
    <div className={`rounded-2xl border p-4 ${toneClasses}`}>
      <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      <p className="mt-2 text-lg text-white">{value}</p>
    </div>
  );
}
