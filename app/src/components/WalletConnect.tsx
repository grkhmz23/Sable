'use client';

import { WalletMultiButton, useWalletContext } from '@/contexts/WalletContext';
import { GlassPanel, Pill, cn, truncateAddress } from '@/components/ui/luxury';
import { useWallet } from '@solana/wallet-adapter-react';

const ROUTES = [
  { id: 'solana', label: 'Solana L1' },
  { id: 'er', label: 'MagicBlock ER' },
  { id: 'router', label: 'Magic Router' },
] as const;

export function WalletConnect() {
  const { connected, publicKey } = useWallet();
  const { routingMode, setRoutingMode } = useWalletContext();

  return (
    <div className="space-y-4">
      <GlassPanel className="px-4 py-4 md:px-6 md:py-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="relative grid h-10 w-10 place-items-center rounded-full border border-[rgba(214,190,112,0.25)] bg-[radial-gradient(circle,rgba(252,246,186,0.16),rgba(0,0,0,0))]">
              <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(191,149,63,0.15),transparent_70%)] blur-md" />
              <span className="relative text-sm tracking-[0.3em] text-amber-100">L2</span>
            </div>
            <div>
              <h1 className="text-lg text-white md:text-xl">L2Concept</h1>
              <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">
                Wealth Operations
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:items-end">
            {connected && (
              <div className="rounded-full border border-white/10 bg-black/40 p-1">
                <div className="flex flex-wrap items-center gap-1">
                  {ROUTES.map((route) => {
                    const active = routingMode === route.id;
                    return (
                      <button
                        key={route.id}
                        type="button"
                        onClick={() => setRoutingMode(route.id)}
                        className={cn(
                          'relative rounded-full px-3 py-2 text-[10px] uppercase tracking-[0.18em] transition',
                          active ? 'text-black' : 'text-zinc-400 hover:text-zinc-100'
                        )}
                      >
                        {active ? (
                          <span className="absolute inset-0 rounded-full bg-[linear-gradient(90deg,#BF953F_0%,#FCF6BA_50%,#B38728_100%)] shadow-[0_0_18px_rgba(191,149,63,0.18)]" />
                        ) : null}
                        <span className="relative z-10">{route.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {connected && publicKey ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2">
                  <span className="h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_10px_rgba(252,246,186,0.6)]" />
                  <span className="font-mono text-xs text-zinc-300">
                    {truncateAddress(publicKey.toBase58(), 10, 8)}
                  </span>
                </div>
              ) : null}
              <WalletMultiButton className="!h-auto !rounded-full !border !border-white/12 !bg-white/5 !px-4 !py-2 !text-xs !font-medium !text-zinc-100 hover:!bg-white/10" />
            </div>
          </div>
        </div>
      </GlassPanel>

      {routingMode === 'er' ? (
        <GlassPanel className="px-4 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-zinc-200">
                MagicBlock ER mode is active. Delegate your `UserState` + mint balances before fast internal routing.
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Mixed recipient sets will automatically split into ER internal transfers and L1 vault fallback sends.
              </p>
            </div>
            <Pill tone="amber">Delegation Required</Pill>
          </div>
        </GlassPanel>
      ) : null}

      {routingMode === 'router' ? (
        <GlassPanel className="px-4 py-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-zinc-300">
              Magic Router mode is a UI placeholder in this build. Requests still use the selected RPC connection behavior from the current app logic.
            </p>
            <Pill>Placeholder</Pill>
          </div>
        </GlassPanel>
      ) : null}
    </div>
  );
}
