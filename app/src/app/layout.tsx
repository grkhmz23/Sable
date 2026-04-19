import type { Metadata } from 'next';
import { JetBrains_Mono, Outfit, Playfair_Display } from 'next/font/google';
import './globals.css';
import { WalletContextProvider } from '@/contexts/WalletContext';
import { Toaster } from 'react-hot-toast';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['300', '400', '500', '600', '700'],
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'Sable — Private Treasury for AI Agents',
  description: 'Sable is a private programmable money layer for AI agents on Solana, built on MagicBlock ER + PER',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${outfit.variable} ${playfair.variable} ${jetbrainsMono.variable} font-sans`}>
        <WalletContextProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: 'rgba(7, 7, 9, 0.92)',
                color: '#f4f4f5',
                border: '1px solid rgba(255,255,255,0.08)',
                backdropFilter: 'blur(12px)',
              },
            }}
          />
        </WalletContextProvider>
      </body>
    </html>
  );
}
