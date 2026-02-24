'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWalletContext } from '@/contexts/WalletContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { WSOL_MINT } from '@l2conceptv1/sdk';
import toast from 'react-hot-toast';

interface BalanceInfo {
  mint: PublicKey;
  amount: string;
  version: string;
  isWsol: boolean;
}

export function BalanceList() {
  const { sdk } = useWalletContext();
  const { publicKey } = useWallet();
  const [balances, setBalances] = useState<BalanceInfo[]>([]);
  const [newMint, setNewMint] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const fetchBalances = useCallback(async () => {
    if (!sdk || !publicKey) return;

    try {
      const allBalances = await sdk.getAllUserBalances(publicKey);
      const formatted = allBalances.map((b: any) => ({
        mint: b.account.mint,
        amount: b.account.amount.toString(),
        version: b.account.version.toString(),
        isWsol: b.account.mint.toBase58() === WSOL_MINT.toBase58(),
      }));
      
      // Sort: wSOL first, then others
      formatted.sort((a: BalanceInfo, b: BalanceInfo) => {
        if (a.isWsol && !b.isWsol) return -1;
        if (!a.isWsol && b.isWsol) return 1;
        return 0;
      });
      
      setBalances(formatted);
    } catch (error) {
      console.error('Error fetching balances:', error);
    }
  }, [sdk, publicKey]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  const handleAddMint = async () => {
    if (!sdk || !newMint.trim()) return;

    setIsLoading(true);
    try {
      const mintPubkey = new PublicKey(newMint.trim());
      const result = await sdk.addMint(mintPubkey);
      toast.success('Mint added successfully!');
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

  const formatAmount = (amount: string, decimals: number = 9) => {
    const num = parseInt(amount) / Math.pow(10, decimals);
    return num.toLocaleString(undefined, { maximumFractionDigits: decimals });
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">Balances</h2>

      <div className="mb-4 flex gap-2">
        <input
          type="text"
          placeholder="Enter mint address..."
          value={newMint}
          onChange={(e) => setNewMint(e.target.value)}
          className="flex-1 px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500"
        />
        <button
          onClick={handleAddMint}
          disabled={isLoading || !newMint.trim()}
          className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
        >
          {isLoading ? 'Adding...' : 'Add Mint'}
        </button>
      </div>

      {balances.length === 0 ? (
        <div className="space-y-2">
          <p className="text-gray-500">No balances yet.</p>
          <p className="text-sm text-yellow-600">
            ⚠️ wSOL balance not found. Complete setup to enable wSOL support.
          </p>
        </div>
      ) : !balances.some(b => b.isWsol) ? (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-sm text-yellow-800">
            ⚠️ wSOL not set up. Complete setup to add wSOL balance.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-4">Mint</th>
                <th className="text-right py-2 px-4">Amount</th>
                <th className="text-right py-2 px-4">Version</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((balance, idx) => (
                <tr key={idx} className="border-b last:border-b-0">
                  <td className="py-2 px-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">
                        {balance.mint.toBase58().slice(0, 8)}...
                        {balance.mint.toBase58().slice(-8)}
                      </span>
                      {balance.isWsol && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          wSOL
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-4 text-right">
                    {formatAmount(balance.amount)}
                  </td>
                  <td className="py-2 px-4 text-right text-gray-500">
                    {balance.version}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
