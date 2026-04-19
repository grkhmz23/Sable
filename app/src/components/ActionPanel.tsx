'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWalletContext } from '@/contexts/WalletContext';
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { useWallet } from '@solana/wallet-adapter-react';
import type { TransferItem as SdkTransferItem } from '@sable/sdk';
import { DelegationStatusComponent } from '@/components/DelegationStatus';
import {
  GlassPanel,
  LuxuryButton,
  LuxuryInput,
  LuxuryTextarea,
  Pill,
  TimelineItem,
  SectionHeader,
  cn,
} from '@/components/ui/luxury';
import toast from 'react-hot-toast';

type ActionTab = 'deposit' | 'send' | 'withdraw' | 'delegate';

export function ActionPanel() {
  const [activeTab, setActiveTab] = useState<ActionTab>('send');

  const tabs: Array<{ id: ActionTab; label: string }> = [
    { id: 'send', label: 'Transfer' },
    { id: 'deposit', label: 'Deposit' },
    { id: 'withdraw', label: 'Withdraw' },
    { id: 'delegate', label: 'Delegate' },
  ];

  return (
    <GlassPanel className="overflow-hidden">
      <div className="border-b border-white/8 bg-black/30 px-3 pt-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative rounded-t-xl px-3 py-3 text-[11px] uppercase tracking-[0.18em] transition',
                  active
                    ? 'bg-white/[0.04] text-amber-100'
                    : 'text-zinc-500 hover:bg-white/[0.02] hover:text-zinc-200'
                )}
              >
                <span>{tab.label}</span>
                {active ? (
                  <span className="absolute inset-x-4 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-200/80 to-transparent" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-6 md:p-8">
        {activeTab === 'deposit' && <DepositForm />}
        {activeTab === 'send' && <SendForm />}
        {activeTab === 'withdraw' && <WithdrawForm />}
        {activeTab === 'delegate' && <DelegateForm />}
      </div>
    </GlassPanel>
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
      toast.success('Deposit successful');
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
    <div className="space-y-6">
      <SectionHeader
        eyebrow="L1 Funding"
        title="Fund Protocol Vault"
        subtitle="Transfers SPL tokens from your wallet ATA into the vault ATA, then credits your ledger balance PDA."
      />

      <div className="grid gap-4">
        <LuxuryInput
          label="Mint Address"
          placeholder="Enter mint address"
          value={mint}
          onChange={(e) => setMint(e.target.value)}
        />
        <LuxuryInput
          label="Amount"
          type="number"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="text-lg"
        />
      </div>

      <LuxuryButton
        fullWidth
        onClick={handleDeposit}
        isLoading={isLoading}
        disabled={!mint.trim() || !amount.trim()}
      >
        Authorize Deposit
      </LuxuryButton>
    </div>
  );
}

type SendStage =
  | 'idle'
  | 'analyzing'
  | 'er_send'
  | 'undelegating'
  | 'l1_vault_send'
  | 'done';

function SendForm() {
  const { sdk, solanaSdk, routingMode } = useWalletContext();
  const { publicKey } = useWallet();
  const [mint, setMint] = useState('');
  const [recipients, setRecipients] = useState('');
  const [mode, setMode] = useState<'simple' | 'advanced'>('simple');
  const [defaultAmount, setDefaultAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [stage, setStage] = useState<SendStage>('idle');
  const [routeSummary, setRouteSummary] = useState<{
    total: number;
    internal: number;
    fallback: number;
  } | null>(null);

  useEffect(() => {
    if (stage !== 'done') return;
    const t = setTimeout(() => setStage('idle'), 3500);
    return () => clearTimeout(t);
  }, [stage]);

  const classifyRecipientsForEr = async (
    mintPubkey: PublicKey,
    items: SdkTransferItem[]
  ): Promise<{ internalItems: SdkTransferItem[]; fallbackItems: SdkTransferItem[] }> => {
    if (!solanaSdk) {
      return { internalItems: [], fallbackItems: items };
    }

    const uniqueRecipients = Array.from(new Set(items.map((item) => item.toOwner.toBase58())));

    const delegatedMap = new Map<string, boolean>();
    await Promise.all(
      uniqueRecipients.map(async (ownerBase58) => {
        const owner = new PublicKey(ownerBase58);
        const status = await solanaSdk.getDelegationStatus(owner, [mintPubkey]);
        delegatedMap.set(ownerBase58, status.length > 0 && status.every((s) => s.isDelegated));
      })
    );

    const internalItems: SdkTransferItem[] = [];
    const fallbackItems: SdkTransferItem[] = [];
    for (const item of items) {
      if (delegatedMap.get(item.toOwner.toBase58())) {
        internalItems.push(item);
      } else {
        fallbackItems.push(item);
      }
    }

    return { internalItems, fallbackItems };
  };

  const handleSend = async () => {
    if (!sdk || !mint.trim() || !recipients.trim()) return;

    setIsLoading(true);
    setStage('analyzing');
    setRouteSummary(null);

    try {
      const mintPubkey = new PublicKey(mint.trim());

      let items: SdkTransferItem[];
      if (mode === 'simple') {
        if (!defaultAmount.trim()) {
          throw new Error('Amount per recipient is required in simple mode');
        }

        const addresses = recipients.split(',').map((s) => s.trim()).filter(Boolean);
        items = addresses.map((addr) => ({
          toOwner: new PublicKey(addr),
          amount: new BN(parseFloat(defaultAmount) * 1e9),
        }));
      } else {
        items = sdk.parseBatchTransferInput(recipients, defaultAmount);
      }

      if (items.length === 0) {
        throw new Error('No valid recipients parsed');
      }

      if (routingMode !== 'er') {
        setRouteSummary({ total: items.length, internal: items.length, fallback: 0 });
        setStage('er_send');
        const results = await sdk.transferBatchChunked(mintPubkey, items, 15);
        toast.success(`Sent to ${items.length} recipients in ${results.length} transaction(s)`);
        setRecipients('');
        setStage('done');
        return;
      }

      if (!solanaSdk || !publicKey) {
        throw new Error('L1 SDK unavailable for MagicBlock fallback flow');
      }

      const senderStatus = await solanaSdk.getDelegationStatus(publicKey, [mintPubkey]);
      const senderFullyDelegated =
        senderStatus.length > 0 && senderStatus.every((s) => s.isDelegated);
      const senderHasDelegatedAccounts = senderStatus.some((s) => s.isDelegated);

      const { internalItems, fallbackItems } = await classifyRecipientsForEr(mintPubkey, items);
      setRouteSummary({
        total: items.length,
        internal: internalItems.length,
        fallback: fallbackItems.length,
      });

      if (internalItems.length > 0 && !senderFullyDelegated) {
        throw new Error(
          'Sender accounts are not fully delegated. Delegate your state/balance for this mint or switch routing to Solana (L1).'
        );
      }

      if (fallbackItems.length > 0) {
        const proceed = window.confirm(
          `Detected ${fallbackItems.length} recipient(s) not delegated to MagicBlock. ` +
            `These will be sent on L1 from the program vault after commit/undelegate. Continue?`
        );
        if (!proceed) {
          setStage('idle');
          return;
        }
      }

      let internalTxCount = 0;
      let fallbackL1TxCount = 0;

      if (internalItems.length > 0) {
        setStage('er_send');
        const erResults = await sdk.transferBatchChunked(mintPubkey, internalItems, 15);
        internalTxCount = erResults.length;
        toast.success(
          `ER send complete for ${internalItems.length} recipient(s).` +
            (fallbackItems.length > 0 ? ' Preparing L1 vault send...' : '')
        );
      }

      if (fallbackItems.length > 0) {
        if (senderHasDelegatedAccounts) {
          setStage('undelegating');
          await solanaSdk.commitAndUndelegate({ mintList: [mintPubkey] });
          fallbackL1TxCount += 1;
          toast.success('Commit/undelegate requested. Waiting for L1 state...');

          const undelegated = await solanaSdk.waitForDelegationStatus(publicKey, [mintPubkey], false, {
            timeoutMs: 90_000,
            pollIntervalMs: 2_000,
          });

          if (!undelegated) {
            throw new Error(
              'Timed out waiting for commit/undelegate to finalize on L1. Ensure MagicBlock indexer/validator is running.'
            );
          }
        }

        setStage('l1_vault_send');
        const l1Results = await solanaSdk.externalSendBatchChunked(mintPubkey, fallbackItems, 12);
        fallbackL1TxCount += l1Results.length;
      }

      toast.success(
        `Send complete: ${internalItems.length} ER recipient(s), ${fallbackItems.length} L1 recipient(s). ` +
          `Txs: ${internalTxCount + fallbackL1TxCount}`
      );
      setRecipients('');
      setStage('done');
    } catch (error: any) {
      console.error('Send error:', error);
      toast.error(error.message || 'Send failed');
      setStage('idle');
    } finally {
      setIsLoading(false);
    }
  };

  const showTelemetry = routingMode === 'er' && (stage !== 'idle' || routeSummary);

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Execution Console"
        title="Execute Transfer"
        subtitle="Batch sends are routed by mode. In ER mode, delegated recipients use internal transfers while non-delegated recipients fall back to L1 vault settlement."
        action={
          <div className="flex items-center gap-2">
            <Pill tone={routingMode === 'er' ? 'amber' : 'default'}>
              {routingMode === 'er'
                ? 'MagicBlock ER'
                : 'Solana L1'}
            </Pill>
          </div>
        }
      />

      <div className="rounded-2xl border border-white/8 bg-black/30 p-4">
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode('simple')}
            className={cn(
              'rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.16em] transition',
              mode === 'simple'
                ? 'bg-white/[0.08] text-amber-100 border border-white/12'
                : 'text-zinc-500 hover:text-zinc-200'
            )}
          >
            Standard Input
          </button>
          <button
            type="button"
            onClick={() => setMode('advanced')}
            className={cn(
              'rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.16em] transition',
              mode === 'advanced'
                ? 'bg-white/[0.08] text-amber-100 border border-white/12'
                : 'text-zinc-500 hover:text-zinc-200'
            )}
          >
            Batch Input
          </button>
        </div>

        <div className="grid gap-4">
          <LuxuryInput
            label="Mint Address"
            placeholder="Enter mint address"
            value={mint}
            onChange={(e) => setMint(e.target.value)}
          />

          <LuxuryTextarea
            label={mode === 'simple' ? 'Recipient Addresses' : 'Recipients (address,amount)'}
            hint={mode === 'simple' ? 'comma-separated addresses' : 'one per line'}
            rows={mode === 'advanced' ? 6 : 4}
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            placeholder={
              mode === 'simple'
                ? 'address1, address2, address3'
                : 'address1,100000000\naddress2,250000000'
            }
            className="l2-subtle-scrollbar"
          />

          <LuxuryInput
            label={mode === 'simple' ? 'Amount per Recipient (9 decimals assumed in UI)' : 'Default Amount (optional)'}
            type="number"
            placeholder="0.00"
            value={defaultAmount}
            onChange={(e) => setDefaultAmount(e.target.value)}
            className="text-lg"
          />
        </div>
      </div>

      {showTelemetry ? (
        <GlassPanel className="p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[10px] uppercase tracking-[0.3em] text-amber-200/70">
                Execution Telemetry
              </p>
              {routeSummary ? (
                <div className="flex flex-wrap gap-2">
                  <Pill>{routeSummary.total} total</Pill>
                  <Pill tone="green">{routeSummary.internal} ER internal</Pill>
                  <Pill tone="amber">{routeSummary.fallback} L1 fallback</Pill>
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              <TimelineItem
                label="Path analysis & recipient delegation checks"
                active={stage === 'analyzing'}
                done={['er_send', 'undelegating', 'l1_vault_send', 'done'].includes(stage)}
              />
              <TimelineItem
                label="Internal ledger transfer on MagicBlock ER"
                active={stage === 'er_send'}
                done={['undelegating', 'l1_vault_send', 'done'].includes(stage)}
              />
              <TimelineItem
                label="Commit / undelegate to finalize L1 state"
                active={stage === 'undelegating'}
                done={['l1_vault_send', 'done'].includes(stage)}
                warning
              />
              <TimelineItem
                label="L1 vault settlement to recipient ATAs"
                active={stage === 'l1_vault_send'}
                done={stage === 'done'}
                last
              />
            </div>
          </div>
        </GlassPanel>
      ) : null}

      <LuxuryButton
        fullWidth
        onClick={handleSend}
        isLoading={isLoading}
        disabled={!mint.trim() || !recipients.trim()}
      >
        {stage === 'done' ? 'Transfer Confirmed' : 'Authorize Transfer'}
      </LuxuryButton>
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
      toast.success('Withdrawal successful');
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
    <div className="space-y-6">
      <SectionHeader
        eyebrow="L1 Settlement"
        title="Withdraw From Vault"
        subtitle="Withdrawals require committed (non-delegated) state. The program checks delegation status before transferring tokens out of the vault."
      />

      <div className="rounded-2xl border border-amber-300/15 bg-amber-300/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="amber">Withdrawals blocked while delegated</Pill>
          <Pill>Commit/Undelegate first</Pill>
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          If this instruction fails with a delegated-state error, use the Delegate tab to commit and undelegate the relevant mint account.
        </p>
      </div>

      <div className="grid gap-4">
        <LuxuryInput
          label="Mint Address"
          placeholder="Enter mint address"
          value={mint}
          onChange={(e) => setMint(e.target.value)}
        />
        <LuxuryInput
          label="Amount"
          type="number"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <LuxuryInput
          label="Destination ATA (optional)"
          placeholder="Defaults to your wallet ATA"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          className="font-mono"
        />
      </div>

      <LuxuryButton
        fullWidth
        onClick={handleWithdraw}
        isLoading={isLoading}
        disabled={!mint.trim() || !amount.trim()}
      >
        Authorize Withdrawal
      </LuxuryButton>
    </div>
  );
}

type DelegateStage = 'idle' | 'requesting' | 'waiting' | 'done';

function DelegateForm() {
  const { sdk, solanaSdk } = useWalletContext();
  const { publicKey } = useWallet();
  const [mintList, setMintList] = useState('');
  const [action, setAction] = useState<'delegate' | 'commit'>('delegate');
  const [isLoading, setIsLoading] = useState(false);
  const [stage, setStage] = useState<DelegateStage>('idle');

  useEffect(() => {
    if (stage !== 'done') return;
    const t = setTimeout(() => setStage('idle'), 2500);
    return () => clearTimeout(t);
  }, [stage]);

  const handleAction = async () => {
    const l1Sdk = solanaSdk || sdk;
    if (!l1Sdk || !mintList.trim()) return;

    setIsLoading(true);
    setStage('requesting');

    try {
      const mints = mintList.split(',').map((s) => s.trim()).filter(Boolean);
      const mintPubkeys = mints.map((m) => new PublicKey(m));

      if (action === 'delegate') {
        const result = await l1Sdk.delegate({ mintList: mintPubkeys });
        console.log('Delegate transaction:', result.signature);
      } else {
        const result = await l1Sdk.commitAndUndelegate({ mintList: mintPubkeys });
        console.log('Commit transaction:', result.signature);
      }

      if (publicKey) {
        setStage('waiting');
        toast.success(
          action === 'delegate'
            ? 'Delegation requested. Waiting for MagicBlock state update...'
            : 'Commit/undelegate requested. Waiting for L1 state...'
        );

        const ok = await l1Sdk.waitForDelegationStatus(publicKey, mintPubkeys, action === 'delegate', {
          timeoutMs: 90_000,
          pollIntervalMs: 2_000,
        });

        if (!ok) {
          throw new Error(
            action === 'delegate'
              ? 'Delegation request sent, but timed out waiting for status change. Ensure MagicBlock indexer/validator is running.'
              : 'Commit/undelegate request sent, but timed out waiting for status change. Ensure MagicBlock indexer/validator is running.'
          );
        }
      }

      toast.success(action === 'delegate' ? 'Delegation successful' : 'Commit/Undelegate successful');
      setStage('done');
    } catch (error: any) {
      console.error('Delegation error:', error);
      toast.error(error.message || 'Operation failed');
      setStage('idle');
    } finally {
      setIsLoading(false);
    }
  };

  const mintCount = useMemo(
    () => mintList.split(',').map((s) => s.trim()).filter(Boolean).length,
    [mintList]
  );

  const statusMints = useMemo(() => {
    const raw = mintList
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const parsed: PublicKey[] = [];
    const seen = new Set<string>();
    for (const mint of raw) {
      try {
        const pk = new PublicKey(mint);
        const key = pk.toBase58();
        if (!seen.has(key)) {
          seen.add(key);
          parsed.push(pk);
        }
      } catch {
        // Ignore invalid entries while typing; the submit path will surface errors.
      }
    }

    return parsed;
  }, [mintList]);

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Custody Routing"
        title="Delegate / Commit Accounts"
        subtitle="Delegation enables fast ER execution. Commit/undelegate finalizes state back to L1 and is required before withdrawals."
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setAction('delegate')}
          className={cn(
            'rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.16em] transition',
            action === 'delegate'
              ? 'border border-white/12 bg-white/[0.08] text-amber-100'
              : 'text-zinc-500 hover:text-zinc-100'
          )}
        >
          Delegate to ER
        </button>
        <button
          type="button"
          onClick={() => setAction('commit')}
          className={cn(
            'rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.16em] transition',
            action === 'commit'
              ? 'border border-white/12 bg-white/[0.08] text-amber-100'
              : 'text-zinc-500 hover:text-zinc-100'
          )}
        >
          Commit / Undelegate
        </button>
        <Pill tone={action === 'delegate' ? 'amber' : 'default'}>{mintCount} mint(s)</Pill>
      </div>

      <LuxuryTextarea
        label="Mint List"
        hint="comma-separated, max 10"
        rows={4}
        value={mintList}
        onChange={(e) => setMintList(e.target.value)}
        placeholder="So11111111111111111111111111111111111111112, EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
      />

      <div className="rounded-2xl border border-white/8 bg-black/30 p-4">
        <p className="text-sm text-zinc-300">
          {action === 'delegate'
            ? 'Delegation requests are submitted on L1 and then applied by the MagicBlock indexer/validator.'
            : 'Commit/undelegate requests finalize delegated state back to L1 so withdrawals and standard vault sends can proceed.'}
        </p>

        {(stage !== 'idle' || isLoading) && mintList.trim() ? (
          <div className="mt-4 space-y-3">
            <TimelineItem
              label={
                action === 'delegate'
                  ? 'Submit delegation request transaction'
                  : 'Submit commit / undelegate transaction'
              }
              active={stage === 'requesting'}
              done={stage === 'waiting' || stage === 'done'}
            />
            <TimelineItem
              label={
                action === 'delegate'
                  ? 'Wait for MagicBlock delegation status update'
                  : 'Wait for committed / undelegated L1 state'
              }
              active={stage === 'waiting'}
              done={stage === 'done'}
              warning={action === 'commit'}
              last
            />
          </div>
        ) : null}
      </div>

      <DelegationStatusComponent
        sdk={solanaSdk || sdk}
        owner={publicKey ?? null}
        mints={statusMints}
        refreshInterval={15000}
        embedded
      />

      <LuxuryButton
        fullWidth
        onClick={handleAction}
        isLoading={isLoading}
        disabled={!mintList.trim()}
        variant={action === 'delegate' ? 'primary' : 'secondary'}
      >
        {action === 'delegate' ? 'Authorize Delegation' : 'Authorize Commit / Undelegate'}
      </LuxuryButton>
    </div>
  );
}
