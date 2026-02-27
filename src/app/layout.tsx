import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/layout/Navbar';
import { WalletProvider } from '@/components/wallet/WalletProvider';

export const metadata: Metadata = {
  title: 'Bazaar — The Liquidity Layer of Bitcoin Cash',
  description: 'Non-custodial NFT liquidity protocol on Bitcoin Cash. Instant sell, order book, AMM pools, atomic sweeps, and fractional vaults — powered by CashScript covenants.',
  keywords: ['NFT', 'Bitcoin Cash', 'BCH', 'CashTokens', 'Marketplace', 'Liquidity', 'Bazaar', 'Instant Sell', 'AMM', 'CashScript'],
  openGraph: {
    title: 'Bazaar — The Liquidity Layer of Bitcoin Cash',
    description: 'Instant sell, order book bids, AMM liquidity pools, and atomic sweeps for BCH NFTs.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <WalletProvider>
          <Navbar />
          <main className="min-h-[calc(100vh-56px)]">
            {children}
          </main>
          <footer className="border-t py-8 px-6" style={{ borderColor: 'var(--border)' }}>
            <div className="mx-auto max-w-[1400px] flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Bazaar Protocol</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>The Liquidity Layer of Bitcoin Cash</div>
              </div>
              <div className="flex items-center gap-6 text-xs" style={{ color: 'var(--text-muted)' }}>
                <span>CashTokens</span>
                <span>CashScript Covenants</span>
                <span>Atomic Swaps</span>
                <span>Non-Custodial</span>
              </div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>BCH Chipnet &bull; Open Source</div>
            </div>
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
