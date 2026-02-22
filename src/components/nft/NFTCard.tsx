'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Clock, Gavel, Tag, User } from 'lucide-react';
import { formatBCH, shortenAddress, timeRemaining, ipfsToHttp } from '@/lib/utils';
import { MediaDisplay } from './MediaDisplay';
import type { NFTListing, AuctionListing } from '@/lib/types';

interface NFTCardProps {
  listing: NFTListing | AuctionListing;
  index?: number;
}

export function NFTCard({ listing, index = 0 }: NFTCardProps) {
  const isAuction = listing.listingType === 'auction';
  const auction = isAuction ? (listing as AuctionListing) : null;
  const linkHref = isAuction ? `/auction/${listing.txid}` : `/nft/${listing.txid}`;

  const imageUrl = listing.metadata?.image
    ? ipfsToHttp(listing.metadata.image)
    : `/api/placeholder/${listing.tokenCategory?.slice(0, 8) || 'default'}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
      className="group"
    >
      <Link href={linkHref}>
        <div className="card overflow-hidden cursor-pointer">
          {/* Image */}
          <div className="relative aspect-square overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
            {listing.metadata?.image ? (
              <MediaDisplay
                src={imageUrl}
                alt={listing.metadata?.name || 'NFT'}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-4xl font-bold font-mono" style={{ color: 'var(--accent)', opacity: 0.2 }}>
                  {listing.tokenCategory?.slice(0, 4) || 'NFT'}
                </div>
              </div>
            )}

            {/* Badge */}
            <div className="absolute top-2 left-2">
              {isAuction ? (
                <span className="badge badge-blue">
                  <Gavel className="h-3 w-3" />
                  Auction
                </span>
              ) : (
                <span className="badge badge-green">
                  <Tag className="h-3 w-3" />
                  Fixed
                </span>
              )}
            </div>

            {/* Timer */}
            {auction && auction.endTime > 0 && (
              <div className="absolute top-2 right-2">
                <span className="badge" style={{ background: 'rgba(0,0,0,0.7)', color: '#fff' }}>
                  <Clock className="h-3 w-3" />
                  {timeRemaining(auction.endTime)}
                </span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="p-3">
            <h3 className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {listing.metadata?.name || `Token #${listing.tokenCategory?.slice(0, 8)}`}
            </h3>

            <div className="flex items-center gap-1 text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
              <User className="h-3 w-3" />
              <span>{shortenAddress(listing.creatorAddress || listing.sellerAddress, 4)}</span>
            </div>

            <div className="flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {isAuction ? 'Current Bid' : 'Price'}
                </div>
                <div className="text-sm font-semibold font-mono" style={{ color: 'var(--accent)' }}>
                  {formatBCH(isAuction && auction ? auction.currentBid || auction.minBid : listing.price)}
                </div>
              </div>

              {listing.royaltyBasisPoints > 0 && (
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {listing.royaltyBasisPoints / 100}% royalty
                </div>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
