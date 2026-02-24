import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { WalletContextProvider } from '@/contexts/WalletContext';
import { Toaster } from 'react-hot-toast';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'L2Concept V1 - Vault Wallet',
  description: 'A wallet-like interface for L2Concept V1 with MagicBlock Ephemeral Rollup',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <WalletContextProvider>
          {children}
          <Toaster position="bottom-right" />
        </WalletContextProvider>
      </body>
    </html>
  );
}
