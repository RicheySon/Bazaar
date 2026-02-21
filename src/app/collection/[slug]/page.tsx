'use client';

import { useState, useEffect } from 'react';
import { use } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Search, Grid3X3, LayoutList, Tag, Gavel, ExternalLink,
  Users, TrendingUp, Package, ArrowLeft, Copy, Check
} from 'lucide-react';
import { NFTCard } from '@/components/nft/NFTCard';
import { formatBCH, ipfsToHttp, shortenAddress, timeAgo } from '@/lib/utils';
import type { NFTListing, AuctionListing } from '@/lib/types';

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col px-4 py-3 border-r last:border-r-0" style={{ borderColor: 'var(--border)' }}>
      <span className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-sm font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>{value}</span>
      {sub && <span className="text-[11px] font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</span>}
    </div>
  );
}

export default function CollectionDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [collection, setCollection] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'fixed' | 'auction'>('all');
  const [sort, setSort] = useState<'price-low' | 'price-high' | 'newest'>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'items' | 'activity'>('items');

  useEffect(() => {
    const load = async (showLoading = false) => {
      if (showLoading) setIsLoading(true);
      try {
        const res = await fetch(`/api/collections/${slug}`);
        if (res.ok) {
          const data = await res.json();
          setCollection(data);
        }
      } catch {
        // ignore
      } finally {
        if (showLoading) setIsLoading(false);
      }
    };
    load(true);
    const interval = setInterval(() => load(false), 30000);
    return () => clearInterval(interval);
  }, [slug]);

  const copyAddress = () => {
    if (collection?.creatorAddress) {
      navigator.clipboard.writeText(collection.creatorAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
        <div className="skeleton h-48 w-full rounded-xl mb-4" />
        <div className="skeleton h-8 w-48 mb-2" />
        <div className="skeleton h-4 w-64 mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-16 rounded-lg" />)}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-64 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto text-center py-24">
        <Package className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
        <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Collection not found</div>
        <Link href="/collections" className="btn-secondary inline-flex items-center gap-2 mt-4 text-xs">
          <ArrowLeft className="h-3 w-3" /> Back to Collections
        </Link>
      </div>
    );
  }

  const imageUrl = collection.image ? ipfsToHttp(collection.image) : null;
  const floor = BigInt(collection.floorPrice || '0');
  const volume = BigInt(collection.totalVolume || '0');
  const listedPct = collection.totalSupply > 0
    ? Math.round((collection.listedCount / collection.totalSupply) * 100)
    : 0;

  // Build typed items list
  const allItems: (NFTListing | AuctionListing)[] = (collection.items || [])
    .filter((item: any) => item.status === 'active')
    .map((item: any) => {
      if (item.minBid !== undefined) {
        return {
          txid: item.txid, vout: 0, tokenCategory: item.tokenCategory,
          commitment: item.commitment || '', satoshis: 0,
          price: BigInt(item.currentBid || item.minBid || '0'),
          sellerAddress: item.seller, sellerPkh: item.sellerPkh || '',
          creatorAddress: item.creator || item.seller, creatorPkh: item.creatorPkh || '',
          royaltyBasisPoints: item.royaltyBasisPoints,
          status: item.status as 'active', listingType: 'auction' as const,
          minBid: BigInt(item.minBid || '0'),
          currentBid: BigInt(item.currentBid || '0'),
          currentBidder: item.currentBidder || '',
          endTime: item.endTime || 0,
          minBidIncrement: BigInt(item.minBidIncrement || '0'),
          bidHistory: item.bidHistory || [],
          metadata: item.metadata,
        } as AuctionListing;
      }
      return {
        txid: item.txid, vout: 0, tokenCategory: item.tokenCategory,
        commitment: item.commitment || '', satoshis: 0,
        price: BigInt(item.price || '0'),
        sellerAddress: item.seller, sellerPkh: item.sellerPkh || '',
        creatorAddress: item.creator || item.seller, creatorPkh: item.creatorPkh || '',
        royaltyBasisPoints: item.royaltyBasisPoints,
        status: item.status as 'active', listingType: 'fixed' as const,
        metadata: item.metadata,
      } as NFTListing;
    });

  // Also include sold/historical items for activity feed
  const historyItems = (collection.items || [])
    .filter((item: any) => item.status !== 'active')
    .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const filtered = allItems
    .filter((item) => {
      if (filter === 'fixed' && item.listingType !== 'fixed') return false;
      if (filter === 'auction' && item.listingType !== 'auction') return false;
      if (search) {
        const q = search.toLowerCase();
        return item.metadata?.name?.toLowerCase().includes(q)
          || item.tokenCategory?.includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === 'price-low') return Number(a.price - b.price);
      if (sort === 'price-high') return Number(b.price - a.price);
      return 0;
    });

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* Banner */}
      <div className="relative h-48 sm:h-64 overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
        {imageUrl && (
          <Image src={imageUrl} alt={collection.name} fill className="object-cover opacity-40" />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 40%, var(--bg-primary))' }} />
        <div className="absolute bottom-0 left-0 px-4 sm:px-6 pb-4 flex items-end gap-4">
          {/* Collection Icon */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border-2 shrink-0"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
            {imageUrl ? (
              <Image src={imageUrl} alt={collection.name} width={80} height={80} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-2xl font-black font-mono" style={{ color: 'var(--accent)' }}>
                  {collection.name.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
          </div>
          <div className="mb-1">
            <h1 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {collection.name}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>by</span>
              <button
                onClick={copyAddress}
                className="flex items-center gap-1 text-xs font-mono hover:text-[var(--accent)] transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                {shortenAddress(collection.creatorAddress, 6)}
                {copied ? <Check className="h-3 w-3 text-[var(--accent)]" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          </div>
        </div>
        {/* Back button */}
        <Link href="/collections"
          className="absolute top-4 left-4 sm:left-6 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg backdrop-blur-sm transition-colors hover:bg-[var(--bg-hover)]"
          style={{ background: 'rgba(0,0,0,0.4)', color: 'var(--text-secondary)' }}>
          <ArrowLeft className="h-3.5 w-3.5" /> Collections
        </Link>
      </div>

      <div className="px-4 sm:px-6">
        {/* Stats Bar */}
        <div className="card overflow-hidden flex flex-wrap my-4 divide-x divide-[var(--border)]">
          <StatBox label="Floor Price" value={floor > 0n ? formatBCH(floor) : '--'} />
          <StatBox label="Total Volume" value={volume > 0n ? formatBCH(volume) : '--'} />
          <StatBox label="Supply" value={collection.totalSupply?.toString() || '0'} />
          <StatBox label="Listed" value={`${collection.listedCount}`} sub={`${listedPct}% of supply`} />
          <StatBox label="Owners" value={collection.ownerCount?.toString() || '0'} />
          <StatBox label="Royalty" value={`${(collection.royaltyBasisPoints || 0) / 100}%`} />
        </div>

        {/* Description */}
        {collection.items?.[0]?.metadata?.description && (
          <p className="text-sm mb-6 max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
            {collection.items[0].metadata.description}
          </p>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-4 border-b" style={{ borderColor: 'var(--border)' }}>
          {(['items', 'activity'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {tab} {tab === 'items' ? `(${filtered.length})` : `(${historyItems.length})`}
            </button>
          ))}
        </div>

        {activeTab === 'items' && (
          <>
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search items..."
                  className="input-field pl-9"
                />
              </div>
              <div className="flex items-center gap-2">
                {/* Type filter */}
                <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                  {[
                    { v: 'all', icon: Package, label: 'All' },
                    { v: 'fixed', icon: Tag, label: 'Fixed' },
                    { v: 'auction', icon: Gavel, label: 'Auction' },
                  ].map(({ v, icon: Icon, label }) => (
                    <button
                      key={v}
                      onClick={() => setFilter(v as any)}
                      title={label}
                      className={`p-1.5 rounded-md transition-colors flex items-center gap-1 text-xs px-2 ${
                        filter === v ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                      }`}
                      style={filter === v ? { background: 'var(--bg-hover)' } : {}}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  ))}
                </div>
                {/* Sort */}
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as any)}
                  className="input-field text-xs w-36"
                >
                  <option value="newest" style={{ background: 'var(--bg-secondary)' }}>Newest</option>
                  <option value="price-low" style={{ background: 'var(--bg-secondary)' }}>Price: Low</option>
                  <option value="price-high" style={{ background: 'var(--bg-secondary)' }}>Price: High</option>
                </select>
                {/* View mode */}
                <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                  <button onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}
                    style={viewMode === 'grid' ? { background: 'var(--bg-hover)' } : {}}>
                    <Grid3X3 className="h-4 w-4" />
                  </button>
                  <button onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}
                    style={viewMode === 'list' ? { background: 'var(--bg-hover)' } : {}}>
                    <LayoutList className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="card p-12 text-center mb-6">
                <Package className="h-8 w-8 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {search ? 'No items match your search' : 'No active listings in this collection'}
                </div>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-6">
                {filtered.map((item, i) => (
                  <NFTCard key={item.txid} listing={item} index={i} />
                ))}
              </div>
            ) : (
              <div className="card overflow-hidden mb-6">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="text-right">Price</th>
                      <th className="text-right hidden sm:table-cell">Top Bid</th>
                      <th className="text-right hidden md:table-cell">Owner</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => (
                      <tr key={item.txid}>
                        <td>
                          <Link href={item.listingType === 'auction' ? `/auction/${item.txid}` : `/nft/${item.txid}`}
                            className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0"
                              style={{ background: 'var(--bg-hover)' }}>
                              {item.metadata?.image && (
                                <Image src={ipfsToHttp(item.metadata.image)} alt={item.metadata.name || 'NFT'}
                                  width={40} height={40} className="w-full h-full object-cover" />
                              )}
                            </div>
                            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                              {item.metadata?.name || `Token #${item.tokenCategory?.slice(0, 8)}`}
                            </span>
                          </Link>
                        </td>
                        <td className="text-right">
                          <span className="text-sm font-mono" style={{ color: 'var(--accent)' }}>
                            {formatBCH(item.price)}
                          </span>
                        </td>
                        <td className="text-right hidden sm:table-cell">
                          <span className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>--</span>
                        </td>
                        <td className="text-right hidden md:table-cell">
                          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                            {shortenAddress(item.sellerAddress, 4)}
                          </span>
                        </td>
                        <td className="text-right">
                          <Link
                            href={item.listingType === 'auction' ? `/auction/${item.txid}` : `/nft/${item.txid}`}
                            className="btn-primary text-xs px-3 py-1"
                          >
                            {item.listingType === 'auction' ? 'Bid' : 'Buy'}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {activeTab === 'activity' && (
          <div className="card overflow-hidden mb-6">
            {historyItems.length === 0 ? (
              <div className="p-12 text-center">
                <TrendingUp className="h-8 w-8 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>No activity yet</div>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Item</th>
                    <th className="text-right">Price</th>
                    <th className="text-right hidden sm:table-cell">From</th>
                    <th className="text-right hidden md:table-cell">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {historyItems.slice(0, 50).map((item: any) => (
                    <tr key={item.txid}>
                      <td>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                          item.status === 'sold' ? 'text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' :
                          item.status === 'cancelled' ? 'text-[var(--text-muted)] bg-[var(--bg-hover)]' :
                          'text-[var(--accent-blue)] bg-[color-mix(in_srgb,var(--accent-blue)_10%,transparent)]'
                        }`}>
                          {item.status === 'sold' ? 'Sale' : item.status === 'cancelled' ? 'Cancelled' : 'Ended'}
                        </span>
                      </td>
                      <td>
                        <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                          {item.metadata?.name || `Token #${item.tokenCategory?.slice(0, 8)}`}
                        </span>
                      </td>
                      <td className="text-right">
                        <span className="text-sm font-mono" style={{ color: 'var(--accent)' }}>
                          {formatBCH(BigInt(item.price || item.currentBid || '0'))}
                        </span>
                      </td>
                      <td className="text-right hidden sm:table-cell">
                        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                          {shortenAddress(item.seller || '', 4)}
                        </span>
                      </td>
                      <td className="text-right hidden md:table-cell">
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {item.updatedAt ? timeAgo(item.updatedAt / 1000) : '--'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
