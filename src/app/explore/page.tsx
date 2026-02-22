'use client';

import { useState, useEffect } from 'react';
import { Search, PackageOpen } from 'lucide-react';
import { CollectionCard } from '@/components/nft/CollectionCard';

export default function ExplorePage() {
  const [collections, setCollections] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<'volume' | 'floor-low' | 'floor-high' | 'newest'>('volume');

  useEffect(() => {
    const load = async (showLoading = false) => {
      if (showLoading) setIsLoading(true);
      try {
        const res = await fetch('/api/collections');
        const data = await res.json();
        setCollections(data.collections || []);
      } catch {
        setCollections([]);
      } finally {
        if (showLoading) setIsLoading(false);
      }
    };
    load(true);
    const interval = setInterval(() => load(false), 30000);
    return () => clearInterval(interval);
  }, []);

  const filtered = collections.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.creatorAddress?.toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case 'floor-low': return Number(BigInt(a.floorPrice || '0') - BigInt(b.floorPrice || '0'));
      case 'floor-high': return Number(BigInt(b.floorPrice || '0') - BigInt(a.floorPrice || '0'));
      case 'newest': return (b.createdAt || 0) - (a.createdAt || 0);
      default: return Number(BigInt(b.totalVolume || '0') - BigInt(a.totalVolume || '0'));
    }
  });

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="mx-auto max-w-[1400px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Explore Collections</h1>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Discover CashTokens NFT collections on Bitcoin Cash Chipnet
            </p>
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {isLoading ? 'Loading...' : `${sorted.length} collection${sorted.length !== 1 ? 's' : ''}`}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col md:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search collections..."
              className="input-field pl-9"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as any)}
            className="input-field w-full md:w-48 cursor-pointer"
          >
            <option value="volume" style={{ background: 'var(--bg-secondary)' }}>Volume: High to Low</option>
            <option value="floor-low" style={{ background: 'var(--bg-secondary)' }}>Floor: Low to High</option>
            <option value="floor-high" style={{ background: 'var(--bg-secondary)' }}>Floor: High to Low</option>
            <option value="newest" style={{ background: 'var(--bg-secondary)' }}>Newest</option>
          </select>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="card overflow-hidden animate-pulse">
                <div className="h-32" style={{ background: 'var(--bg-secondary)' }} />
                <div className="p-3 space-y-2">
                  <div className="skeleton h-4 w-3/4" />
                  <div className="skeleton h-3 w-1/2" />
                  <div className="skeleton h-8" />
                </div>
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <PackageOpen className="h-12 w-12 mb-3" style={{ color: 'var(--text-muted)' }} />
            <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              {searchQuery ? 'No collections match your search' : 'No collections yet'}
            </h3>
            <p className="text-xs max-w-sm" style={{ color: 'var(--text-muted)' }}>
              Be the first to create and list an NFT on BAZAAR.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {sorted.map((col, i) => (
              <CollectionCard key={col.slug} collection={col} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
