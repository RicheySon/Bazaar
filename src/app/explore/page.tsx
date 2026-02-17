'use client';

import { useState, useEffect } from 'react';
import { Search, Grid3X3, LayoutList, Tag, Gavel, Sparkles, SlidersHorizontal } from 'lucide-react';
import { NFTGrid } from '@/components/nft/NFTGrid';
import { useNFTStore } from '@/lib/store/nft-store';
import { fetchMarketplaceListings } from '@/lib/bch/api-client';
import type { ListingFilter, SortOption, NFTListing, AuctionListing } from '@/lib/types';

export default function ExplorePage() {
  const { listings, auctions, isLoading, filter, sort, searchQuery, setFilter, setSort, setSearchQuery, setLoading, setListings, setAuctions } = useNFTStore();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    const loadListings = async () => {
      setLoading(true);
      try {
        const data = await fetchMarketplaceListings();
        if (data) {
          const apiListings: NFTListing[] = data.listings.map((l) => ({
            txid: l.txid, vout: 0, tokenCategory: l.tokenCategory,
            commitment: l.commitment || '', satoshis: 0, price: BigInt(l.price),
            sellerAddress: l.seller, sellerPkh: l.sellerPkh || '', creatorAddress: l.creator || l.seller,
            creatorPkh: l.creatorPkh || '', royaltyBasisPoints: l.royaltyBasisPoints,
            status: 'active' as const, listingType: 'fixed' as const,
            metadata: l.metadata,
          }));
          const apiAuctions = data.auctions.map((a) => ({
            txid: a.txid, vout: 0, tokenCategory: a.tokenCategory,
            commitment: a.commitment || '', satoshis: 0, price: BigInt(a.currentBid || a.minBid),
            sellerAddress: a.seller, sellerPkh: a.sellerPkh || '', creatorAddress: a.creator || a.seller,
            creatorPkh: a.creatorPkh || '', royaltyBasisPoints: a.royaltyBasisPoints,
            status: (a.status || 'active') as any, listingType: 'auction' as const,
            minBid: BigInt(a.minBid || '0'),
            currentBid: BigInt(a.currentBid || '0'),
            currentBidder: a.currentBidder || '',
            endTime: a.endTime || 0,
            minBidIncrement: BigInt(a.minBidIncrement || '0'),
            bidHistory: a.bidHistory || [],
            metadata: a.metadata,
          }));
          setListings(apiListings);
          setAuctions(apiAuctions);
        }
      } catch (err) {
        console.error('Failed to load listings:', err);
      } finally {
        setLoading(false);
      }
    };
    loadListings();
    const interval = setInterval(loadListings, 10000);
    return () => clearInterval(interval);
  }, [setLoading, setListings, setAuctions]);

  const allListings: (NFTListing | AuctionListing)[] = [...listings, ...auctions];

  const filtered = allListings.filter((item) => {
    if (filter === 'fixed' && item.listingType !== 'fixed') return false;
    if (filter === 'auction' && item.listingType !== 'auction') return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const name = item.metadata?.name?.toLowerCase() || '';
      const desc = item.metadata?.description?.toLowerCase() || '';
      return name.includes(q) || desc.includes(q) || item.tokenCategory?.includes(q);
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case 'price-low': return Number(a.price - b.price);
      case 'price-high': return Number(b.price - a.price);
      case 'ending-soon':
        if ('endTime' in a && 'endTime' in b) return (a as AuctionListing).endTime - (b as AuctionListing).endTime;
        return 0;
      default: return 0;
    }
  });

  const filters: { value: ListingFilter; label: string; icon: typeof Tag }[] = [
    { value: 'all', label: 'All', icon: Sparkles },
    { value: 'fixed', label: 'Fixed Price', icon: Tag },
    { value: 'auction', label: 'Auctions', icon: Gavel },
  ];

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'newest', label: 'Newest' },
    { value: 'price-low', label: 'Price: Low to High' },
    { value: 'price-high', label: 'Price: High to Low' },
    { value: 'ending-soon', label: 'Ending Soon' },
  ];

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="mx-auto max-w-[1400px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Explore NFTs</h1>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Discover CashTokens NFTs on Bitcoin Cash Chipnet
            </p>
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {isLoading ? 'Loading...' : `${sorted.length} item${sorted.length !== 1 ? 's' : ''}`}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col md:flex-row gap-3 mb-6">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, description, or token ID..."
              className="input-field pl-9"
            />
          </div>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="input-field w-full md:w-48 cursor-pointer"
          >
            {sortOptions.map(({ value, label }) => (
              <option key={value} value={value} style={{ background: 'var(--bg-secondary)' }}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Filter Tabs + View Mode */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-1.5">
            {filters.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`tab flex items-center gap-1.5 ${filter === value ? 'tab-active' : ''}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'grid' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
              }`}
              style={viewMode === 'grid' ? { background: 'var(--bg-hover)' } : {}}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'list' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
              }`}
              style={viewMode === 'list' ? { background: 'var(--bg-hover)' } : {}}
            >
              <LayoutList className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* NFT Grid */}
        <NFTGrid
          listings={sorted}
          isLoading={isLoading}
          emptyMessage={searchQuery ? 'No NFTs match your search' : 'No NFTs listed yet'}
        />
      </div>
    </div>
  );
}
