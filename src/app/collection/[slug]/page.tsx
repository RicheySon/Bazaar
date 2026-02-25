'use client';

import { use, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Search, Grid3X3, LayoutList, Tag, Gavel, ExternalLink,
  Users, TrendingUp, Package, ArrowLeft, Copy, Check, Zap
} from 'lucide-react';
import { NFTCard } from '@/components/nft/NFTCard';
import { VerifiedBadge } from '@/components/nft/VerifiedBadge';
import { SweepModal } from '@/components/nft/SweepModal';
import { CollectionBidModal } from '@/components/nft/CollectionBidModal';
import { CancelBidModal } from '@/components/nft/CancelBidModal';
import { formatBCH, ipfsToHttp, shortenAddress, timeAgo } from '@/lib/utils';
import { useWalletStore } from '@/lib/store/wallet-store';
import type { NFTListing, AuctionListing, CollectionBid } from '@/lib/types';

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col px-4 py-3 border-r last:border-r-0" style={{ borderColor: 'var(--border)' }}>
      <span className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-sm font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>{value}</span>
      {sub && <span className="text-[11px] font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</span>}
    </div>
  );
}

type PriceWallBucket = {
  start: bigint;
  end: bigint;
  count: number;
  sum: bigint;
};

function buildPriceWall(items: NFTListing[], bins = 12) {
  if (items.length === 0) return null;
  let min = items[0].price;
  let max = items[0].price;
  let total = 0n;
  for (const item of items) {
    if (item.price < min) min = item.price;
    if (item.price > max) max = item.price;
    total += item.price;
  }

  const avg = total / BigInt(items.length);
  const span = max - min;
  const spanBuckets = span < BigInt(bins) ? Number(span) + 1 : bins;
  const bucketCount = Math.max(1, Math.min(bins, items.length, spanBuckets));
  const bucketSize = bucketCount > 1 ? span / BigInt(bucketCount) : 1n;
  const step = bucketSize > 0n ? bucketSize : 1n;

  const buckets: PriceWallBucket[] = Array.from({ length: bucketCount }, (_, i) => {
    const start = min + step * BigInt(i);
    const end = i === bucketCount - 1 ? max : start + step;
    return { start, end, count: 0, sum: 0n };
  });

  for (const item of items) {
    let idx = Number((item.price - min) / step);
    if (idx < 0) idx = 0;
    if (idx >= bucketCount) idx = bucketCount - 1;
    buckets[idx].count += 1;
    buckets[idx].sum += item.price;
  }

  let maxSum = 0n;
  for (const bucket of buckets) {
    if (bucket.sum > maxSum) maxSum = bucket.sum;
  }

  return { buckets, min, max, total, avg, maxSum };
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
  const [isVerified, setIsVerified] = useState(false);
  const [sweepMode, setSweepMode] = useState(false);
  const [selectedTxids, setSelectedTxids] = useState<Set<string>>(new Set());
  const [isSweepModalOpen, setIsSweepModalOpen] = useState(false);
  const [isBidModalOpen, setIsBidModalOpen] = useState(false);
  const [cancelBid, setCancelBid] = useState<CollectionBid | null>(null);

  const { connectionType, wallet } = useWalletStore();

  useEffect(() => {
    const load = async (showLoading = false) => {
      if (showLoading) setIsLoading(true);
      try {
        const res = await fetch(`/api/collections/${slug}`);
        if (res.ok) {
          const data = await res.json();
          setCollection(data);
          // BCMR verification check
          const bcmrUrl = data.items?.[0]?.metadata?.bcmrUrl;
          const category = data.tokenCategory;
          if (bcmrUrl && category) {
            fetch(`/api/bcmr?url=${encodeURIComponent(bcmrUrl)}&category=${encodeURIComponent(category)}`)
              .then((r) => r.json())
              .then(({ verified }) => setIsVerified(!!verified))
              .catch(() => {});
          }
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

  // Sweep helpers
  const sweepableItems = allItems
    .filter((i): i is NFTListing => i.listingType === 'fixed')
    .sort((a, b) => Number(a.price - b.price));
  const selectedListings = sweepableItems.filter((i) => selectedTxids.has(i.txid));
  const sweepTotal = selectedListings.reduce((s, l) => s + l.price, 0n);
  const collectionBids = (collection?.bids || []) as CollectionBid[];
  const activeBids = collectionBids.filter((b) => b.status === 'active' && !!b.bidSalt);
  const orderedBids = activeBids
    .slice()
    .sort((a, b) => (BigInt(b.price) > BigInt(a.price) ? 1 : BigInt(b.price) < BigInt(a.price) ? -1 : 0));
  const bestBid = orderedBids[0];
  const priceWall = buildPriceWall(sweepableItems, 12);
  const selectNCheapest = (n: number) =>
    setSelectedTxids(new Set(sweepableItems.slice(0, n).map((l) => l.txid)));
  const selectAll = () => setSelectedTxids(new Set(sweepableItems.map((l) => l.txid)));
  const toggleItem = (txid: string) =>
    setSelectedTxids((prev) => {
      const next = new Set(prev);
      if (next.has(txid)) next.delete(txid);
      else next.add(txid);
      return next;
    });

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
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {collection.name}
              </h1>
              {isVerified && <VerifiedBadge size="md" />}
            </div>
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

        {/* Price Wall */}
        <div className="card p-4 mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Price Wall</div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Fixed listings depth by price band.
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex flex-col">
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Listings</span>
                <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {sweepableItems.length}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Total Ask</span>
                <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {priceWall ? formatBCH(priceWall.total) : '--'}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Avg</span>
                <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {priceWall ? formatBCH(priceWall.avg) : '--'}
                </span>
              </div>
            </div>
          </div>

          {priceWall ? (
            <>
              <div className="mt-4 grid grid-cols-12 gap-2 items-end h-28">
                {priceWall.buckets.map((bucket, idx) => {
                  const heightPct = priceWall.maxSum > 0n && bucket.sum > 0n
                    ? Math.max(6, Number((bucket.sum * 100n) / priceWall.maxSum))
                    : 0;
                  const label = `${formatBCH(bucket.start)} - ${formatBCH(bucket.end)} (${bucket.count})`;
                  return (
                    <div key={`${bucket.start.toString()}-${idx}`} className="h-full flex items-end">
                      <div
                        title={label}
                        className="w-full rounded-md transition-all"
                        style={{
                          height: `${heightPct}%`,
                          background: 'linear-gradient(180deg, var(--accent) 0%, rgba(0, 229, 69, 0.35) 100%)',
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] font-mono"
                style={{ color: 'var(--text-muted)' }}>
                <span>{formatBCH(priceWall.min)}</span>
                <span>{formatBCH(priceWall.max)}</span>
              </div>
            </>
          ) : (
            <div className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
              No fixed listings to plot yet.
            </div>
          )}
        </div>

        {/* Collection Bids */}
        <div className="card p-4 mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Collection Bids</div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Live buy offers for any NFT in this collection.
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex flex-col">
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Best Bid</span>
                <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {bestBid ? formatBCH(BigInt(bestBid.price)) : '--'}
                </span>
              </div>
              {collection.tokenCategory && collection.creatorPkh && connectionType !== 'walletconnect' && (
                <button
                  onClick={() => setIsBidModalOpen(true)}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium text-white"
                  style={{ background: 'var(--accent)' }}
                >
                  Place Bid
                </button>
              )}
            </div>
          </div>

          {!collection.tokenCategory ? (
            <div className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
              Bids are available for single-category collections only.
            </div>
          ) : orderedBids.length === 0 ? (
            <div className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
              No active bids yet.
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border)' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Bid</th>
                    <th className="text-right">Bidder</th>
                    <th className="text-right hidden sm:table-cell">Age</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orderedBids.slice(0, 5).map((bid) => (
                    <tr key={bid.txid}>
                      <td>
                        <span className="text-sm font-mono" style={{ color: 'var(--accent)' }}>
                          {formatBCH(BigInt(bid.price))}
                        </span>
                      </td>
                      <td className="text-right">
                        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                          {shortenAddress(bid.bidder || '', 4)}
                        </span>
                      </td>
                      <td className="text-right hidden sm:table-cell">
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {bid.createdAt ? timeAgo(bid.createdAt / 1000) : '--'}
                        </span>
                      </td>
                      <td className="text-right">
                        {wallet?.address && bid.bidder === wallet.address && connectionType !== 'walletconnect' ? (
                          <button
                            onClick={() => setCancelBid(bid)}
                            className="text-xs px-2.5 py-1 rounded-lg border transition-colors hover:border-[var(--accent-red)] hover:text-[var(--accent-red)]"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                          >
                            Cancel
                          </button>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>--</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

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
            {/* Sweep Mode toolbar */}
            {sweepableItems.length > 0 && connectionType !== 'walletconnect' && (
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <button
                  onClick={() => { setSweepMode((s) => !s); setSelectedTxids(new Set()); }}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    sweepMode
                      ? 'text-white'
                      : 'border hover:border-[var(--accent)] hover:text-[var(--accent)]'
                  }`}
                  style={sweepMode
                    ? { background: 'var(--accent)' }
                    : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  <Zap className="h-3.5 w-3.5" />
                  {sweepMode ? 'Exit Sweep' : 'Sweep Mode'}
                </button>
                {sweepMode && (
                  <>
                    {([5, 10, 20] as const).filter((n) => sweepableItems.length >= n).map((n) => (
                      <button
                        key={n}
                        onClick={() => selectNCheapest(n)}
                        className="text-xs px-2.5 py-1.5 rounded-lg border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                      >
                        {n} Cheapest
                      </button>
                    ))}
                    {sweepableItems.length > 0 && (
                      <button
                        onClick={selectAll}
                        className="text-xs px-2.5 py-1.5 rounded-lg border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                      >
                        Select All
                      </button>
                    )}
                    {selectedTxids.size > 0 && (
                      <button
                        onClick={() => setSelectedTxids(new Set())}
                        className="text-xs px-2.5 py-1.5 rounded-lg border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                      >
                        Clear
                      </button>
                    )}
                    {selectedTxids.size > 0 && (
                      <button
                        onClick={() => setIsSweepModalOpen(true)}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium text-white ml-auto"
                        style={{ background: 'var(--accent)' }}
                      >
                        <Zap className="h-3.5 w-3.5" />
                        Sweep {selectedTxids.size} — {formatBCH(sweepTotal)}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

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
                  <div key={item.txid} className={`relative ${sweepMode && item.listingType === 'auction' ? 'opacity-40' : ''}`}>
                    <NFTCard listing={item} index={i} />
                    {sweepMode && item.listingType === 'fixed' && (
                      <div
                        className="absolute inset-0 cursor-pointer rounded-xl"
                        onClick={() => toggleItem(item.txid)}
                      >
                        {selectedTxids.has(item.txid) && (
                          <div className="absolute inset-0 rounded-xl ring-2 ring-[var(--accent)] pointer-events-none" />
                        )}
                        <div className={`absolute top-2 right-2 w-5 h-5 rounded border-2 flex items-center justify-center ${
                          selectedTxids.has(item.txid)
                            ? 'border-[var(--accent)]'
                            : 'border-white/60'
                        }`} style={selectedTxids.has(item.txid) ? { background: 'var(--accent)' } : { background: 'rgba(0,0,0,0.5)' }}>
                          {selectedTxids.has(item.txid) && <Check className="h-2.5 w-2.5 text-white" />}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="card overflow-hidden mb-6">
                <table className="data-table">
                  <thead>
                    <tr>
                      {sweepMode && <th className="w-10" />}
                      <th>Item</th>
                      <th className="text-right">Price</th>
                      <th className="text-right hidden sm:table-cell">Top Bid</th>
                      <th className="text-right hidden md:table-cell">Owner</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => (
                      <tr key={item.txid} className={sweepMode && item.listingType === 'auction' ? 'opacity-40' : ''}>
                        {sweepMode && (
                          <td>
                            {item.listingType === 'fixed' && (
                              <input
                                type="checkbox"
                                checked={selectedTxids.has(item.txid)}
                                onChange={() => toggleItem(item.txid)}
                                className="w-4 h-4 cursor-pointer"
                                style={{ accentColor: 'var(--accent)' }}
                              />
                            )}
                          </td>
                        )}
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

      {/* Sweep Modal */}
      <SweepModal
        isOpen={isSweepModalOpen}
        onClose={() => { setIsSweepModalOpen(false); setSweepMode(false); setSelectedTxids(new Set()); }}
        listings={selectedListings}
        buyerAddress={wallet?.address || ''}
        onComplete={() => { setSweepMode(false); setSelectedTxids(new Set()); }}
      />

      <CollectionBidModal
        isOpen={isBidModalOpen}
        onClose={() => setIsBidModalOpen(false)}
        tokenCategory={collection.tokenCategory || ''}
        creatorPkh={collection.creatorPkh || ''}
        creatorAddress={collection.creatorAddress || ''}
        royaltyBasisPoints={collection.royaltyBasisPoints || 0}
        onComplete={() => setIsBidModalOpen(false)}
      />

      {cancelBid && (
        <CancelBidModal
          isOpen={!!cancelBid}
          onClose={() => setCancelBid(null)}
          bid={cancelBid}
          bidderAddress={wallet?.address || ''}
          onComplete={() => setCancelBid(null)}
        />
      )}
    </div>
  );
}
