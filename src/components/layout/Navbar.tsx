'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Wallet, Menu, X, ChevronDown, Search, TrendingUp, LayoutGrid,
  Activity, Rocket, Layers, PlusCircle, Code2, BookOpen, Terminal, Key, User,
  LogOut
} from 'lucide-react';
import { useWalletStore } from '@/lib/store/wallet-store';
import { WalletModal } from '@/components/wallet/WalletModal';
import { shortenAddress, formatBCH } from '@/lib/utils';
import { loadWallet } from '@/lib/bch/wallet';
import { fetchWalletData } from '@/lib/bch/api-client';
import { disconnectWallet } from '@/lib/bch/walletconnect';

// ... (NavDropdown component remains unchanged)

export function Navbar() {
  const { wallet, setWallet, isModalOpen, setModalOpen, disconnect, connectionType } = useWalletStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [balance, setBalance] = useState<bigint>(0n);
  const [searchFocused, setSearchFocused] = useState(false);

  // ... (refreshBalance and useEffects remain unchanged)

  const handleDisconnect = async () => {
    if (connectionType === 'walletconnect') {
      try {
        await disconnectWallet();
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
