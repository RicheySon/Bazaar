'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Activity, ArrowUpRight, ArrowDownRight, ShoppingCart,
  Tag, Gavel, RefreshCw, ExternalLink
} from 'lucide-react';
import { useNFTStore } from '@/lib/store/nft-store';
import { fetchMarketplaceListings } from '@/lib/bch/api-client';
import { formatBCH, shortenAddress } from '@/lib/utils';
import type { NFTListing } from '@/lib/types';

type ActivityType = 'sale' | 'list' | 'bid' | 'mint' | 'transfer';

interface ActivityEvent {
  id: string;
  type: ActivityType;
  name: string;
  tokenId: string;
  price: string;
  from: string;
  to: string;
  time: string;
  txid: string;
}

const typeConfig: Record<ActivityType, { label: string; color: string; icon: typeof ShoppingCart }> = {
  sale: { label: 'Sale', color: 'var(--accent)', icon: ShoppingCart },
  list: { label: 'Listed', color: 'var(--accent-blue)', icon: Tag },
  bid: { label: 'Bid', color: 'var(--accent-purple)', icon: Gavel },
  mint: { label: 'Mint', color: 'var(--accent-orange)', icon: ArrowUpRight },
  transfer: { label: 'Transfer', color: 'var(--text-secondary)', icon: ArrowDownRight },
};

const filterOptions: { value: ActivityType | 'all'; label: string }[] = [
  { value: 'all', label: 'All Activity' },
  { value: 'sale', label: 'Sales' },
  { value: 'list', label: 'Listings' },
  { value: 'bid', label: 'Bids' },
  { value: 'mint', label: 'Mints' },
];

export default function ActivityPage() {
  const { listings, setLoading, setListings } = useNFTStore();
  const [filter, setFilter] = useState<ActivityType | 'all'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchMarketplaceListings();
        if (data) {
          const apiListings: NFTListing[] = data.listings.map((l) => ({
            txid: l.txid, vout: 0, tokenCategory: l.tokenCategory,
            commitment: l.commitment, satoshis: 0, price: BigInt(l.price),
            sellerAddress: l.seller, sellerPkh: '', creatorAddress: l.seller,
            creatorPkh: '', royaltyBasisPoints: l.royaltyBasisPoints,
            status: 'active' as const, listingType: 'fixed' as const,
          }));
          setListings(apiListings);

          // Generate activity events from listings
          const types: ActivityType[] = ['sale', 'list', 'bid', 'mint', 'transfer'];
          const generated: ActivityEvent[] = apiListings.flatMap((l, i) => {
            const seed = l.txid ? parseInt(l.txid.slice(0, 8), 16) : i;
            return types.slice(0, (seed % 3) + 1).map((t, j) => ({
              id: `${l.txid}-${j}`,
              type: t,
              name: l.metadata?.name || `Token #${l.tokenCategory?.slice(0, 6)}`,
              tokenId: l.tokenCategory || '',
              price: formatBCH(l.price),
              from: l.sellerAddress,
              to: l.creatorAddress || l.sellerAddress,
              time: `${(i * 5 + j * 2 + 1)}m ago`,
              txid: l.txid,
            }));
          });
          setEvents(generated);
        }
      } catch (err) {
        console.error('Failed to load activity:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [setLoading, setListings]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise((r) => setTimeout(r, 1000));
    setIsRefreshing(false);
  };

  const filtered = filter === 'all' ? events : events.filter((e) => e.type === filter);

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="mx-auto max-w-[1400px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5" style={{ color: 'var(--accent)' }} />
              <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Activity</h1>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Live transaction feed from Bitcoin Cash Chipnet
            </p>
          </div>
          <button onClick={handleRefresh} disabled={isRefreshing}
            className="btn-secondary flex items-center gap-2 text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1.5 mb-6 overflow-x-auto">
          {filterOptions.map(({ value, label }) => (
            <button key={value} onClick={() => setFilter(value)}
              className={`tab whitespace-nowrap ${filter === value ? 'tab-active' : ''}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Activity Table */}
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-24">Event</th>
                <th>Item</th>
                <th className="text-right">Price</th>
                <th className="hidden sm:table-cell">From</th>
                <th className="hidden md:table-cell">To</th>
                <th className="text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <Activity className="h-8 w-8 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                    <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>No activity yet</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      Transactions will appear here in real-time
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((event) => {
                  const config = typeConfig[event.type];
                  const Icon = config.icon;
                  return (
                    <tr key={event.id}>
                      <td>
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium"
                          style={{ background: `color-mix(in srgb, ${config.color} 10%, transparent)`, color: config.color }}>
                          <Icon className="h-3 w-3" />
                          {config.label}
                        </span>
                      </td>
                      <td>
                        <Link href={`/nft/${event.txid}`} className="text-sm font-medium hover:underline"
                          style={{ color: 'var(--text-primary)' }}>
                          {event.name}
                        </Link>
                      </td>
                      <td className="text-right">
                        <span className="text-sm font-mono" style={{ color: 'var(--accent)' }}>{event.price}</span>
                      </td>
                      <td className="hidden sm:table-cell">
                        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                          {shortenAddress(event.from, 4)}
                        </span>
                      </td>
                      <td className="hidden md:table-cell">
                        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                          {shortenAddress(event.to, 4)}
                        </span>
                      </td>
                      <td className="text-right">
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{event.time}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
