'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Users, BarChart2, Tag } from 'lucide-react';
import { formatBCH, ipfsToHttp, shortenAddress } from '@/lib/utils';
import { MediaDisplay } from './MediaDisplay';

interface CollectionCardProps {
  collection: {
    slug: string;
    name: string;
    image?: string;
    creatorAddress: string;
    floorPrice: string;
    totalVolume: string;
    listedCount: number;
    totalSupply: number;
    ownerCount: number;
    royaltyBasisPoints: number;
    items: any[];
  };
  index?: number;
}

export function CollectionCard({ collection, index = 0 }: CollectionCardProps) {
  const imageUrl = collection.image ? ipfsToHttp(collection.image) : null;
  const floorBCH = formatBCH(BigInt(collection.floorPrice || '0'));
  const volumeBCH = formatBCH(BigInt(collection.totalVolume || '0'));
  const listedPct = collection.totalSupply > 0
    ? Math.round((collection.listedCount / collection.totalSupply) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
    >
      <Link href={`/collection/${collection.slug}`}>
        <div className="card overflow-hidden cursor-pointer group hover:border-[var(--accent)] transition-colors">
          {/* Banner / Image */}
          <div className="relative h-32 overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
            {imageUrl ? (
              <MediaDisplay
                src={imageUrl}
                alt={collection.name}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-5xl font-black font-mono" style={{ color: 'var(--accent)', opacity: 0.15 }}>
                  {collection.name.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
            {/* Supply badge */}
            <div className="absolute top-2 right-2">
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(0,0,0,0.6)', color: 'var(--accent)' }}>
                {collection.totalSupply} item{collection.totalSupply !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Info */}
          <div className="p-3">
            <h3 className="text-sm font-semibold truncate mb-1" style={{ color: 'var(--text-primary)' }}>
              {collection.name}
            </h3>
            <div className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
              by {shortenAddress(collection.creatorAddress, 4)}
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <div className="text-center p-1.5 rounded" style={{ background: 'var(--bg-secondary)' }}>
                <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Floor</div>
                <div className="text-xs font-mono font-semibold" style={{ color: 'var(--accent)' }}>
                  {collection.floorPrice === '0' ? '--' : floorBCH}
                </div>
              </div>
              <div className="text-center p-1.5 rounded" style={{ background: 'var(--bg-secondary)' }}>
                <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Volume</div>
                <div className="text-xs font-mono font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {collection.totalVolume === '0' ? '--' : volumeBCH}
                </div>
              </div>
              <div className="text-center p-1.5 rounded" style={{ background: 'var(--bg-secondary)' }}>
                <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Listed</div>
                <div className="text-xs font-mono font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {listedPct}%
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                <Users className="h-3 w-3" />
                <span>{collection.ownerCount} owner{collection.ownerCount !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                <Tag className="h-3 w-3" />
                <span>{collection.listedCount} listed</span>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
