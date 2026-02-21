'use client';

import { useState, useEffect } from 'react';
import { Search, Grid3X3, LayoutList, TrendingUp, ArrowUpRight } from 'lucide-react';
import { CollectionCard } from '@/components/nft/CollectionCard';
import { formatBCH, shortenAddress, ipfsToHttp } from '@/lib/utils';
import Image from 'next/image';
import Link from 'next/link';

type SortKey = 'volume' | 'floor' | 'supply' | 'listed' | 'newest';

export default function CollectionsPage() {
  const [collections, setCollections] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('volume');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');

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

  const filtered = collections
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return c.name?.toLowerCase().includes(q) || c.creatorAddress?.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      switch (sort) {
        case 'volume': return Number(BigInt(b.totalVolume || '0') - BigInt(a.totalVolume || '0'));
        case 'floor': return Number(BigInt(b.floorPrice || '0') - BigInt(a.floorPrice || '0'));
        case 'supply': return (b.totalSupply || 0) - (a.totalSupply || 0);
        case 'listed': return (b.listedCount || 0) - (a.listedCount || 0);
        case 'newest': return (b.createdAt || 0) - (a.createdAt || 0);
        default: return 0;
      }
    });

  const sortOptions: { value: SortKey; label: string }[] = [
    { value: 'volume', label: 'Volume' },
    { value: 'floor', label: 'Floor Price' },
    { value: 'supply', label: 'Supply' },
    { value: 'listed', label: 'Listed' },
    { value: 'newest', label: 'Newest' },
  ];

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="mx-auto max-w-[1400px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              Collections
            </h1>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              CashTokens NFT collections on Bitcoin Cash Chipnet
            </p>
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {isLoading ? 'Loading...' : `${filtered.length} collection${filtered.length !== 1 ? 's' : ''}`}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search collections..."
              className="input-field pl-9"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="input-field w-full sm:w-48 cursor-pointer"
          >
            {sortOptions.map(({ value, label }) => (
              <option key={value} value={value} style={{ background: 'var(--bg-secondary)' }}>
                Sort: {label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1 p-0.5 rounded-lg shrink-0" style={{ background: 'var(--bg-secondary)' }}>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'table' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}
              style={viewMode === 'table' ? { background: 'var(--bg-hover)' } : {}}
            >
              <LayoutList className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}
              style={viewMode === 'grid' ? { background: 'var(--bg-hover)' } : {}}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          viewMode === 'table' ? (
            <div className="card overflow-hidden">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-10">#</th>
                    <th>Collection</th>
                    <th className="text-right">Floor</th>
                    <th className="text-right hidden sm:table-cell">Volume</th>
                    <th className="text-right hidden md:table-cell">Supply</th>
                    <th className="text-right hidden md:table-cell">Listed</th>
                    <th className="text-right hidden lg:table-cell">Owners</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td><div className="skeleton h-4 w-4" /></td>
                      <td><div className="flex items-center gap-3"><div className="skeleton w-10 h-10 rounded-lg" /><div className="skeleton h-4 w-32" /></div></td>
                      <td className="text-right"><div className="skeleton h-4 w-16 ml-auto" /></td>
                      <td className="text-right hidden sm:table-cell"><div className="skeleton h-4 w-16 ml-auto" /></td>
                      <td className="text-right hidden md:table-cell"><div className="skeleton h-4 w-10 ml-auto" /></td>
                      <td className="text-right hidden md:table-cell"><div className="skeleton h-4 w-10 ml-auto" /></td>
                      <td className="text-right hidden lg:table-cell"><div className="skeleton h-4 w-10 ml-auto" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="card overflow-hidden">
                  <div className="skeleton h-32 w-full" />
                  <div className="p-3 space-y-2">
                    <div className="skeleton h-4 w-3/4" />
                    <div className="skeleton h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )
        ) : filtered.length === 0 ? (
          <div className="card p-16 text-center">
            <TrendingUp className="h-10 w-10 mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
            <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              {search ? 'No collections match your search' : 'No collections yet'}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Create and list your first NFT collection
            </div>
            <Link href="/create" className="btn-primary inline-flex items-center gap-2 mt-4 text-xs">
              Create NFT <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        ) : viewMode === 'table' ? (
          <div className="card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  <th>Collection</th>
                  <th className="text-right cursor-pointer" onClick={() => setSort('floor')}>
                    Floor {sort === 'floor' && '↓'}
                  </th>
                  <th className="text-right hidden sm:table-cell cursor-pointer" onClick={() => setSort('volume')}>
                    Volume {sort === 'volume' && '↓'}
                  </th>
                  <th className="text-right hidden md:table-cell cursor-pointer" onClick={() => setSort('supply')}>
                    Supply {sort === 'supply' && '↓'}
                  </th>
                  <th className="text-right hidden md:table-cell cursor-pointer" onClick={() => setSort('listed')}>
                    Listed {sort === 'listed' && '↓'}
                  </th>
                  <th className="text-right hidden lg:table-cell">Owners</th>
                  <th className="text-right hidden lg:table-cell">Royalty</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((col, i) => {
                  const imageUrl = col.image ? ipfsToHttp(col.image) : null;
                  const floor = BigInt(col.floorPrice || '0');
                  const vol = BigInt(col.totalVolume || '0');
                  const listedPct = col.totalSupply > 0
                    ? Math.round((col.listedCount / col.totalSupply) * 100)
                    : 0;
                  return (
                    <tr key={col.slug} className="cursor-pointer">
                      <td className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                      <td>
                        <Link href={`/collection/${col.slug}`} className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
                            style={{ background: 'var(--bg-hover)' }}>
                            {imageUrl ? (
                              <Image src={imageUrl} alt={col.name} width={40} height={40} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs font-bold" style={{ color: 'var(--accent)' }}>
                                {col.name.slice(0, 2).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div>
                            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{col.name}</div>
                            <div className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                              {shortenAddress(col.creatorAddress, 4)}
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="text-right">
                        <span className="text-sm font-mono" style={{ color: 'var(--accent)' }}>
                          {floor > 0n ? formatBCH(floor) : '--'}
                        </span>
                      </td>
                      <td className="text-right hidden sm:table-cell">
                        <span className="text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>
                          {vol > 0n ? formatBCH(vol) : '--'}
                        </span>
                      </td>
                      <td className="text-right hidden md:table-cell">
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{col.totalSupply}</span>
                      </td>
                      <td className="text-right hidden md:table-cell">
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {col.listedCount} <span style={{ color: 'var(--text-muted)' }}>({listedPct}%)</span>
                        </span>
                      </td>
                      <td className="text-right hidden lg:table-cell">
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{col.ownerCount}</span>
                      </td>
                      <td className="text-right hidden lg:table-cell">
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {col.royaltyBasisPoints / 100}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map((col, i) => (
              <CollectionCard key={col.slug} collection={col} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
