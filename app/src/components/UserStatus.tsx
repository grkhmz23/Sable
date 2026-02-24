'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWalletContext } from '@/contexts/WalletContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { WSOL_MINT } from '@l2conceptv1/sdk';
import { CompleteSetupModal } from './CompleteSetupModal';
import toast from 'react-hot-toast';

export function UserStatus() {
  const { sdk } = useWalletContext();
  const { publicKey } = useWallet();
  const [hasJoined, setHasJoined] = useState<boolean | null>(null);
  const [hasWsolBalance, setHasWsolBalance] = useState<boolean | null>(null);
  const [userState, setUserState] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [setupStep, setSetupStep] = useState<'not_joined' | 'joined_no_wsol' | 'completed'>('not_joined');
  const [showSetupModal, setShowSetupModal] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!sdk || !publicKey) return;

    try {
      const state = await sdk.getUserState(publicKey);
      setHasJoined(!!state);
      setUserState(state);

      if (state) {
        // Check if wSOL balance exists
        const wsolBalance = await sdk.getUserBalance(publicKey, WSOL_MINT);
        setHasWsolBalance(!!wsolBalance);

        if (wsolBalance) {
          setSetupStep('completed');
        } else {
          setSetupStep('joined_no_wsol');
        }
      } else {
        setSetupStep('not_joined');
        setHasWsolBalance(false);
      }
    } catch (error) {
      console.error('Error checking user status:', error);
      setHasJoined(false);
      setHasWsolBalance(false);
      setSetupStep('not_joined');
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

  const handleQuickSetup = async () => {
    if (!sdk) return;
    setIsLoading(true);

    try {
      const result = await sdk.completeSetup([]);
      toast.success('Setup complete! wSOL balance created.');
      console.log('Complete setup transaction:', result.signature);
      await checkStatus();
    } catch (error: any) {
      console.error('Complete setup error:', error);
      toast.error(error.message || 'Failed to complete setup');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4">User Status</h2>

        {hasJoined === null ? (
          <p className="text-gray-500">Checking status...</p>
        ) : setupStep === 'completed' ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Setup Complete
              </span>
              <span className="text-xs text-gray-500">(wSOL included)</span>
            </div>
            {userState && (
              <div className="text-sm text-gray-600">
                <p>State Version: {userState.stateVersion.toString()}</p>
                <p>Owner: {userState.owner.toBase58().slice(0, 8)}...</p>
              </div>
            )}
          </div>
        ) : setupStep === 'joined_no_wsol' ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                Partially Setup
              </span>
            </div>
            <p className="text-gray-600">
              You&apos;ve joined but need to complete setup to create your wSOL balance.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSetupModal(true)}
                disabled={isLoading}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Completing...' : 'Complete Setup with Mints'}
              </button>
              <button
                onClick={handleQuickSetup}
                disabled={isLoading}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Setting up...' : 'Quick Setup (wSOL only)'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-gray-600">
              You haven&apos;t joined yet. Complete setup to create your account with wSOL support.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleJoin}
                disabled={isLoading}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Joining...' : 'Join Only'}
              </button>
              <button
                onClick={() => setShowSetupModal(true)}
                disabled={isLoading}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Setting up...' : 'Complete Setup with Mints'}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              &quot;Complete Setup&quot; creates your account with wSOL + optional additional tokens in one step.
            </p>
          </div>
        )}
      </div>

      <CompleteSetupModal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        onComplete={checkStatus}
      />
    </>
  );
}
