'use client';

import { WalletMultiButton } from '@/contexts/WalletContext';
import { useWalletContext } from '@/contexts/WalletContext';
import { useWallet } from '@solana/wallet-adapter-react';

export function WalletConnect() {
  const { connected, publicKey } = useWallet();
  const { routingMode, setRoutingMode } = useWalletContext();

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold mb-1">Wallet Connection</h2>
          {connected && publicKey && (
            <p className="text-sm text-gray-500">
              Connected: {publicKey.toBase58().slice(0, 8)}...
              {publicKey.toBase58().slice(-8)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-4">
          {connected && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Routing:</label>
              <select
                value={routingMode}
                onChange={(e) => setRoutingMode(e.target.value as any)}
                className="px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-primary-500"
              >
                <option value="solana">Solana (L1)</option>
                <option value="er">MagicBlock ER</option>
                <option value="router">Magic Router</option>
              </select>
            </div>
          )}
          <WalletMultiButton className="!bg-primary-600 hover:!bg-primary-700" />
        </div>
      </div>

      {routingMode === 'er' && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-sm text-yellow-800">
            <strong>MagicBlock ER Mode:</strong> Accounts must be delegated to ER
            before use. Make sure to delegate your UserState and balances first.
          </p>
        </div>
      )}
    </div>
  );
}
