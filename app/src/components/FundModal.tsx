'use client';

import { useState } from 'react';
import { useWalletContext } from '@/contexts/WalletContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import {
  GlassPanel,
  LuxuryButton,
  LuxuryInput,
  Pill,
  SectionHeader,
} from '@/components/ui/luxury';
import toast from 'react-hot-toast';

interface FundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

export function FundModal({ isOpen, onClose, onComplete }: FundModalProps) {
  const { sdk } = useWalletContext();
  const { publicKey } = useWallet();
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [amlStatus, setAmlStatus] = useState<'idle' | 'checking' | 'ok' | 'rejected'>('idle');
  const [amlReason, setAmlReason] = useState<string>('');

  const handleAmlCheck = async () => {
    if (!sdk || !publicKey) return;
    setAmlStatus('checking');
    try {
      await sdk.payments.aml.screen({ address: publicKey.toBase58() });
      setAmlStatus('ok');
      toast.success('AML screening passed');
    } catch (error: any) {
      setAmlStatus('rejected');
      const reason = error?.reason || error?.message || 'Address blocked by compliance screening';
      setAmlReason(reason);
      toast.error(`AML screening failed: ${reason}`);
    }
  };

  const handleFund = async () => {
    if (!sdk || !publicKey || !amount.trim()) return;

    setIsLoading(true);
    try {
      // Re-check AML if not already passed
      if (amlStatus !== 'ok') {
        try {
          await sdk.payments.aml.screen({ address: publicKey.toBase58() });
          setAmlStatus('ok');
        } catch (error: any) {
          const reason = error?.reason || error?.message || 'Address blocked by compliance screening';
          toast.error(`AML screening failed: ${reason}`);
          setAmlStatus('rejected');
          setAmlReason(reason);
          setIsLoading(false);
          return;
        }
      }

      const lamports = Math.floor(parseFloat(amount) * 1e6); // USDC has 6 decimals
      if (!Number.isFinite(lamports) || lamports <= 0) {
        throw new Error('Invalid amount');
      }

      // Build deposit tx via Private Payments API
      const { tx, payload } = await sdk.payments.buildDepositPayload({
        from: publicKey,
        amount: new BN(lamports),
      });

      // Sign the transaction
      const signed = await sdk.config.wallet!.signTransaction(tx as any);

      // Submit via the correct route (base or ephemeral)
      const result = await sdk.payments.submit(signed, payload, sdk.config.connection);
      toast.success(`Funded ${amount} USDC successfully`);
      console.log('Fund transaction:', result.signature, 'routed to:', result.sendTo);
      setAmount('');
      setAmlStatus('idle');
      onComplete?.();
      onClose();
    } catch (error: any) {
      console.error('Fund error:', error);
      toast.error(error.message || 'Fund failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-xl" onClick={onClose} />
      <GlassPanel className="relative w-full max-w-lg p-6 md:p-8" highlight>
        <SectionHeader
          eyebrow="Treasury Funding"
          title="Fund with USDC"
          subtitle="Deposit USDC into your treasury via the Private Payments API."
          action={
            <LuxuryButton variant="ghost" className="px-3 py-2" onClick={onClose}>
              Close
            </LuxuryButton>
          }
        />

        <div className="mt-6 space-y-4">
          {amlStatus === 'rejected' ? (
            <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4">
              <div className="flex items-center gap-2">
                <Pill tone="red">AML Rejected</Pill>
              </div>
              <p className="mt-2 text-sm text-rose-100">{amlReason}</p>
              <p className="mt-2 text-xs text-rose-200/60">
                This address is blocked by compliance screening. You cannot proceed with funding.
              </p>
            </div>
          ) : null}

          <LuxuryInput
            label="Amount (USDC)"
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              if (amlStatus === 'ok') setAmlStatus('idle');
            }}
            className="text-lg"
          />

          <div className="rounded-2xl border border-white/8 bg-black/35 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Compliance</p>
            <div className="mt-3 flex items-center gap-3">
              <Pill tone={amlStatus === 'ok' ? 'green' : amlStatus === 'rejected' ? 'red' : 'default'}>
                {amlStatus === 'idle' && 'Not Checked'}
                {amlStatus === 'checking' && 'Checking...'}
                {amlStatus === 'ok' && 'Passed'}
                {amlStatus === 'rejected' && 'Rejected'}
              </Pill>
              {amlStatus !== 'ok' && amlStatus !== 'rejected' ? (
                <LuxuryButton
                  variant="secondary"
                  className="px-4 py-2"
                  onClick={handleAmlCheck}
                  isLoading={amlStatus === 'checking'}
                >
                  Run AML Screen
                </LuxuryButton>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/35 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Summary</p>
            <div className="mt-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Amount</span>
                <span className="text-white">{amount || '0'} USDC</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Destination</span>
                <span className="text-zinc-300">Treasury ledger balance</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <LuxuryButton variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </LuxuryButton>
          <LuxuryButton
            onClick={handleFund}
            isLoading={isLoading}
            disabled={!amount.trim() || amlStatus === 'rejected'}
          >
            Authorize Deposit
          </LuxuryButton>
        </div>
      </GlassPanel>
    </div>
  );
}
