'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWalletContext } from '@/contexts/WalletContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { X402Client } from '@sable/x402-client';
import type { AgentSnapshot } from '@sable/sdk';
import {
  GlassPanel,
  LuxuryButton,
  LuxuryInput,
  Pill,
  SectionHeader,
  truncateAddress,
  cn,
} from '@/components/ui/luxury';
import toast from 'react-hot-toast';

interface LogEntry {
  id: number;
  timestamp: number;
  step: string;
  detail?: string;
  type: 'request' | 'response' | 'action' | 'success' | 'error';
}

interface RunStats {
  completed: number;
  failed: number;
  totalLatency: number;
  startTime: number;
  endTime: number;
}

export function X402DemoView() {
  const { sdk } = useWalletContext();
  const { publicKey, connected } = useWallet();
  const [agents, setAgents] = useState<AgentSnapshot[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentSnapshot | null>(null);
  const [agentBalance, setAgentBalance] = useState<string>('—');
  const [city, setCity] = useState('Barcelona');
  const [receiver, setReceiver] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [weatherResult, setWeatherResult] = useState<any>(null);
  const [runStats, setRunStats] = useState<RunStats | null>(null);
  const [isRunningBatch, setIsRunningBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const logIdRef = useRef(0);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = (step: string, type: LogEntry['type'], detail?: string) => {
    const id = ++logIdRef.current;
    setLogs((prev) => [...prev, { id, timestamp: Date.now(), step, type, detail }]);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const fetchAgents = useCallback(async () => {
    if (!sdk || !publicKey) return;
    try {
      const list = await sdk.agents.listAgents(publicKey);
      setAgents(list);
      if (list.length > 0 && !selectedAgent) {
        setSelectedAgent(list[0]);
      }
    } catch {
      setAgents([]);
    }
  }, [sdk, publicKey, selectedAgent]);

  const fetchAgentBalance = useCallback(async () => {
    if (!sdk || !selectedAgent) {
      setAgentBalance('—');
      return;
    }
    try {
      const usdcMint = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
      const bal = await sdk.agents.getAgentBalance(selectedAgent.pubkey, usdcMint);
      setAgentBalance(bal ? bal.amount.toString() : '0');
    } catch {
      setAgentBalance('—');
    }
  }, [sdk, selectedAgent]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    if (publicKey && !receiver) {
      setReceiver(publicKey.toBase58());
    }
  }, [publicKey, receiver]);

  useEffect(() => {
    fetchAgentBalance();
  }, [fetchAgentBalance]);

  const handleAskWeather = async (options?: { silent?: boolean; cityOverride?: string }) => {
    if (!sdk || !publicKey || !selectedAgent) {
      toast.error('Connect wallet and select an agent');
      return null;
    }

    const targetCity = options?.cityOverride || city;
    if (!options?.silent) setIsLoading(true);

    const startTime = performance.now();
    const x402 = new X402Client({ sableClient: sdk, agent: selectedAgent.pubkey });

    try {
      if (!options?.silent) addLog(`GET /api/demo/weather?city=${targetCity}`, 'request');

      // Step 1: Call without payment
      const first = await fetch(`/api/demo/weather?city=${encodeURIComponent(targetCity)}&receiver=${receiver}`);

      if (first.status === 402) {
        if (!options?.silent) addLog('← 402 Payment Required', 'response', 'Building x402 payment...');

        // Step 2: Parse requirements and build payment
        const requirements = await first.json();
        if (!options?.silent) addLog('Signing x402 header with agent keypair...', 'action');

        const payload = await x402.buildPaymentPayload(requirements);
        const header = x402.encodeHeader(payload);

        if (!options?.silent) addLog('→ GET again with X-PAYMENT header', 'request');

        // Step 3: Retry with payment
        const second = await fetch(`/api/demo/weather?city=${encodeURIComponent(targetCity)}&receiver=${receiver}`, {
          headers: { 'X-PAYMENT': header },
        });

        if (!second.ok) {
          const err = await second.json().catch(() => ({}));
          if (!options?.silent) addLog(`← ${second.status} Error`, 'error', err.error || 'Payment failed');
          return null;
        }

        const data = await second.json();
        const latency = Math.round(performance.now() - startTime);

        if (!options?.silent) {
          addLog(`← 200 OK`, 'success', JSON.stringify(data));
          addLog(`Agent balance updated (private)`, 'action', `Call took ${latency}ms`);
          setWeatherResult(data);
          fetchAgentBalance();
        }

        return { success: true, latency, data };
      } else if (first.ok) {
        const data = await first.json();
        if (!options?.silent) {
          addLog('← 200 OK (no payment required)', 'success', JSON.stringify(data));
          setWeatherResult(data);
        }
        return { success: true, latency: Math.round(performance.now() - startTime), data };
      } else {
        if (!options?.silent) addLog(`← ${first.status} Error`, 'error');
        return null;
      }
    } catch (error: any) {
      if (!options?.silent) addLog(`Error: ${error.message}`, 'error');
      return null;
    } finally {
      if (!options?.silent) setIsLoading(false);
    }
  };

  const handleRun100 = async () => {
    if (!sdk || !publicKey || !selectedAgent) {
      toast.error('Connect wallet and select an agent');
      return;
    }

    setIsRunningBatch(true);
    setBatchProgress(0);
    setRunStats(null);
    setLogs([]);
    addLog('Starting 100-call batch...', 'action');

    const stats: RunStats = {
      completed: 0,
      failed: 0,
      totalLatency: 0,
      startTime: Date.now(),
      endTime: 0,
    };

    const cities = ['Barcelona', 'Tokyo', 'New York', 'London', 'Paris', 'Berlin', 'Sydney', 'Dubai', 'Singapore', 'Mumbai'];

    for (let i = 0; i < 100; i++) {
      const cityName = cities[i % cities.length];
      const result = await handleAskWeather({ silent: true, cityOverride: cityName });

      if (result?.success) {
        stats.completed++;
        stats.totalLatency += result.latency;
      } else {
        stats.failed++;
      }

      setBatchProgress(i + 1);

      // Throttle to avoid overwhelming the validator
      if (i < 99) await new Promise((r) => setTimeout(r, 50));
    }

    stats.endTime = Date.now();
    setRunStats(stats);
    setIsRunningBatch(false);
    fetchAgentBalance();
    addLog(
      `Batch complete: ${stats.completed} OK, ${stats.failed} failed, avg ${Math.round(stats.totalLatency / stats.completed)}ms`,
      'success'
    );
  };

  if (!connected) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-lg text-white">Connect your wallet to run the x402 demo.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Payments"
        title="x402 Live Demo"
        subtitle="Watch an agent pay per API call in real time via the x402 protocol."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left pane — Weather API */}
        <GlassPanel className="p-6">
          <SectionHeader eyebrow="Merchant" title="Weather API" subtitle="Each call costs 0.01 USDC" />

          <div className="mt-5 space-y-4">
            <LuxuryInput label="City" value={city} onChange={(e) => setCity(e.target.value)} />
            <LuxuryInput
              label="Receiver (payTo)"
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
              className="font-mono text-xs"
            />
            <div className="flex gap-2">
              <LuxuryButton onClick={() => handleAskWeather()} isLoading={isLoading} disabled={isRunningBatch}>
                Ask Weather
              </LuxuryButton>
              <LuxuryButton
                variant="secondary"
                onClick={handleRun100}
                isLoading={isRunningBatch}
                disabled={isLoading}
              >
                Run 100 Calls
              </LuxuryButton>
            </div>

            {weatherResult ? (
              <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/5 p-4">
                <p className="text-sm text-emerald-100">Weather for {weatherResult.city}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-zinc-300">
                  <p>🌡️ Temp: {weatherResult.temp}°C</p>
                  <p>💨 Wind: {weatherResult.wind} km/h</p>
                  <p>☁️ Condition: {weatherResult.condition}</p>
                  <p>💧 Humidity: {weatherResult.humidity}%</p>
                </div>
              </div>
            ) : null}

            {isRunningBatch ? (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>Progress</span>
                  <span>{batchProgress}/100</span>
                </div>
                <div className="h-2 rounded-full bg-white/10">
                  <div
                    className="h-2 rounded-full bg-amber-300 transition-all"
                    style={{ width: `${batchProgress}%` }}
                  />
                </div>
              </div>
            ) : null}

            {runStats ? (
              <div className="rounded-2xl border border-white/8 bg-black/35 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Batch Results</p>
                <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-zinc-500">Completed</p>
                    <p className="text-emerald-100">{runStats.completed}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Failed</p>
                    <p className="text-rose-100">{runStats.failed}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Avg Latency</p>
                    <p className="text-white">
                      {runStats.completed > 0
                        ? `${Math.round(runStats.totalLatency / runStats.completed)}ms`
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Throughput</p>
                    <p className="text-white">
                      {(
                        (runStats.completed / ((runStats.endTime - runStats.startTime) / 1000)) ||
                        0
                      ).toFixed(1)}{' '}
                      calls/s
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </GlassPanel>

        {/* Right pane — Agent + Logs */}
        <div className="space-y-6">
          <GlassPanel className="p-6">
            <SectionHeader eyebrow="Agent" title="Payer Agent" />
            <div className="mt-4 space-y-3">
              <div>
                <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-zinc-500">Select Agent</p>
                <select
                  value={selectedAgent?.pubkey.toBase58() || ''}
                  onChange={(e) => {
                    const agent = agents.find((a) => a.pubkey.toBase58() === e.target.value);
                    setSelectedAgent(agent || null);
                  }}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-zinc-100 focus:border-[rgba(214,190,112,0.32)] focus:outline-none"
                >
                  {agents.map((a) => (
                    <option key={a.pubkey.toBase58()} value={a.pubkey.toBase58()}>
                      {a.label} ({truncateAddress(a.pubkey.toBase58(), 8, 6)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">USDC Balance</p>
                <p className="mt-1 font-mono text-sm text-white">{agentBalance}</p>
              </div>
            </div>
          </GlassPanel>

          <GlassPanel className="p-5">
            <div className="flex items-center justify-between">
              <SectionHeader eyebrow="Live" title="x402 Dance Log" />
              <LuxuryButton
                variant="ghost"
                className="px-3 py-2 text-[10px]"
                onClick={() => setLogs([])}
              >
                Clear
              </LuxuryButton>
            </div>
            <div className="mt-4 max-h-[400px] space-y-2 overflow-auto sable-subtle-scrollbar pr-1">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-xs',
                    log.type === 'request'
                      ? 'border-blue-300/10 bg-blue-300/5 text-blue-100'
                      : log.type === 'response'
                      ? 'border-amber-300/10 bg-amber-300/5 text-amber-100'
                      : log.type === 'action'
                      ? 'border-white/6 bg-white/[0.02] text-zinc-300'
                      : log.type === 'success'
                      ? 'border-emerald-300/10 bg-emerald-300/5 text-emerald-100'
                      : 'border-rose-300/10 bg-rose-300/5 text-rose-100'
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-[10px] opacity-60">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <div>
                      <p>{log.step}</p>
                      {log.detail ? <p className="mt-0.5 text-[10px] opacity-70">{log.detail}</p> : null}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
