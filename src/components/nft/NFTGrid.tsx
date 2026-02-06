'use client';

import { NFTCard } from './NFTCard';
import { PackageOpen } from 'lucide-react';
import type { NFTListing, AuctionListing } from '@/lib/types';

interface NFTGridProps {
  listings: (NFTListing | AuctionListing)[];
  isLoading?: boolean;
  emptyMessage?: string;
}

export function NFTGrid({ listings, isLoading, emptyMessage = 'No NFTs found' }: NFTGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="card overflow-hidden animate-pulse">
            <div className="aspect-square" style={{ background: 'var(--bg-secondary)' }} />
            <div className="p-3 space-y-2">
              <div className="skeleton h-4 w-3/4" />
              <div className="skeleton h-3 w-1/2" />
              <div className="skeleton h-5 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <PackageOpen className="h-12 w-12 mb-3" style={{ color: 'var(--text-muted)' }} />
        <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{emptyMessage}</h3>
        <p className="text-xs max-w-sm" style={{ color: 'var(--text-muted)' }}>
          Be the first to list an NFT on BAZAAR. Create and mint your CashTokens NFT to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {listings.map((listing, index) => (
        <NFTCard key={listing.txid} listing={listing} index={index} />
      ))}
    </div>
  );
}
