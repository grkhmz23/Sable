'use client';

import { useState } from 'react';
import { useWalletContext } from '@/contexts/WalletContext';
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import toast from 'react-hot-toast';

export function ActionPanel() {
  const { sdk } = useWalletContext();
  const [activeTab, setActiveTab] = useState<'deposit' | 'send' | 'withdraw' | 'delegate'>('deposit');

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">Actions</h2>

      <div className="flex gap-2 mb-6 border-b">
        {(['deposit', 'send', 'withdraw', 'delegate'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 capitalize ${
              activeTab === tab
                ? 'border-b-2 border-primary-600 text-primary-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'deposit' && <DepositForm />}
      {activeTab === 'send' && <SendForm />}
      {activeTab === 'withdraw' && <WithdrawForm />}
      {activeTab === 'delegate' && <DelegateForm />}
    </div>
  );
}

function DepositForm() {
  const { sdk } = useWalletContext();
  const [mint, setMint] = useState('');
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleDeposit = async () => {
    if (!sdk || !mint.trim() || !amount.trim()) return;

    setIsLoading(true);
    try {
      const result = await sdk.deposit({
        mint: new PublicKey(mint.trim()),
        amount: new BN(parseFloat(amount) * 1e9),
      });
      toast.success('Deposit successful!');
      console.log('Deposit transaction:', result.signature);
      setAmount('');
    } catch (error: any) {
      console.error('Deposit error:', error);
      toast.error(error.message || 'Deposit failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Mint Address</label>
        <input
          type="text"
          value={mint}
          onChange={(e) => setMint(e.target.value)}
          placeholder="Enter mint address..."
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Amount</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Enter amount..."
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <button
        onClick={handleDeposit}
        disabled={isLoading || !mint.trim() || !amount.trim()}
        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
      >
        {isLoading ? 'Depositing...' : 'Deposit'}
      </button>
    </div>
  );
}

function SendForm() {
  const { sdk } = useWalletContext();
  const [mint, setMint] = useState('');
  const [recipients, setRecipients] = useState('');
  const [mode, setMode] = useState<'simple' | 'advanced'>('simple');
  const [defaultAmount, setDefaultAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!sdk || !mint.trim() || !recipients.trim()) return;

    setIsLoading(true);
    try {
      const mintPubkey = new PublicKey(mint.trim());
      
      let items;
      if (mode === 'simple') {
        const addresses = recipients.split(',').map((s) => s.trim()).filter(Boolean);
        items = addresses.map((addr) => ({
          toOwner: new PublicKey(addr),
          amount: new BN(parseFloat(defaultAmount) * 1e9),
        }));
      } else {
        items = sdk.parseBatchTransferInput(recipients, defaultAmount);
      }

      const results = await sdk.transferBatchChunked(mintPubkey, items, 15);
      toast.success(`Sent to ${items.length} recipients in ${results.length} transaction(s)`);
      setRecipients('');
    } catch (error: any) {
      console.error('Send error:', error);
      toast.error(error.message || 'Send failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <button
          onClick={() => setMode('simple')}
          className={`px-3 py-1 text-sm rounded ${
            mode === 'simple' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100'
          }`}
        >
          Simple
        </button>
        <button
          onClick={() => setMode('advanced')}
          className={`px-3 py-1 text-sm rounded ${
            mode === 'advanced' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100'
          }`}
        >
          Advanced
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Mint Address</label>
        <input
          type="text"
          value={mint}
          onChange={(e) => setMint(e.target.value)}
          placeholder="Enter mint address..."
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          {mode === 'simple' ? 'Recipient Addresses (comma-separated)' : 'Recipients (address,amount per line)'}
        </label>
        <textarea
          value={recipients}
          onChange={(e) => setRecipients(e.target.value)}
          placeholder={
            mode === 'simple'
              ? 'address1, address2, address3...'
              : 'address1,100\naddress2,200\naddress3,300'
          }
          rows={4}
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500 font-mono text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          {mode === 'simple' ? 'Amount per Recipient' : 'Default Amount (optional)'}
        </label>
        <input
          type="number"
          value={defaultAmount}
          onChange={(e) => setDefaultAmount(e.target.value)}
          placeholder="Enter amount..."
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <button
        onClick={handleSend}
        disabled={isLoading || !mint.trim() || !recipients.trim()}
        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
      >
        {isLoading ? 'Sending...' : 'Send'}
      </button>
    </div>
  );
}

function WithdrawForm() {
  const { sdk } = useWalletContext();
  const [mint, setMint] = useState('');
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleWithdraw = async () => {
    if (!sdk || !mint.trim() || !amount.trim()) return;

    setIsLoading(true);
    try {
      const result = await sdk.withdraw({
        mint: new PublicKey(mint.trim()),
        amount: new BN(parseFloat(amount) * 1e9),
        destinationAta: destination.trim() ? new PublicKey(destination.trim()) : undefined,
      });
      toast.success('Withdrawal successful!');
      console.log('Withdraw transaction:', result.signature);
      setAmount('');
    } catch (error: any) {
      console.error('Withdraw error:', error);
      if (error.message?.includes('delegated')) {
        toast.error('Account is delegated. Commit/Undelegate first before withdrawing.');
      } else {
        toast.error(error.message || 'Withdrawal failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
        <p className="text-sm text-yellow-800">
          Withdrawal is only allowed when your account is NOT delegated to ER.
          If you get an error, commit/undelegate first.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Mint Address</label>
        <input
          type="text"
          value={mint}
          onChange={(e) => setMint(e.target.value)}
          placeholder="Enter mint address..."
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Amount</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Enter amount..."
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">
          Destination ATA (optional, defaults to your ATA)
        </label>
        <input
          type="text"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="Enter destination ATA..."
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <button
        onClick={handleWithdraw}
        disabled={isLoading || !mint.trim() || !amount.trim()}
        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
      >
        {isLoading ? 'Withdrawing...' : 'Withdraw'}
      </button>
    </div>
  );
}

function DelegateForm() {
  const { sdk } = useWalletContext();
  const [mintList, setMintList] = useState('');
  const [action, setAction] = useState<'delegate' | 'commit'>('delegate');
  const [isLoading, setIsLoading] = useState(false);

  const handleAction = async () => {
    if (!sdk || !mintList.trim()) return;

    setIsLoading(true);
    try {
      const mints = mintList.split(',').map((s) => s.trim()).filter(Boolean);
      const mintPubkeys = mints.map((m) => new PublicKey(m));

      if (action === 'delegate') {
        const result = await sdk.delegate({ mintList: mintPubkeys });
        toast.success('Delegation successful!');
        console.log('Delegate transaction:', result.signature);
      } else {
        const result = await sdk.commitAndUndelegate({ mintList: mintPubkeys });
        toast.success('Commit/Undelegate successful!');
        console.log('Commit transaction:', result.signature);
      }
    } catch (error: any) {
      console.error('Delegation error:', error);
      toast.error(error.message || 'Operation failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <button
          onClick={() => setAction('delegate')}
          className={`px-3 py-1 text-sm rounded ${
            action === 'delegate' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100'
          }`}
        >
          Delegate to ER
        </button>
        <button
          onClick={() => setAction('commit')}
          className={`px-3 py-1 text-sm rounded ${
            action === 'commit' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100'
          }`}
        >
          Commit/Undelegate
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Mint List (comma-separated, max 10)
        </label>
        <textarea
          value={mintList}
          onChange={(e) => setMintList(e.target.value)}
          placeholder="mint1, mint2, mint3..."
          rows={3}
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500 font-mono text-sm"
        />
      </div>

      <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
        <p className="text-sm text-blue-800">
          {action === 'delegate'
            ? 'Delegating moves your accounts to MagicBlock ER for faster, cheaper transactions.'
            : 'Commit/Undelegate returns your accounts to L1. Required before withdrawing tokens.'}
        </p>
      </div>

      <button
        onClick={handleAction}
        disabled={isLoading || !mintList.trim()}
        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
      >
        {isLoading
          ? action === 'delegate'
            ? 'Delegating...'
            : 'Committing...'
          : action === 'delegate'
          ? 'Delegate to ER'
          : 'Commit/Undelegate'}
      </button>
    </div>
  );
}
