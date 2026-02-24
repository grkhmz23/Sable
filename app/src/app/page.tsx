'use client';

import { WalletConnect } from '@/components/WalletConnect';
import { UserStatus } from '@/components/UserStatus';
import { BalanceList } from '@/components/BalanceList';
import { ActionPanel } from '@/components/ActionPanel';
import { useWallet } from '@solana/wallet-adapter-react';

export default function Home() {
  const { connected } = useWallet();

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold mb-2">L2Concept V1</h1>
          <p className="text-gray-600">
            Vault + Ledger Wallet with MagicBlock Ephemeral Rollup
          </p>
        </header>

        <div className="grid gap-6">
          <WalletConnect />

          {connected && (
            <>
              <UserStatus />
              <BalanceList />
              <ActionPanel />
            </>
          )}

          {!connected && (
            <div className="p-8 text-center bg-gray-50 rounded-lg">
              <p className="text-gray-500">
                Connect your wallet to get started with L2Concept V1
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
