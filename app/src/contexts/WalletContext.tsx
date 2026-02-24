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
import { L2ConceptSdk } from '@l2conceptv1/sdk';
import { env } from '@/utils/env';

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css';

export type RoutingMode = 'router' | 'solana' | 'er';

interface WalletContextValue {
  sdk: L2ConceptSdk | null;
  connection: Connection;
  routingMode: RoutingMode;
  setRoutingMode: (mode: RoutingMode) => void;
  isLoading: boolean;
  refreshUserState: () => Promise<void>;
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

  // Determine which connection to use based on routing mode
  const connection = useMemo(() => {
    switch (routingMode) {
      case 'er':
        if (!env.MAGICBLOCK_RPC_URL) {
          console.warn('MagicBlock RPC URL not set, falling back to Solana RPC');
          return baseConnection;
        }
        return new Connection(env.MAGICBLOCK_RPC_URL, 'confirmed');
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
      programId: new PublicKey(env.L2CONCEPTV1_PROGRAM_ID),
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
