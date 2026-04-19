'use client';

import { WalletConnect } from '@/components/WalletConnect';
import { UserStatus } from '@/components/UserStatus';
import { BalanceList } from '@/components/BalanceList';
import { ActionPanel } from '@/components/ActionPanel';
import { GlassPanel, LuxuryButton, Pill } from '@/components/ui/luxury';
import { useWallet } from '@solana/wallet-adapter-react';

export default function Home() {
  const { connected } = useWallet();

  return (
    <main className="l2-shell">
      <div className="l2-grid-overlay" />
      <div className="l2-noise-overlay" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-4 py-6 md:px-8 lg:px-12">
        <WalletConnect />

        {connected ? (
          <div className="mt-6 grid flex-1 gap-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-4">
              <UserStatus />
              <BalanceList />
            </div>

            <div className="lg:col-span-8">
              <ActionPanel />
            </div>
          </div>
        ) : (
          <DisconnectedHero />
        )}
      </div>
    </main>
  );
}

function DisconnectedHero() {
  return (
    <div className="mt-6 grid flex-1 items-start gap-6 lg:grid-cols-12">
      <GlassPanel className="p-8 lg:col-span-7 lg:p-10" highlight>
        <p className="text-[10px] uppercase tracking-[0.3em] text-amber-200/70">
          Sable
        </p>
        <h2 className="mt-4 text-4xl leading-tight text-white md:text-5xl">
          Vault + Ledger Wallet
          <br />
          with MagicBlock ER Routing
        </h2>
        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-zinc-400 md:text-base">
          Connect a Solana wallet to initialize your UserState PDA, manage per-mint ledger balances,
          and route transfers across MagicBlock ER with automatic L1 fallback for non-delegated recipients.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Pill tone="amber">Internal ledger transfers</Pill>
          <Pill>Vault custody via PDA ATA</Pill>
          <Pill>Commit / Undelegate before withdraw</Pill>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <PreviewMetric label="Setup" value="Join + Complete" />
          <PreviewMetric label="Batch Send" value="Chunked" />
          <PreviewMetric label="Fallback" value="L1 Vault Send" />
        </div>
      </GlassPanel>

      <GlassPanel className="p-6 lg:col-span-5">
        <h3 className="text-2xl text-white">Execution Flow</h3>
        <p className="mt-2 text-sm text-zinc-400">
          Once connected, this interface exposes the full operational console for deposit, transfer,
          withdraw, and delegation management using the live SDK methods.
        </p>

        <div className="mt-6 space-y-3">
          {[
            'Join / Complete Setup (wSOL default)',
            'Add mint balance PDAs',
            'Deposit into vault and credit ledger',
            'Transfer internally on ER (fast path)',
            'Fallback to L1 vault send when recipients are not delegated',
            'Commit / undelegate before withdrawals',
          ].map((step, idx) => (
            <div
              key={step}
              className="flex items-start gap-3 rounded-xl border border-white/6 bg-white/[0.02] p-3"
            >
              <div className="mt-0.5 grid h-5 w-5 place-items-center rounded-full border border-amber-300/25 text-[10px] text-amber-100">
                {idx + 1}
              </div>
              <p className="text-sm text-zinc-300">{step}</p>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <LuxuryButton variant="secondary" className="w-full">
            Connect Wallet Above
          </LuxuryButton>
        </div>
      </GlassPanel>
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/30 p-4">
      <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      <p className="mt-2 text-lg text-white">{value}</p>
    </div>
  );
}
