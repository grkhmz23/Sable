'use client';

import { FC, ReactNode, useMemo, useCallback, useState, useEffect, createContext, useContext } from 'react';
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
import { SableSdk } from '@sable/sdk';
import { env } from '@/utils/env';

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css';

export type RoutingMode = 'solana' | 'er';

interface WalletContextValue {
  sdk: SableSdk | null;
  solanaSdk: SableSdk | null;
  connection: Connection;
  solanaConnection: Connection;
  routingMode: RoutingMode;
  setRoutingMode: (mode: RoutingMode) => void;
  isLoading: boolean;
  refreshUserState: () => Promise<void>;
  /** Incrementing counter that components can watch to trigger refetches */
  refreshNonce: number;
}

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
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Determine which connection to use based on routing mode
  const connection = useMemo(() => {
    switch (routingMode) {
      case 'er':
        // Use Magic Router for ER mode (auto-routes to the correct validator)
        return new Connection(env.MAGIC_ROUTER_URL, 'confirmed');
      case 'solana':
      default:
        return baseConnection;
    }
  }, [routingMode, baseConnection]);

  // Create SDK instance with router connection for ER-mode transactions
  const sdk = useMemo(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;

    return new SableSdk({
      programId: new PublicKey(env.SABLE_PROGRAM_ID),
      connection,
      // Router connection is the same as the ER connection since we switched to router
      routerConnection: routingMode === 'er' ? connection : undefined,
      wallet: {
        publicKey: wallet.publicKey,
        signTransaction: wallet.signTransaction,
        signAllTransactions: wallet.signAllTransactions,
      },
    });
  }, [wallet.publicKey, wallet.signTransaction, wallet.signAllTransactions, connection, routingMode]);

  // Always-available L1 SDK for delegation/commit/withdraw flows even while UI is in ER mode.
  const solanaSdk = useMemo(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;

    return new SableSdk({
      programId: new PublicKey(env.SABLE_PROGRAM_ID),
      connection: baseConnection,
      wallet: {
        publicKey: wallet.publicKey,
        signTransaction: wallet.signTransaction,
        signAllTransactions: wallet.signAllTransactions,
      },
    });
  }, [wallet.publicKey, wallet.signTransaction, wallet.signAllTransactions, baseConnection]);

  const refreshUserState = useCallback(async () => {
    if (!sdk || !wallet.publicKey) return;
    setIsLoading(true);
    try {
      // Increment nonce so all data-fetching components refetch
      setRefreshNonce((n) => n + 1);
      // Small delay to let fetches start
      await new Promise((resolve) => setTimeout(resolve, 300));
    } finally {
      setIsLoading(false);
    }
  }, [sdk, wallet.publicKey]);

  const value: WalletContextValue = {
    sdk,
    solanaSdk,
    connection,
    solanaConnection: baseConnection,
    routingMode,
    setRoutingMode,
    isLoading,
    refreshUserState,
    refreshNonce,
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

  const endpoint = useMemo(() => env.SOLANA_RPC_URL, []);

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
