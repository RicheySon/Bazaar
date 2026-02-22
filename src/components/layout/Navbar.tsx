'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Wallet, Menu, X, ChevronDown, Search, TrendingUp, LayoutGrid,
  Activity, Rocket, Layers, PlusCircle, Code2, BookOpen, Terminal, Key, User,
  LogOut, Library, Zap
} from 'lucide-react';
import { useWalletStore } from '@/lib/store/wallet-store';
import { WalletModal } from '@/components/wallet/WalletModal';
import { shortenAddress, formatBCH } from '@/lib/utils';
import { loadWallet } from '@/lib/bch/wallet';
import { fetchWalletData } from '@/lib/bch/api-client';
import { useWalletSync } from '@/hooks/useWalletSync';
import { useWeb3ModalConnectorContext } from '@bch-wc2/web3modal-connector';

interface DropdownItem {
  href: string;
  label: string;
  icon: React.ElementType;
  description?: string;
}

interface NavSection {
  label: string;
  items: DropdownItem[];
}

const navSections: NavSection[] = [
  {
    label: 'Trade',
    items: [
      { href: '/', label: 'Trending', icon: TrendingUp, description: 'Top collections by volume' },
      { href: '/explore', label: 'Explore', icon: LayoutGrid, description: 'Browse all NFTs' },
      { href: '/collections', label: 'Collections', icon: Library, description: 'Browse NFT collections' },
      { href: '/activity', label: 'Activity', icon: Activity, description: 'Live transaction feed' },
    ],
  },
  {
    label: 'Mint',
    items: [
      { href: '/create',                label: 'Create NFT',  icon: PlusCircle, description: 'Mint a new CashToken NFT' },
      { href: '/drops',                 label: 'NFT Drops',   icon: Zap,        description: 'Scheduled collection drops' },
      { href: '/drops/create',          label: 'Create Drop', icon: Rocket,     description: 'Launch your own NFT drop' },
      { href: '/explore?filter=auction', label: 'Auctions',   icon: Layers,     description: 'Live English auctions' },
    ],
  },
  {
    label: 'Build',
    items: [
      { href: '/build', label: 'Developer Tools', icon: Code2, description: 'SDK & API access' },
      { href: '/build#docs', label: 'Documentation', icon: BookOpen, description: 'Integration guides' },
      { href: '/build#api', label: 'API Explorer', icon: Terminal, description: 'Test endpoints live' },
    ],
  },
];

function NavDropdown({ section }: { section: NavSection }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${open ? 'text-[var(--text-primary)] bg-[var(--bg-hover)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
      >
        {section.label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-1 w-64 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-xl overflow-hidden z-50"
          >
            <div className="p-1.5">
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors group"
                >
                  <item.icon className="h-4 w-4 mt-0.5 text-[var(--text-muted)] group-hover:text-[var(--accent)]" />
                  <div>
                    <div className="text-sm font-medium text-[var(--text-primary)]">{item.label}</div>
                    {item.description && (
                      <div className="text-xs text-[var(--text-muted)] mt-0.5">{item.description}</div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Navbar() {
  useWalletSync(); // Sync WalletConnect context to store
  const { wallet, setWallet, isModalOpen, setModalOpen, disconnect, connectionType } = useWalletStore();
  const { disconnect: wcDisconnect } = useWeb3ModalConnectorContext();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [balance, setBalance] = useState<bigint>(0n);
  const [searchFocused, setSearchFocused] = useState(false);

  const refreshBalance = (address: string, tokenAddress: string, publicKey: string) => {
    fetchWalletData(address).then((data) => {
      if (data) {
        const bal = BigInt(data.balance);
        setBalance(bal);
        setWallet({
          address,
          tokenAddress,
          balance: bal,
          publicKey,
          isConnected: true,
        });
      }
    }).catch((err) => {
      console.warn('Failed to fetch wallet data:', err);
      // Keep existing wallet state if fetch fails, don't crash
    });
  };

  // Load wallet from localStorage on mount
  useEffect(() => {
    const stored = loadWallet();
    if (stored) {
      const pubHex = Array.from(stored.publicKey).map(b => b.toString(16).padStart(2, '0')).join('');
      setWallet({
        address: stored.address,
        tokenAddress: stored.tokenAddress,
        balance: 0n,
        publicKey: pubHex,
        isConnected: true,
      });
      refreshBalance(stored.address, stored.tokenAddress, pubHex);
    }
  }, [setWallet]);

  // Refetch balance when wallet connects (modal closes with new wallet)
  useEffect(() => {
    if (wallet?.isConnected && wallet.balance === 0n) {
      refreshBalance(wallet.address, wallet.tokenAddress, wallet.publicKey);
    }
  }, [wallet?.isConnected]);

  const handleDisconnect = async () => {
    if (connectionType === 'walletconnect') {
      try {
        await wcDisconnect();
      } catch (e) {
        console.error('Failed to disconnect WalletConnect session', e);
      }
    }
    disconnect();
    setMobileMenuOpen(false);
  };

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg-primary)]">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
          <div className="flex h-14 items-center justify-between gap-4">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 shrink-0">
              <div className="w-7 h-7 rounded-md bg-[var(--accent)] flex items-center justify-center">
                <span className="text-black font-black text-sm">B</span>
              </div>
              <span className="text-base font-bold tracking-tight text-[var(--text-primary)]">
                BAZAAR
              </span>
              <span className="hidden sm:inline text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20">
                CHIPNET
              </span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-0.5">
              {navSections.map((section) => (
                <NavDropdown key={section.label} section={section} />
              ))}
            </div>

            {/* Search */}
            <div className="hidden lg:flex flex-1 max-w-sm mx-4">
              <div className={`relative w-full transition-all ${searchFocused ? 'ring-1 ring-[var(--accent)]' : ''} rounded-lg`}>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search collections, NFTs..."
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
                />
              </div>
            </div>

            {/* Right side: Wallet */}
            <div className="hidden md:flex items-center gap-2 shrink-0">
              {wallet?.isConnected ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
                    <span className="text-xs font-mono text-[var(--accent)]">
                      {formatBCH(wallet.balance || balance)}
                    </span>
                    <span className="text-[var(--text-muted)]">|</span>
                    <Link
                      href={`/profile/${wallet.address}`}
                      className="text-xs font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      {shortenAddress(wallet.address, 4)}
                    </Link>
                  </div>
                  <Link
                    href={`/profile/${wallet.address}`}
                    className="p-2 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-hover)] transition-colors"
                    title="Profile"
                  >
                    <User className="h-4 w-4 text-[var(--text-secondary)]" />
                  </Link>
                  <button
                    onClick={handleDisconnect}
                    className="p-2 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-hover)] transition-colors"
                    title="Disconnect"
                  >
                    <LogOut className="h-4 w-4 text-[var(--text-secondary)]" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setModalOpen(true)}
                  className="btn-primary flex items-center gap-2 text-xs px-4 py-2"
                >
                  <Wallet className="h-3.5 w-3.5" />
                  Connect
                </button>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-[var(--bg-hover)]"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="md:hidden border-t border-[var(--border)] overflow-hidden"
            >
              <div className="px-4 py-3 space-y-1">
                {/* Mobile Search */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    placeholder="Search..."
                    className="w-full pl-9 pr-4 py-2 text-sm rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
                  />
                </div>

                {navSections.map((section) => (
                  <div key={section.label}>
                    <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider px-3 py-2">
                      {section.label}
                    </div>
                    {section.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                      >
                        <item.icon className="h-4 w-4" />
                        <span className="text-sm">{item.label}</span>
                      </Link>
                    ))}
                  </div>
                ))}

                <div className="pt-2 border-t border-[var(--border)]">
                  {wallet?.isConnected ? (
                    <div className="space-y-1">
                      <Link
                        href={`/profile/${wallet.address}`}
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                      >
                        <User className="h-4 w-4" />
                        <span className="text-sm font-mono">{shortenAddress(wallet.address, 6)}</span>
                        <span className="ml-auto text-xs font-mono text-[var(--accent)]">
                          {formatBCH(wallet.balance || balance)}
                        </span>
                      </Link>
                      <button
                        onClick={handleDisconnect}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[var(--accent-red)] hover:bg-[var(--bg-hover)]"
                      >
                        <LogOut className="h-4 w-4" />
                        <span className="text-sm">Disconnect</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setMobileMenuOpen(false); setModalOpen(true); }}
                      className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
                    >
                      <Wallet className="h-4 w-4" />
                      Connect Wallet
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <WalletModal isOpen={isModalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
