'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Zap, Search, PlusCircle, PackageOpen, Flame, Clock, CheckCircle } from 'lucide-react';
import { DropCard } from '@/components/drops/DropCard';
import { useWalletStore } from '@/lib/store/wallet-store';
import type { NFTDrop, DropStatus } from '@/lib/types';

type StatusFilter = 'all' | 'live' | 'upcoming' | 'presale' | 'ended';

const STATUS_TABS: { id: StatusFilter; label: string; icon: React.ElementType }[] = [
  { id: 'all',      label: 'All',      icon: Zap },
  { id: 'live',     label: 'Live',     icon: Flame },
  { id: 'upcoming', label: 'Upcoming', icon: Clock },
  { id: 'ended',    label: 'Ended',    icon: CheckCircle },
];

export default function DropsPage() {
  const { wallet } = useWalletStore();
  const [drops, setDrops] = useState<(NFTDrop & { status: DropStatus })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    const load = async (showLoading = false) => {
      if (showLoading) setIsLoading(true);
      try {
        const res = await fetch('/api/drops');
        const data = await res.json();
        setDrops(data.drops ?? []);
      } catch {
        setDrops([]);
      } finally {
        if (showLoading) setIsLoading(false);
      }
    };
    load(true);
    const interval = setInterval(() => load(false), 15000);
    return () => clearInterval(interval);
  }, []);

  const filtered = drops.filter((d) => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || d.name.toLowerCase().includes(q) || d.collectionName.toLowerCase().includes(q) || d.creatorAddress.toLowerCase().includes(q);
    const matchStatus =
      statusFilter === 'all' ||
      d.status === statusFilter ||
      (statusFilter === 'upcoming' && d.status === 'presale');
    return matchSearch && matchStatus;
  });

  // Sort: live > presale > upcoming > sold-out > ended
  const ORDER: Record<DropStatus, number> = { live: 0, presale: 1, upcoming: 2, 'sold-out': 3, ended: 4 };
  const sorted = [...filtered].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.mintStartTime - b.mintStartTime);

  const liveCount     = drops.filter(d => d.status === 'live' || d.status === 'presale').length;
  const upcomingCount = drops.filter(d => d.status === 'upcoming').length;

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="mx-auto max-w-[1400px]">

        {/* Hero */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-5 w-5" style={{ color: 'var(--accent)' }} />
              <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>NFT Drops</h1>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              New CashTokens NFT collections launching on Bitcoin Cash Chipnet
            </p>

            {/* Mini stats */}
            {!isLoading && (
              <div className="flex items-center gap-4 mt-3">
                {liveCount > 0 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
                    <span style={{ color: 'var(--accent)' }}>{liveCount} Live Now</span>
                  </div>
                )}
                {upcomingCount > 0 && (
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <Clock className="h-3 w-3" />
                    {upcomingCount} Upcoming
                  </div>
                )}
              </div>
            )}
          </div>

          {wallet?.isConnected && (
            <Link
              href="/drops/create"
              className="btn-primary flex items-center gap-2 text-xs px-4 py-2 shrink-0"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Create Drop
            </Link>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col md:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search drops..."
              className="input-field pl-9"
            />
          </div>

          <div className="flex gap-1">
            {STATUS_TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setStatusFilter(id)}
                className={`tab flex items-center gap-1.5 ${statusFilter === id ? 'tab-active' : ''}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="card overflow-hidden animate-pulse">
                <div className="h-40" style={{ background: 'var(--bg-secondary)' }} />
                <div className="p-3 space-y-2">
                  <div className="skeleton h-4 w-3/4" />
                  <div className="skeleton h-3 w-1/2" />
                  <div className="skeleton h-6 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <PackageOpen className="h-12 w-12 mb-3" style={{ color: 'var(--text-muted)' }} />
            <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              {searchQuery ? 'No drops match your search' : 'No drops yet'}
            </h3>
            <p className="text-xs mb-4 max-w-xs" style={{ color: 'var(--text-muted)' }}>
              Be the first to launch a scheduled NFT drop on BAZAAR.
            </p>
            {wallet?.isConnected && (
              <Link href="/drops/create" className="btn-primary text-xs px-4 py-2">
                Create Drop
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {sorted.map((drop, i) => (
              <DropCard key={drop.id} drop={drop} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
