'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton, useWalletContext } from '@/contexts/WalletContext';
import { Pill, truncateAddress } from '@/components/ui/luxury';

export function AppHeader() {
  const { connected, publicKey } = useWallet();
  const { routingMode, setRoutingMode } = useWalletContext();

  return (
    <header className="flex items-center justify-between gap-4 px-6 py-4 lg:px-8">
      <div className="lg:hidden">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg border border-[rgba(214,190,112,0.3)] bg-[radial-gradient(circle,rgba(252,246,186,0.12),transparent_70%)]">
            <span className="text-xs font-semibold tracking-[0.2em] text-amber-100">S</span>
          </div>
          <span className="text-sm text-white">Sable</span>
        </div>
      </div>

      <div className="hidden items-center gap-3 lg:flex">
        {/* Routing mode toggle */}
        <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] p-0.5">
          <button
            onClick={() => setRoutingMode('solana')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              routingMode === 'solana'
                ? 'bg-white/10 text-amber-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Use Solana base layer RPC"
          >
            L1
          </button>
          <button
            onClick={() => setRoutingMode('er')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              routingMode === 'er'
                ? 'bg-white/10 text-amber-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Use Magic Router (auto-routes to ER validator)"
          >
            ER
          </button>
        </div>
        {routingMode === 'er' && (
          <span className="text-[10px] text-zinc-500">Magic Router</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Pill tone="amber">Devnet</Pill>
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
    </header>
  );
}
