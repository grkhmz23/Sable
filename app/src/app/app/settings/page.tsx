'use client';

import { GlassPanel, SectionHeader, Pill, LuxuryButton } from '@/components/ui/luxury';
import { useWalletContext } from '@/contexts/WalletContext';
import { env } from '@/utils/env';

export default function SettingsPage() {
  const { routingMode, setRoutingMode, refreshUserState } = useWalletContext();

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Configuration"
        title="Settings"
        subtitle="Connected RPC endpoints, program ID, routing mode, and app version."
      />

      <GlassPanel className="p-6">
        <div className="space-y-6">
          {/* Routing mode */}
          <div className="rounded-2xl border border-white/8 bg-black/35 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Routing Mode</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] p-0.5">
                <button
                  onClick={() => setRoutingMode('solana')}
                  className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                    routingMode === 'solana'
                      ? 'bg-white/10 text-amber-100'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Solana L1
                </button>
                <button
                  onClick={() => setRoutingMode('er')}
                  className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                    routingMode === 'er'
                      ? 'bg-white/10 text-amber-100'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  MagicBlock ER
                </button>
              </div>
              <span className="text-xs text-zinc-400">
                {routingMode === 'er'
                  ? 'Transactions auto-routed via Magic Router'
                  : 'Direct Solana base layer'}
              </span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-black/35 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Solana RPC</p>
              <p className="mt-2 font-mono text-xs text-zinc-300 break-all">{env.SOLANA_RPC_URL}</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/35 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Magic Router</p>
              <p className="mt-2 font-mono text-xs text-zinc-300 break-all">{env.MAGIC_ROUTER_URL}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-black/35 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Program ID</p>
              <p className="mt-2 font-mono text-xs text-zinc-300 break-all">{env.SABLE_PROGRAM_ID}</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/35 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">App Version</p>
              <p className="mt-2 text-xs text-zinc-300">0.1.0</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Pill>Sable Console</Pill>
            <Pill tone="amber">Devnet</Pill>
            <LuxuryButton variant="secondary" className="px-3 py-1.5 text-xs" onClick={refreshUserState}>
              Refresh State
            </LuxuryButton>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}
