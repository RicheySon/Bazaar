import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/layout/Navbar';

export const metadata: Metadata = {
  title: 'BAZAAR - BCH NFT Marketplace',
  description: 'Non-custodial NFT marketplace on Bitcoin Cash Chipnet with atomic swaps, auctions, and creator royalties.',
  keywords: ['NFT', 'Bitcoin Cash', 'BCH', 'CashTokens', 'Marketplace', 'Chipnet'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <Navbar />
        <main className="min-h-[calc(100vh-56px)]">
          {children}
        </main>
        <footer className="border-t py-6 px-6 text-center text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          <p>BAZAAR &mdash; Non-custodial NFT Marketplace on Bitcoin Cash Chipnet</p>
          <p className="mt-1" style={{ color: 'var(--text-muted)' }}>CashTokens &bull; CashScript Covenants &bull; Atomic Swaps</p>
        </footer>
      </body>
    </html>
  );
}
