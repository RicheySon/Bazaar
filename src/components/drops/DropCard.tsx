'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Users, Zap, Lock, Clock } from 'lucide-react';
import { formatBCH, ipfsToHttp } from '@/lib/utils';
import { MediaDisplay } from '@/components/nft/MediaDisplay';
import { CountdownTimer } from './CountdownTimer';
import type { NFTDrop, DropStatus } from '@/lib/types';

interface DropCardProps {
  drop: NFTDrop & { status: DropStatus };
  index?: number;
}

const STATUS_STYLES: Record<DropStatus, { label: string; bg: string; color: string }> = {
  live:     { label: 'Live',     bg: 'rgba(0,229,69,0.15)',  color: 'var(--accent)' },
  presale:  { label: 'Presale',  bg: 'rgba(139,92,246,0.15)', color: 'var(--accent-purple)' },
  upcoming: { label: 'Upcoming', bg: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)' },
  ended:    { label: 'Ended',    bg: 'rgba(100,100,100,0.15)', color: 'var(--text-muted)' },
  'sold-out': { label: 'Sold Out', bg: 'rgba(239,68,68,0.15)', color: 'var(--accent-red)' },
};

export function DropCard({ drop, index = 0 }: DropCardProps) {
  const style = STATUS_STYLES[drop.status];
  const imageUrl = drop.bannerImage ? ipfsToHttp(drop.bannerImage) : null;
  const mintedPct = drop.totalSupply > 0 ? (drop.mintedCount / drop.totalSupply) * 100 : 0;
  const mintPrice = BigInt(drop.mintPrice || '0');

  const showCountdown =
    drop.status === 'upcoming' ||
    drop.status === 'presale';

  const countdownTarget =
    drop.status === 'presale'
      ? drop.mintStartTime            // count down to public mint
      : drop.whitelistEnabled && drop.whitelistStartTime
        ? drop.whitelistStartTime     // count down to presale
        : drop.mintStartTime;         // count down to public mint

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
    >
      <Link href={`/drops/${drop.slug}`}>
        <div className="card overflow-hidden cursor-pointer group hover:border-[var(--accent)] transition-colors">
          {/* Banner */}
          <div className="relative h-40 overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
            {imageUrl ? (
              <MediaDisplay
                src={imageUrl}
                alt={drop.name}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-5xl font-black font-mono" style={{ color: 'var(--accent)', opacity: 0.15 }}>
                  {drop.name.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}

            {/* Status badge */}
            <div className="absolute top-2 left-2">
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: style.bg, color: style.color }}
              >
                {drop.status === 'live' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1 animate-pulse" />}
                {style.label}
              </span>
            </div>

            {/* Whitelist badge */}
            {drop.whitelistEnabled && drop.status !== 'ended' && drop.status !== 'sold-out' && (
              <div className="absolute top-2 right-2">
                <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ background: 'rgba(0,0,0,0.6)', color: 'var(--accent-purple)' }}>
                  <Lock className="h-2.5 w-2.5" />
                  Allowlist
                </span>
              </div>
            )}

            {/* Supply overlay */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
              <div
                className="h-full transition-all duration-500"
                style={{ width: `${mintedPct}%`, background: 'var(--accent)' }}
              />
            </div>
          </div>

          {/* Info */}
          <div className="p-3">
            <h3 className="text-sm font-semibold truncate mb-0.5" style={{ color: 'var(--text-primary)' }}>
              {drop.name}
            </h3>
            <p className="text-[11px] truncate mb-2" style={{ color: 'var(--text-muted)' }}>
              {drop.collectionName}
            </p>

            {/* Countdown */}
            {showCountdown && countdownTarget && (
              <div className="mb-2">
                <CountdownTimer targetTime={countdownTarget} size="sm" />
              </div>
            )}

            {/* Stats row */}
            <div className="flex items-center justify-between border-t pt-2" style={{ borderColor: 'var(--border)' }}>
              <div>
                <div className="text-[9px] uppercase" style={{ color: 'var(--text-muted)' }}>Price</div>
                <div className="text-xs font-mono font-semibold" style={{ color: 'var(--accent)' }}>
                  {mintPrice === 0n ? 'Free' : formatBCH(mintPrice)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[9px] uppercase" style={{ color: 'var(--text-muted)' }}>Minted</div>
                <div className="text-xs font-mono font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {drop.mintedCount}/{drop.totalSupply}
                </div>
              </div>
              {drop.whitelistEnabled && (
                <div className="text-right">
                  <div className="text-[9px] uppercase" style={{ color: 'var(--text-muted)' }}>Max</div>
                  <div className="text-xs font-mono font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    {drop.maxPerWallet}/wallet
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
