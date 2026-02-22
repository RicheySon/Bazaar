'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  TrendingUp, ArrowUpRight, ArrowDownRight, Activity,
  ChevronRight, Zap, Shield, BarChart3
} from 'lucide-react';
import { useNFTStore } from '@/lib/store/nft-store';
import { usePriceStore } from '@/lib/store/price-store';
import { formatBCH, formatUSD, shortenAddress, ipfsToHttp } from '@/lib/utils';

const timeFilters = ['1h', '6h', '24h', '7d', '30d'] as const;
type TimeFilter = typeof timeFilters[number];

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

export default function HomePage() {
  const { isLoading, setLoading } = useNFTStore();
  const { bchUsd, fetchPrice } = usePriceStore();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('24h');
  const [collections, setCollections] = useState<any[]>([]);

  useEffect(() => {
    fetchPrice();
    const priceInterval = setInterval(fetchPrice, 60_000);
    return () => clearInterval(priceInterval);
  }, [fetchPrice]);

  useEffect(() => {
    const load = async (showLoading = false) => {
      if (showLoading) setLoading(true);
      try {
        const res = await fetch('/api/collections');
        const data = await res.json();
        setCollections(data.collections || []);
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
  const trendingCollections = collections
    .map((col) => {
      const recentItems = (col.items || []).filter((item: any) => (item.createdAt || 0) >= cutoff);
      return { ...col, recentCount: recentItems.length };
    })
    .filter((col) => col.recentCount > 0)
    .sort((a, b) => b.recentCount - a.recentCount || Number(BigInt(b.floorPrice || '0') - BigInt(a.floorPrice || '0')));
  // Fall back to all collections if nothing matches the window (e.g. no 1h activity)
  const displayCollections = trendingCollections.length > 0 ? trendingCollections : collections;

  return (
    <div className="relative">
      <MemphisDecoration />

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
                    <th className="text-right">Floor Price</th>
                    <th className="text-right hidden sm:table-cell">Top Offer</th>
                    <th className="text-right hidden md:table-cell">24h %</th>
                    <th className="text-right hidden lg:table-cell">7d %</th>
                    <th className="text-right hidden md:table-cell">24h Vol</th>
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
                        <td className="text-right hidden md:table-cell"><div className="skeleton h-4 w-12 ml-auto" /></td>
                        <td className="text-right hidden lg:table-cell"><div className="skeleton h-4 w-12 ml-auto" /></td>
                        <td className="text-right hidden md:table-cell"><div className="skeleton h-4 w-16 ml-auto" /></td>
                        <td className="text-right hidden lg:table-cell"><div className="skeleton h-4 w-10 ml-auto" /></td>
                        <td className="text-right hidden sm:table-cell"><div className="skeleton h-4 w-10 ml-auto" /></td>
                      </tr>
                    ))
                  ) : collections.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-16">
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
                                  <Image
                                    src={ipfsToHttp(col.image)}
                                    alt={col.name}
                                    width={40}
                                    height={40}
                                    className="w-full h-full object-cover"
                                  />
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
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>--</span>
                          </td>
                          <td className="text-right hidden lg:table-cell">
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>--</span>
                          </td>
                          <td className="text-right hidden md:table-cell">
                            <span className="text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>
                              {vol > 0n ? formatBCH(vol) : '--'}
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
                collections.slice(0, 10).flatMap((col) => col.items || []).slice(0, 10).map((item: any, i: number) => (
                  <div key={item.txid} className="border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                    <ActivityItem
                      type={item.listingType === 'auction' ? 'bid' : item.status === 'sold' ? 'sale' : 'list'}
                      item={item.metadata?.name || `Token #${item.tokenCategory?.slice(0, 6)}`}
                      price={formatBCH(BigInt(item.price || item.currentBid || item.minBid || '0'))}
                      time={`${(i + 1) * 3}m ago`}
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
                </div>
              </div>

              <div className="card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4" style={{ color: 'var(--accent-blue)' }} />
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Network</span>
                </div>
                <div className="space-y-1.5">
                  {[
                    ['Chain', 'BCH Chipnet'],
                    ['Protocol', 'CashTokens'],
                    ['Contracts', 'CashScript'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-xs">
                      <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                      <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{v}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: 'var(--text-muted)' }}>Fees</span>
                    <span className="font-mono" style={{ color: 'var(--accent)' }}>&lt; $0.01</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
