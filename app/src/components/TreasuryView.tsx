'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWalletContext } from '@/contexts/WalletContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { env } from '@/utils/env';
import { BalanceList } from '@/components/BalanceList';
import { ActivityFeed } from '@/components/ActivityFeed';
import { FundModal } from '@/components/FundModal';
import { UserStatus } from '@/components/UserStatus';
import {
  GlassPanel,
  LuxuryButton,
  Pill,
  SectionHeader,
  truncateAddress,
} from '@/components/ui/luxury';
import toast from 'react-hot-toast';

export function TreasuryView() {
  const { sdk, solanaSdk } = useWalletContext();
  const { publicKey, connected } = useWallet();
  const [isDelegated, setIsDelegated] = useState(false);
  const [isLoadingDelegate, setIsLoadingDelegate] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);
  const [totalValue, setTotalValue] = useState<string>('—');

  const checkDelegation = useCallback(async () => {
    if (!solanaSdk || !publicKey) {
      setIsDelegated(false);
      return;
    }
    try {
      const status = await solanaSdk.getDelegationStatus(publicKey, []);
      const userStateDel = status.find((s) =>
        s.account.equals(solanaSdk.pda.deriveUserState(publicKey)[0])
      );
      setIsDelegated(!!userStateDel?.isDelegated);
    } catch {
      setIsDelegated(false);
    }
  }, [solanaSdk, publicKey]);

  useEffect(() => {
    checkDelegation();
  }, [checkDelegation]);

  // Compute total value from balances (best effort)
  const refreshTotalValue = useCallback(async () => {
    if (!sdk || !publicKey) {
      setTotalValue('—');
      return;
    }
    try {
      const balances = await sdk.getAllUserBalances(publicKey);
      let total = 0;
      for (const b of balances) {
        total += Number(b.account.amount.toString());
      }
      // Normalize to a readable string — we don't know each mint's decimals,
      // so show raw lamports with a note.
      setTotalValue(total.toLocaleString());
    } catch {
      setTotalValue('—');
    }
  }, [sdk, publicKey]);

  useEffect(() => {
    refreshTotalValue();
  }, [refreshTotalValue]);

  const handleDelegate = async () => {
    const l1Sdk = solanaSdk || sdk;
    if (!l1Sdk || !publicKey) return;

    setIsLoadingDelegate(true);
    try {
      // Get all user mints
      const balances = await l1Sdk.getAllUserBalances(publicKey);
      const mints = balances.map((b: any) => b.account.mint as PublicKey);
      const uniqueMints = [...new Map(mints.map((m) => [m.toBase58(), m])).values()];

      if (uniqueMints.length === 0) {
        toast.error('No balances to delegate. Add a mint first.');
        setIsLoadingDelegate(false);
        return;
      }

      const result = await l1Sdk.delegate({ mintList: uniqueMints });
      toast.success('Delegation requested (commit every 60s). Waiting for MagicBlock state update...');
      console.log('Delegate transaction:', result.signature);

      const ok = await l1Sdk.waitForDelegationStatus(publicKey, uniqueMints, true, {
        timeoutMs: 90_000,
        pollIntervalMs: 2_000,
      });

      if (!ok) {
        throw new Error('Timed out waiting for delegation status change.');
      }

      toast.success('Delegation successful — private mode active');
      setIsDelegated(true);

      // Auto-open session after delegation
      const perMockUrl = env.PER_MOCK_URL;
      if (perMockUrl && sdk) {
        try {
          await sdk.openSession(perMockUrl, 3600);
          toast.success('PER session auto-opened');
        } catch (sessionErr: any) {
          console.warn('Auto session open failed:', sessionErr);
          toast('Delegation complete. Tap 🔒 to unlock private balances.');
        }
      }
    } catch (error: any) {
      console.error('Delegation error:', error);
      toast.error(error.message || 'Delegation failed');
    } finally {
      setIsLoadingDelegate(false);
    }
  };

  const handleCommitUndelegate = async () => {
    const l1Sdk = solanaSdk || sdk;
    if (!l1Sdk || !publicKey) return;

    setIsLoadingDelegate(true);
    try {
      const balances = await l1Sdk.getAllUserBalances(publicKey);
      const mints = balances.map((b: any) => b.account.mint as PublicKey);
      const uniqueMints = [...new Map(mints.map((m) => [m.toBase58(), m])).values()];

      if (uniqueMints.length === 0) {
        toast.error('No balances to commit/undelegate.');
        setIsLoadingDelegate(false);
        return;
      }

      // Close session first
      if (sdk) {
        sdk.closeSession();
      }

      const result = await l1Sdk.commitAndUndelegate({ mintList: uniqueMints });
      toast.success('Commit/undelegate requested. Waiting for L1 state...');
      console.log('Commit transaction:', result.signature);

      const ok = await l1Sdk.waitForDelegationStatus(publicKey, uniqueMints, false, {
        timeoutMs: 90_000,
        pollIntervalMs: 2_000,
      });

      if (!ok) {
        throw new Error('Timed out waiting for commit/undelegate to finalize.');
      }

      toast.success('Commit/undelegate successful — L1 mode active');
      setIsDelegated(false);
    } catch (error: any) {
      console.error('Commit error:', error);
      toast.error(error.message || 'Commit/undelegate failed');
    } finally {
      setIsLoadingDelegate(false);
    }
  };

  if (!connected) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-white">Connect your wallet to open the treasury.</p>
          <p className="mt-2 text-sm text-zinc-500">
            The Sable console requires a Solana wallet to read balances, manage agents, and interact with tasks.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <GlassPanel className="p-6 md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Treasury Overview</p>
              {isDelegated ? (
                <Pill tone="green">🔒 Private Mode</Pill>
              ) : (
                <Pill>L1 Mode</Pill>
              )}
            </div>
            <h1 className="mt-2 text-2xl text-white md:text-3xl">
              {publicKey ? truncateAddress(publicKey.toBase58(), 8, 6) : '—'}
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Total value: <span className="font-mono text-zinc-200">{totalValue}</span> raw lamports
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <LuxuryButton
              variant="secondary"
              onClick={() => setShowFundModal(true)}
              className="px-4 py-2"
            >
              Fund with USDC
            </LuxuryButton>
            {isDelegated ? (
              <LuxuryButton
                variant="secondary"
                onClick={handleCommitUndelegate}
                isLoading={isLoadingDelegate}
                className="px-4 py-2"
              >
                Commit & Undelegate
              </LuxuryButton>
            ) : (
              <LuxuryButton
                onClick={handleDelegate}
                isLoading={isLoadingDelegate}
                className="px-4 py-2"
              >
                Delegate to Private Mode
              </LuxuryButton>
            )}
          </div>
        </div>
      </GlassPanel>

      {/* Main grid */}
      <div className="grid flex-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-4">
          <UserStatus />
          <BalanceList />
        </div>

        <div className="space-y-6 lg:col-span-8">
          <ActivityFeed />
        </div>
      </div>

      <FundModal
        isOpen={showFundModal}
        onClose={() => setShowFundModal(false)}
        onComplete={() => {
          refreshTotalValue();
        }}
      />
    </div>
  );
}
