'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWalletContext } from '@/contexts/WalletContext';
import { useWallet } from '@solana/wallet-adapter-react';
import toast from 'react-hot-toast';

export function UserStatus() {
  const { sdk } = useWalletContext();
  const { publicKey } = useWallet();
  const [hasJoined, setHasJoined] = useState<boolean | null>(null);
  const [userState, setUserState] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!sdk || !publicKey) return;
    
    try {
      const state = await sdk.getUserState(publicKey);
      setHasJoined(!!state);
      setUserState(state);
    } catch (error) {
      console.error('Error checking user status:', error);
      setHasJoined(false);
    }
  }, [sdk, publicKey]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleJoin = async () => {
    if (!sdk) return;
    setIsLoading(true);
    
    try {
      const result = await sdk.join();
      toast.success('Successfully joined!');
      console.log('Join transaction:', result.signature);
      await checkStatus();
    } catch (error: any) {
      console.error('Join error:', error);
      toast.error(error.message || 'Failed to join');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">User Status</h2>

      {hasJoined === null ? (
        <p className="text-gray-500">Checking status...</p>
      ) : hasJoined ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              Joined
            </span>
          </div>
          {userState && (
            <div className="text-sm text-gray-600">
              <p>State Version: {userState.stateVersion.toString()}</p>
              <p>Owner: {userState.owner.toBase58().slice(0, 8)}...</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-gray-600">
            You haven&apos;t joined yet. Join to start using the vault.
          </p>
          <button
            onClick={handleJoin}
            disabled={isLoading}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Joining...' : 'Join'}
          </button>
        </div>
      )}
    </div>
  );
}
