'use client';

import { useState } from 'react';
import { useWalletContext } from '@/contexts/WalletContext';
import { WSOL_MINT } from '@l2conceptv1/sdk';
import toast from 'react-hot-toast';

interface CompleteSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function CompleteSetupModal({ isOpen, onClose, onComplete }: CompleteSetupModalProps) {
  const { sdk } = useWalletContext();
  const [mintInput, setMintInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [parsedMints, setParsedMints] = useState<string[]>([]);

  const parseMints = (input: string): string[] => {
    return input
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  };

  const handleInputChange = (value: string) => {
    setMintInput(value);
    setParsedMints(parseMints(value));
  };

  const handleSubmit = async () => {
    if (!sdk) return;

    setIsLoading(true);
    try {
      // Filter out wSOL if user added it (it's always included)
      const mints = parsedMints.filter(m => m !== WSOL_MINT.toBase58());
      
      if (mints.length > 9) {
        toast.error('Maximum 9 additional mints allowed');
        setIsLoading(false);
        return;
      }

      // Validate all mints are valid public keys
      try {
        mints.forEach(m => new (require('@solana/web3.js').PublicKey)(m));
      } catch {
        toast.error('Invalid mint address found');
        setIsLoading(false);
        return;
      }

      const result = await sdk.completeSetupWithMints(mints);
      
      toast.success(
        `Setup complete! Created ${1 + mints.length} balance account(s) including wSOL.`
      );
      console.log('Complete setup transaction:', result.signature);
      
      onComplete();
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
        <h3 className="text-xl font-semibold mb-2">Complete Setup</h3>
        
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm text-blue-800">
            <strong>wSOL is always included by default.</strong>
          </p>
          <p className="text-sm text-blue-700 mt-1">
            Add up to 9 additional token mints to track in your vault.
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">
            Additional Token Mints (optional)
          </label>
          <textarea
            value={mintInput}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Enter mint addresses, separated by commas or new lines...&#10;Example:&#10;EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&#10;Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNY"
            rows={6}
            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500 font-mono text-sm"
          />
        </div>

        {parsedMints.length > 0 && (
          <div className="mb-4 p-3 bg-gray-50 rounded-md">
            <p className="text-sm font-medium text-gray-700">
              Will create {parsedMints.length} additional balance(s) + wSOL:
            </p>
            <ul className="mt-2 space-y-1">
              <li className="text-sm flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                  wSOL
                </span>
                <span className="font-mono text-xs text-gray-500">
                  {WSOL_MINT.toBase58().slice(0, 16)}...
                </span>
              </li>
              {parsedMints.slice(0, 5).map((mint, idx) => (
                <li key={idx} className="text-sm font-mono text-gray-600 truncate">
                  {mint.slice(0, 20)}...
                </li>
              ))}
              {parsedMints.length > 5 && (
                <li className="text-sm text-gray-500">
                  ... and {parsedMints.length - 5} more
                </li>
              )}
            </ul>
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || parsedMints.length > 9}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading
              ? 'Setting up...'
              : parsedMints.length === 0
              ? 'Complete Setup (wSOL only)'
              : `Complete Setup (${1 + parsedMints.length} tokens)`}
          </button>
        </div>
      </div>
    </div>
  );
}
