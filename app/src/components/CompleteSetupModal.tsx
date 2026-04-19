'use client';

import { useMemo, useState } from 'react';
import { useWalletContext } from '@/contexts/WalletContext';
import { PublicKey } from '@solana/web3.js';
import { WSOL_MINT } from '@sable/sdk';
import {
  GlassPanel,
  LuxuryButton,
  LuxuryTextarea,
  Pill,
  truncateAddress,
} from '@/components/ui/luxury';
import toast from 'react-hot-toast';

interface CompleteSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => Promise<void> | void;
}

export function CompleteSetupModal({
  isOpen,
  onClose,
  onComplete,
}: CompleteSetupModalProps) {
  const { sdk } = useWalletContext();
  const [mintInput, setMintInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const parsedMints = useMemo(
    () =>
      mintInput
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    [mintInput]
  );

  const filteredMints = useMemo(
    () => parsedMints.filter((m) => m !== WSOL_MINT.toBase58()),
    [parsedMints]
  );

  const duplicateCount = useMemo(() => {
    const uniq = new Set(filteredMints.map((m) => m));
    return filteredMints.length - uniq.size;
  }, [filteredMints]);

  const handleSubmit = async () => {
    if (!sdk) return;

    setIsLoading(true);
    try {
      if (filteredMints.length > 9) {
        toast.error('Maximum 9 additional mints allowed');
        return;
      }

      if (duplicateCount > 0) {
        toast.error('Duplicate mint addresses found');
        return;
      }

      try {
        filteredMints.forEach((m) => new PublicKey(m));
      } catch {
        toast.error('Invalid mint address found');
        return;
      }

      const mintPubkeys = filteredMints.map((m) => new PublicKey(m));
      const owner = sdk.walletPublicKey;
      if (!owner) {
        toast.error('Wallet not connected');
        return;
      }

      let setupTxSig: string | null = null;
      let addedCount = 0;
      let skippedCount = 0;

      const userState = await sdk.getUserState(owner);
      if (!userState) {
        // Current program supports complete_setup only as first-time initialization.
        const result = await sdk.completeSetup([]);
        setupTxSig = result.signature;
        console.log('Complete setup transaction:', result.signature);
      }

      const wsolBalance = await sdk.getUserBalance(owner, WSOL_MINT);
      if (!wsolBalance) {
        const result = await sdk.addMint(WSOL_MINT);
        if (!setupTxSig) {
          setupTxSig = result.signature;
          console.log('wSOL setup transaction:', result.signature);
        } else {
          console.log('wSOL add-mint transaction:', result.signature);
        }
      }

      for (const mint of mintPubkeys) {
        const existing = await sdk.getUserBalance(owner, mint);
        if (existing) {
          skippedCount += 1;
          continue;
        }

        const result = await sdk.addMint(mint);
        console.log('Add mint transaction:', mint.toBase58(), result.signature);
        addedCount += 1;
      }

      const totalReady = 1 + filteredMints.length; // wSOL + requested additional mints
      toast.success(
        skippedCount > 0
          ? `Setup synced. ${addedCount} mint(s) added, ${skippedCount} already existed. Total target: ${totalReady}.`
          : `Setup complete. ${addedCount} additional mint(s) added${setupTxSig ? ' and base setup initialized' : ''}.`
      );
      await onComplete();
      onClose();
    } catch (error: any) {
      console.error('Complete setup error:', error);
      toast.error(error.message || 'Failed to complete setup');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-xl" onClick={onClose} />
      <GlassPanel className="relative w-full max-w-2xl p-6 md:p-8" highlight>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-amber-200/70">
              Create Treasury
            </p>
            <h3 className="mt-2 text-2xl text-white md:text-3xl">
              Initialize Balance PDAs
            </h3>
            <p className="mt-3 text-sm text-zinc-400">
              wSOL is always included. Add up to 9 extra mint addresses to create balance PDAs in the same setup flow. Your balances are private when delegated to PER.
            </p>
          </div>
          <LuxuryButton variant="ghost" className="px-3 py-2" onClick={onClose}>
            Close
          </LuxuryButton>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/8 bg-black/35 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Default Mint</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Pill tone="amber">wSOL</Pill>
              <span className="font-mono text-xs text-zinc-400">
                {truncateAddress(WSOL_MINT.toBase58(), 14, 10)}
              </span>
            </div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-black/35 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Current Selection</p>
            <p className="mt-3 text-white">
              {1 + filteredMints.length} total balance PDA(s)
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              1 default wSOL + {filteredMints.length} additional mints
            </p>
          </div>
        </div>

        <div className="mt-6">
          <LuxuryTextarea
            label="Additional Token Mints (optional)"
            hint="comma or newline separated"
            rows={7}
            value={mintInput}
            onChange={(e) => setMintInput(e.target.value)}
            placeholder={
              'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\nEs9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
            }
            error={
              filteredMints.length > 9
                ? 'Maximum 9 additional mints allowed'
                : duplicateCount > 0
                ? 'Duplicate mint addresses detected'
                : null
            }
            className="min-h-[180px]"
          />
        </div>

        {filteredMints.length > 0 ? (
          <div className="mt-5 rounded-2xl border border-white/8 bg-black/35 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              Preview ({filteredMints.length} additional)
            </p>
            <div className="mt-3 grid gap-2">
              {filteredMints.slice(0, 6).map((mint) => (
                <div
                  key={mint}
                  className="rounded-xl border border-white/6 bg-white/[0.02] px-3 py-2 font-mono text-xs text-zinc-300"
                >
                  {truncateAddress(mint, 16, 12)}
                </div>
              ))}
              {filteredMints.length > 6 ? (
                <p className="text-xs text-zinc-500">
                  + {filteredMints.length - 6} more mint(s)
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <LuxuryButton variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </LuxuryButton>
          <LuxuryButton
            onClick={handleSubmit}
            isLoading={isLoading}
            disabled={filteredMints.length > 9 || duplicateCount > 0}
          >
            {filteredMints.length === 0
              ? 'Complete Setup (wSOL only)'
              : `Complete Setup (${1 + filteredMints.length} mints)`}
          </LuxuryButton>
        </div>
      </GlassPanel>
    </div>
  );
}
