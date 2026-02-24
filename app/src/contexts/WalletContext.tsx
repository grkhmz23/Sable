'use client';

import { FC, ReactNode, useMemo, useCallback, useState, useEffect } from 'react';
import {
  ConnectionProvider,
  WalletProvider,
  useConnection,
  useWallet,
} from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import {
  WalletModalProvider,
  WalletMultiButton,
} from '@solana/wallet-adapter-react-ui';
import { Connection, PublicKey } from '@solana/web3.js';
import { L2ConceptSdk } from '@l2conceptv1/sdk';

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css';

// Environment configuration
const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'http://127.0.0.1:8899';
const MAGICBLOCK_RPC_URL =
  process.env.NEXT_PUBLIC_MAGICBLOCK_RPC_URL || SOLANA_RPC_URL;
const MAGIC_ROUTER_URL = process.env.NEXT_PUBLIC_MAGIC_ROUTER_URL;

const PROGRAM_ID =
  process.env.NEXT_PUBLIC_L2CONCEPTV1_PROGRAM_ID ||
  'L2CnccKT1qHNS1wJ7p3wJ3JhCX5s4J5wT5x3h5mH2j1';

export type RoutingMode = 'router' | 'solana' | 'er';

interface WalletContextValue {
  sdk: L2ConceptSdk | null;
  connection: Connection;
  routingMode: RoutingMode;
  setRoutingMode: (mode: RoutingMode) => void;
  isLoading: boolean;
  refreshUserState: () => Promise<void>;
}

import { createContext, useContext } from 'react';

const WalletContext = createContext<WalletContextValue | null>(null);

export const useWalletContext = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWalletContext must be used within WalletContextProvider');
  }
  return context;
};

// Inner provider that has access to wallet
const WalletContextInner: FC<{ children: ReactNode }> = ({ children }) => {
  const { connection: baseConnection } = useConnection();
  const wallet = useWallet();
  const [routingMode, setRoutingMode] = useState<RoutingMode>('solana');
  const [isLoading, setIsLoading] = useState(false);

  // Determine which connection to use based on routing mode
  const connection = useMemo(() => {
    switch (routingMode) {
      case 'er':
        return new Connection(MAGICBLOCK_RPC_URL, 'confirmed');
      case 'router':
        // Router mode would use a custom fetch implementation
        return baseConnection;
      case 'solana':
      default:
        return baseConnection;
    }
  }, [routingMode, baseConnection]);

  // Create SDK instance
  const sdk = useMemo(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;

    return new L2ConceptSdk({
      programId: new PublicKey(PROGRAM_ID),
      connection,
      wallet: {
        publicKey: wallet.publicKey,
        signTransaction: wallet.signTransaction,
        signAllTransactions: wallet.signAllTransactions,
      },
    });
  }, [wallet.publicKey, wallet.signTransaction, wallet.signAllTransactions, connection]);

  const refreshUserState = useCallback(async () => {
    if (!sdk || !wallet.publicKey) return;
    setIsLoading(true);
    try {
      // Trigger any refresh logic here
      await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      setIsLoading(false);
    }
  }, [sdk, wallet.publicKey]);

  const value: WalletContextValue = {
    sdk,
    connection,
    routingMode,
    setRoutingMode,
    isLoading,
    refreshUserState,
  };

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
};

export const WalletContextProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  const network = WalletAdapterNetwork.Devnet;

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter({ network })],
    [network]
  );

  const endpoint = useMemo(() => SOLANA_RPC_URL, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <WalletContextInner>{children}</WalletContextInner>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export { WalletMultiButton };
