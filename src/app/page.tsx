'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  TrendingUp, ArrowUpRight, ArrowDownRight, Activity,
  ChevronRight, Zap, Shield, BarChart3, Droplets, BookOpen, Layers, Package
} from 'lucide-react';
import { useNFTStore } from '@/lib/store/nft-store';
import { usePriceStore } from '@/lib/store/price-store';
import { formatBCH, formatUSD, shortenAddress, ipfsToHttp, isVideoUrl } from '@/lib/utils';
import type { Collection, CollectionBid, CollectionItem } from '@/lib/types';

const timeFilters = ['1h', '6h', '24h', '7d', '30d'] as const;
type TimeFilter = typeof timeFilters[number];

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ms).toLocaleDateString();
}

function MemphisDecoration() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.03]">
      <div className="absolute top-10 left-[10%] w-20 h-20 border-2 border-[var(--memphis-pink)] rotate-45" />
      <div className="absolute top-32 right-[15%] w-12 h-12 rounded-full border-2 border-[var(--memphis-yellow)]" />
      <div className="absolute bottom-20 left-[20%] w-16 h-16 border-2 border-[var(--memphis-blue)] rotate-12" />
      <div className="absolute top-1/2 right-[8%] w-8 h-8 bg-[var(--memphis-coral)] rotate-45" />
    </div>
  );
}

function StatCard({ label, value, change, icon: Icon }: {
  label: string; value: string; change?: string; icon: React.ElementType;
}) {
  const isPositive = change && !change.startsWith('-');
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="p-2 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
        <Icon className="h-4 w-4" style={{ color: 'var(--accent)' }} />
      </div>
      <div>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</div>
        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</div>
      </div>
      {change && (
        <div className={`flex items-center gap-0.5 text-xs font-medium ${isPositive ? 'pct-up' : 'pct-down'}`}>
          {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {change}
        </div>
      )}
    </div>
  );
}

function ActivityItem({ type, item, price, time }: {
  type: 'sale' | 'list' | 'bid'; item: string; price: string; time: string;
}) {
  const colors = { sale: 'var(--accent)', list: 'var(--accent-blue)', bid: 'var(--accent-purple)' };
  const labels = { sale: 'Sale', list: 'Listed', bid: 'Bid' };
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-hover)] transition-colors">
      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: colors[type] }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{
            background: `color-mix(in srgb, ${colors[type]} 10%, transparent)`,
            color: colors[type]
          }}>{labels[type]}</span>
          <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{item}</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-xs font-mono" style={{ color: 'var(--accent)' }}>{price}</div>
        <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{time}</div>
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: BookOpen,  label: 'Order Book',     desc: 'Collection bids for any NFT in a category', color: 'var(--accent)' },
  { icon: Zap,       label: 'Instant Sell',   desc: 'Exit any position in one click via bids or pools', color: 'var(--accent)' },
  { icon: Package,   label: 'Floor Sweep',    desc: 'Atomic batch buy across sellers in one tx', color: 'var(--accent)' },
  { icon: Droplets,  label: 'Liquidity Pools', desc: 'AMM covenants that auto-buy NFTs at floor', color: '#a78bfa' },
  { icon: Layers,    label: 'Fractionalize',  desc: 'Split any NFT into 1M tradeable shares', color: '#60a5fa' },
  { icon: Shield,    label: 'Non-Custodial',  desc: 'CashScript covenants — no trust required', color: 'var(--accent)' },
];

export default function HomePage() {
  const { isLoading, setLoading } = useNFTStore();
  const { bchUsd, fetchPrice } = usePriceStore();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('24h');
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeBidCount, setActiveBidCount] = useState(0);
  const [poolCount, setPoolCount] = useState(0);

  useEffect(() => {
    fetchPrice();
    const priceInterval = setInterval(fetchPrice, 60_000);
    return () => clearInterval(priceInterval);
  }, [fetchPrice]);

  useEffect(() => {
    const load = async (showLoading = false) => {
      if (showLoading) setLoading(true);
      try {
        const [colRes, marketRes, poolRes] = await Promise.all([
          fetch('/api/collections').then((r) => r.json()),
          fetch('/api/marketplace').then((r) => r.json()).catch(() => ({ bids: [] })),
          fetch('/api/pool').then((r) => r.json()).catch(() => ({ pools: [] })),
        ]);
        setCollections(colRes.collections || []);
        setActiveBidCount((marketRes.bids || []).filter((b: CollectionBid) => b.status === 'active').length);
        setPoolCount((poolRes.pools || []).filter((p: any) => p.status === 'active').length);
      } catch (err) {
        console.warn('Failed to load collections:', err);
      } finally {
        if (showLoading) setLoading(false);
      }
    };
    load(true);
    const interval = setInterval(() => load(false), 30000);
    return () => clearInterval(interval);
  }, [setLoading]);

  // Compute live stats from collections
  const totalVolume = collections.reduce((sum, c) => sum + Number(BigInt(c.totalVolume || '0')), 0) / 1e8;
  const allFloors = collections.map(c => BigInt(c.floorPrice || '0')).filter(f => f > 0n);
  const floorPrice = allFloors.length > 0 ? Number(allFloors.reduce((min, f) => f < min ? f : min)) / 1e8 : 0;
  const totalListings = collections.reduce((sum, c) => sum + c.listedCount, 0);
  const uniqueSellers = collections.reduce((sum, c) => sum + c.ownerCount, 0);

  // Time-filtered trending: keep collections that have at least one item within the window
  const timeWindowMs: Record<TimeFilter, number> = {
    '1h':  1 * 60 * 60 * 1000,
    '6h':  6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d':  7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  const cutoff = Date.now() - timeWindowMs[timeFilter];
  const displayCollections = collections
    .map((col) => {
      const recentItems = (col.items || []).filter((item: CollectionItem) => (item.createdAt || 0) >= cutoff);
      return { ...col, recentCount: recentItems.length };
    })
    .filter((col) => col.recentCount > 0)
    .sort((a, b) => b.recentCount - a.recentCount || Number(BigInt(b.floorPrice || '0') - BigInt(a.floorPrice || '0')));

  return (
    <div className="relative">
      <MemphisDecoration />

      {/* Hero */}
      <div className="border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-8 sm:py-12">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded-full"
                  style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
                  Bazaar
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: 'color-mix(in srgb, #a78bfa 12%, transparent)', color: '#a78bfa' }}>
                  BCH Chipnet
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
                The Liquidity Layer
                <span className="block" style={{ color: 'var(--accent)' }}>of Bitcoin Cash</span>
              </h1>
              <p className="text-sm max-w-xl leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Bazaar proves BCH can handle complex financial intents — limit orders, instant sells, atomic sweeps,
                and AMM liquidity pools — faster and cheaper than any other chain.
              </p>
              <div className="flex items-center gap-3 mt-4 flex-wrap">
                <Link href="/explore"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                  style={{ background: 'var(--accent)' }}>
                  <Zap className="h-3.5 w-3.5" /> Trade Now
                </Link>
                <Link href="/collections"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border transition-colors hover:border-[#a78bfa] hover:text-[#a78bfa]"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  <Droplets className="h-3.5 w-3.5" /> Provide Liquidity
                </Link>
              </div>
            </div>

            {/* Feature pills */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 lg:w-auto">
              {FEATURES.map(({ icon: Icon, label, desc, color }) => (
                <div key={label}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
                  style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
                  <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
                  <div>
                    <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</div>
                    <div className="text-[10px] leading-tight mt-0.5 hidden sm:block" style={{ color: 'var(--text-muted)' }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
          <div className="flex items-center overflow-x-auto">
            {bchUsd > 0 && (
              <>
                <StatCard icon={TrendingUp} label="BCH / USD" value={`$${bchUsd.toFixed(2)}`} />
                <div className="w-px h-8 shrink-0" style={{ background: 'var(--border)' }} />
              </>
            )}
            <StatCard icon={BarChart3} label="Total Volume" value={`${totalVolume.toFixed(4)} BCH`} />
            <div className="w-px h-8 shrink-0" style={{ background: 'var(--border)' }} />
            <StatCard icon={Activity} label="Listings" value={`${totalListings}`} />
            <div className="w-px h-8 shrink-0 hidden sm:block" style={{ background: 'var(--border)' }} />
            <div className="hidden sm:block">
              <StatCard icon={Shield} label="Floor Price" value={floorPrice > 0 ? `${floorPrice.toFixed(4)} BCH` : '--'} />
            </div>
            <div className="w-px h-8 shrink-0 hidden md:block" style={{ background: 'var(--border)' }} />
            <div className="hidden md:block">
              <StatCard icon={Shield} label="Sellers" value={`${uniqueSellers}`} />
            </div>
            <div className="w-px h-8 shrink-0 hidden lg:block" style={{ background: 'var(--border)' }} />
            <div className="hidden lg:block">
              <StatCard icon={BookOpen} label="Active Bids" value={`${activeBidCount}`} />
            </div>
            <div className="w-px h-8 shrink-0 hidden lg:block" style={{ background: 'var(--border)' }} />
            <div className="hidden lg:block">
              <StatCard icon={Droplets} label="Pools" value={`${poolCount}`} />
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* Trending Collections Table */}
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Trending Collections
                </h2>
                <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                  {timeFilters.map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setTimeFilter(tf)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${timeFilter === tf
                          ? 'text-[var(--text-primary)]'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                      style={timeFilter === tf ? { background: 'var(--bg-hover)' } : {}}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
              <Link
                href="/explore"
                className="flex items-center gap-1 text-xs font-medium transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                View All <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="card overflow-hidden">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-10">#</th>
                    <th>Collection</th>
                    <th className="text-right">Floor</th>
                    <th className="text-right hidden sm:table-cell">Best Offer</th>
                    <th className="text-right hidden md:table-cell">Volume</th>
                    <th className="text-right hidden md:table-cell">Listed</th>
                    <th className="text-right hidden lg:table-cell">Owners</th>
                    <th className="text-right hidden sm:table-cell">Supply</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        <td><div className="skeleton h-4 w-4" /></td>
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="skeleton w-10 h-10 rounded-lg" />
                            <div className="skeleton h-4 w-32" />
                          </div>
                        </td>
                        <td className="text-right"><div className="skeleton h-4 w-16 ml-auto" /></td>
                        <td className="text-right hidden sm:table-cell"><div className="skeleton h-4 w-14 ml-auto" /></td>
                        <td className="text-right hidden md:table-cell"><div className="skeleton h-4 w-16 ml-auto" /></td>
                        <td className="text-right hidden md:table-cell"><div className="skeleton h-4 w-10 ml-auto" /></td>
                        <td className="text-right hidden lg:table-cell"><div className="skeleton h-4 w-10 ml-auto" /></td>
                        <td className="text-right hidden sm:table-cell"><div className="skeleton h-4 w-10 ml-auto" /></td>
                      </tr>
                    ))
                  ) : collections.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-16">
                        <Zap className="h-8 w-8 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                        <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                          No collections yet
                        </div>
                        <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                          Be the first to create and list an NFT on BAZAAR
                        </div>
                        <Link href="/create" className="btn-primary inline-flex items-center gap-2 mt-4 text-xs">
                          Create NFT <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ) : displayCollections.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                          No activity in the last {timeFilter}
                        </div>
                        <button
                          onClick={() => setTimeFilter('30d')}
                          className="text-xs mt-2 underline"
                          style={{ color: 'var(--accent)' }}
                        >
                          View all time
                        </button>
                      </td>
                    </tr>
                  ) : (
                    displayCollections.map((col, i) => {
                      const floor = BigInt(col.floorPrice || '0');
                      const vol = BigInt(col.totalVolume || '0');

                      return (
                        <tr key={col.slug} className="cursor-pointer">
                          <td className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                          <td>
                            <Link href={`/collection/${col.slug}`} className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0"
                                style={{ background: 'var(--bg-hover)' }}>
                                {col.image ? (
                                  isVideoUrl(ipfsToHttp(col.image)) ? (
                                    <video src={ipfsToHttp(col.image)} autoPlay loop muted playsInline
                                      className="w-full h-full object-cover" />
                                  ) : (
                                    <Image src={ipfsToHttp(col.image)} alt={col.name}
                                      width={40} height={40} className="w-full h-full object-cover" />
                                  )
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-xs font-bold"
                                    style={{ color: 'var(--accent)' }}>
                                    {col.name?.slice(0, 2)?.toUpperCase() || 'NK'}
                                  </div>
                                )}
                              </div>
                              <div>
                                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                  {col.name}
                                </div>
                                <div className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                                  {shortenAddress(col.creatorAddress, 4)}
                                </div>
                              </div>
                            </Link>
                          </td>
                          <td className="text-right">
                            <div className="text-sm font-mono" style={{ color: 'var(--accent)' }}>
                              {floor > 0n ? formatBCH(floor) : '--'}
                            </div>
                            {bchUsd > 0 && floor > 0n && (
                              <div className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                                {formatUSD(floor, bchUsd)}
                              </div>
                            )}
                          </td>
                          <td className="text-right hidden sm:table-cell">
                            <span className="text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>
                              {floor > 0n ? formatBCH(floor * 9n / 10n) : '--'}
                            </span>
                          </td>
                          <td className="text-right hidden md:table-cell">
                            <span className="text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>
                              {vol > 0n ? formatBCH(vol) : '--'}
                            </span>
                          </td>
                          <td className="text-right hidden md:table-cell">
                            <span className="text-sm" style={{ color: col.listedCount > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
                              {col.listedCount}
                            </span>
                          </td>
                          <td className="text-right hidden lg:table-cell">
                            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                              {col.ownerCount}
                            </span>
                          </td>
                          <td className="text-right hidden sm:table-cell">
                            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{col.totalSupply}</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Activity Feed Sidebar */}
          <div className="lg:col-span-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Activity</h2>
              <Link href="/activity" className="flex items-center gap-1 text-xs font-medium transition-colors"
                style={{ color: 'var(--text-secondary)' }}>
                View All <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="card overflow-hidden">
              {collections.length === 0 && !isLoading ? (
                <div className="p-8 text-center">
                  <Activity className="h-6 w-6 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>No activity yet</div>
                </div>
              ) : isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-3">
                      <div className="skeleton w-6 h-6 rounded-full" />
                      <div className="flex-1">
                        <div className="skeleton h-3 w-24 mb-1" />
                        <div className="skeleton h-2.5 w-16" />
                      </div>
                      <div className="skeleton h-3 w-12" />
                    </div>
                  </div>
                ))
              ) : (
                collections
                  .flatMap((col) => col.items || [])
                  .sort((a: CollectionItem, b: CollectionItem) => (b.createdAt || 0) - (a.createdAt || 0))
                  .slice(0, 10)
                  .map((item: CollectionItem) => (
                    <div key={item.txid} className="border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                      <ActivityItem
                        type={item.listingType === 'auction' ? 'bid' : item.status === 'sold' ? 'sale' : 'list'}
                        item={item.metadata?.name || `Token #${item.tokenCategory?.slice(0, 6)}`}
                        price={formatBCH(BigInt(item.price || item.currentBid || item.minBid || '0'))}
                        time={timeAgo(item.createdAt || item.updatedAt || Date.now())}
                      />
                    </div>
                  ))
              )}
            </div>

            {/* Quick Actions & Network Info */}
            <div className="mt-4 space-y-3">
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Quick Actions</span>
                </div>
                <div className="space-y-2">
                  <Link href="/create" className="btn-primary w-full text-xs text-center block py-2">
                    Create NFT
                  </Link>
                  <Link href="/explore" className="btn-secondary w-full text-xs text-center block py-2">
                    Explore Market
                  </Link>
                  <Link href="/collections"
                    className="w-full text-xs text-center block py-2 rounded-lg border transition-colors hover:border-[#a78bfa] hover:text-[#a78bfa] font-medium"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                    + Provide Liquidity
                  </Link>
                </div>
              </div>

              {/* Bazaar SDK card */}
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="h-4 w-4" style={{ color: '#a78bfa' }} />
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Bazaar SDK</span>
                </div>
                <p className="text-[11px] mb-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Add BCH NFT liquidity to your app in one line:
                </p>
                <div className="rounded-lg px-3 py-2 font-mono text-[10px]"
                  style={{ background: 'var(--bg-hover)', color: 'var(--accent)' }}>
                  {'Bazaar.instantSell(nft, creds)'}
                </div>
                <div className="mt-2 space-y-1">
                  {[
                    ['Chain', 'BCH Chipnet'],
                    ['Protocol', 'CashTokens'],
                    ['Contracts', 'CashScript'],
                    ['Fees', '< $0.01'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-xs">
                      <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                      <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
