'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft, Gavel, Clock, User, TrendingUp, Shield, Loader2,
  Check, AlertCircle, ExternalLink, ChevronDown, History
} from 'lucide-react';
import { useWalletStore } from '@/lib/store/wallet-store';
import { usePriceStore } from '@/lib/store/price-store';
import { formatBCH, formatUSD, shortenAddress, timeRemaining, ipfsToHttp } from '@/lib/utils';
import type { AuctionListing, AuctionBid } from '@/lib/types';

export default function AuctionPage() {
  const params = useParams();
  const id = params.id as string;
  const { wallet, setModalOpen } = useWalletStore();
  const { bchUsd, fetchPrice } = usePriceStore();

  useEffect(() => { fetchPrice(); }, [fetchPrice]);

  const [auction, setAuction] = useState<AuctionListing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [bidAmount, setBidAmount] = useState('');
  const [isBidding, setIsBidding] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState('');
  const [showBidHistory, setShowBidHistory] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    // Fetch auction data
    setTimeout(() => {
      setAuction(null);
      setIsLoading(false);
    }, 1000);
  }, [id]);

  // Countdown timer
  useEffect(() => {
    if (!auction?.endTime) return;
    const interval = setInterval(() => {
      setCountdown(timeRemaining(auction.endTime));
    }, 1000);
    return () => clearInterval(interval);
  }, [auction?.endTime]);

  const handleBid = async () => {
    if (!wallet?.isConnected) {
      setModalOpen(true);
      return;
    }

    const amount = parseFloat(bidAmount);
    if (!amount || amount <= 0) {
      setError('Enter a valid bid amount');
      return;
    }

    setIsBidding(true);
    setError('');
    try {
      // In full implementation: execute bid via auction contract
      await new Promise((r) => setTimeout(r, 2000));
      setBidAmount('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bid failed');
    } finally {
      setIsBidding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        <div className="mx-auto max-w-6xl grid md:grid-cols-2 gap-8">
          <div className="aspect-square rounded-2xl skeleton" />
          <div className="space-y-4">
            <div className="h-8 skeleton w-3/4" />
            <div className="h-24 skeleton" />
            <div className="h-48 skeleton" />
          </div>
        </div>
      </div>
    );
  }

  const displayName = auction?.metadata?.name || `Auction #${id.slice(0, 12)}`;
  const isEnded = auction ? auction.endTime <= Math.floor(Date.now() / 1000) : false;
  const currentBid = auction?.currentBid || 0n;
  const minBid = auction?.minBid || 0n;
  const bidHistory = auction?.bidHistory || [];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/explore"
          className="inline-flex items-center gap-2 text-sm hover:text-white mb-6"
          style={{ color: 'var(--text-muted)' }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Explore
        </Link>

        <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
          {/* Left - Image */}
          <div>
            <div className="aspect-square rounded-2xl overflow-hidden relative" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', borderWidth: '1px' }}>
              {auction?.metadata?.image ? (
                <Image
                  src={ipfsToHttp(auction.metadata.image)}
                  alt={displayName}
                  width={600}
                  height={600}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center">
                    <Gavel className="h-16 w-16 mx-auto mb-4" style={{ color: 'var(--accent-purple)', opacity: 0.3 }} />
                    <div className="text-6xl font-bold font-mono" style={{ color: 'var(--accent-purple)', opacity: 0.1 }}>
                      {id.slice(0, 6)}
                    </div>
                  </div>
                </div>
              )}

              {/* Timer overlay */}
              <div className="absolute top-4 right-4">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-sm text-sm font-medium ${
                  isEnded
                    ? 'bg-red-500/20 text-red-400 border border-red-500/20'
                    : 'bg-black/60 text-white border border-white/10'
                }`}>
                  <Clock className="h-4 w-4" />
                  {isEnded ? 'Auction Ended' : countdown || 'Loading...'}
                </div>
              </div>
            </div>
          </div>

          {/* Right - Auction Details */}
          <div className="space-y-6">
            <div>
              <div className="badge" style={{ background: 'rgba(139, 92, 246, 0.1)', color: 'var(--accent-purple)', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
                <Gavel className="h-3 w-3 mr-1" />
                English Auction
              </div>
              <h1 className="text-3xl font-bold">{displayName}</h1>
              {auction?.metadata?.description && (
                <p className="mt-2" style={{ color: 'var(--text-muted)' }}>{auction.metadata.description}</p>
              )}
            </div>

            {/* Current Bid */}
            <div className="card p-6">
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Current Bid</div>
                  <div className="text-2xl font-bold font-mono" style={{ color: 'var(--accent-purple)' }}>
                    {currentBid > 0n ? formatBCH(currentBid) : 'No bids yet'}
                  </div>
                  {bchUsd > 0 && currentBid > 0n && (
                    <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                      {formatUSD(currentBid, bchUsd)}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Minimum Bid</div>
                  <div className="text-lg font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {formatBCH(minBid)}
                  </div>
                  {bchUsd > 0 && minBid > 0n && (
                    <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                      {formatUSD(minBid, bchUsd)}
                    </div>
                  )}
                </div>
              </div>

              {auction?.currentBidder && (
                <div className="flex items-center gap-2 text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                  <TrendingUp className="h-4 w-4" style={{ color: 'var(--accent-purple)' }} />
                  Leading Bidder: {shortenAddress(auction.currentBidder, 6)}
                </div>
              )}

              <div className="flex items-center gap-2 text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
                <Shield className="h-3 w-3" style={{ color: 'var(--accent)' }} />
                Automatic refund for outbid bidders via atomic transaction
              </div>

              {!isEnded ? (
                <div className="space-y-3">
                  <div className="relative">
                    <input
                      type="number"
                      value={bidAmount}
                      onChange={(e) => { setBidAmount(e.target.value); setError(''); }}
                      placeholder={`Min: ${formatBCH(currentBid > 0n ? currentBid + 1000n : minBid)}`}
                      step="0.00000001"
                      min="0"
                      className="input-field pr-16"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>
                      BCH
                    </span>
                  </div>

                  <button
                    onClick={handleBid}
                    disabled={isBidding}
                    className="btn-primary w-full py-4 text-lg font-semibold rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  >
                    {isBidding ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Placing Bid...
                      </>
                    ) : wallet?.isConnected ? (
                      <>
                        <Gavel className="h-5 w-5" />
                        Place Bid
                      </>
                    ) : (
                      'Connect Wallet to Bid'
                    )}
                  </button>
                </div>
              ) : (
                <div className="p-4 rounded-xl text-center" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', borderWidth: '1px' }}>
                  <p style={{ color: 'var(--text-muted)' }}>This auction has ended</p>
                  {currentBid > 0n && (
                    <p className="text-sm mt-1" style={{ color: 'var(--accent-purple)' }}>
                      Winning bid: {formatBCH(currentBid)}
                    </p>
                  )}
                </div>
              )}

              {error && (
                <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}
            </div>

            {/* Bid History */}
            <div className="card p-5">
              <button
                onClick={() => setShowBidHistory(!showBidHistory)}
                className="w-full flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                  <span className="font-semibold">Bid History</span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({bidHistory.length})</span>
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform ${showBidHistory ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }} />
              </button>

              {showBidHistory && (
                <div className="mt-4 space-y-3">
                  {bidHistory.length > 0 ? (
                    bidHistory.map((bid, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                          <span className="text-sm font-mono">{shortenAddress(bid.bidder, 6)}</span>
                        </div>
                        <span className="text-sm font-mono" style={{ color: 'var(--accent-purple)' }}>{formatBCH(bid.amount)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>No bids yet</p>
                  )}
                </div>
              )}
            </div>

            {/* Auction Info */}
            <div className="card p-5">
              <h3 className="font-semibold mb-4">Auction Details</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Type</span>
                  <span className="text-sm">English Auction</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Contract</span>
                  <span className="text-sm">CashScript Covenant</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Bid Refund</span>
                  <span className="text-sm" style={{ color: 'var(--accent)' }}>Automatic (same-tx)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Network</span>
                  <span className="text-sm" style={{ color: 'var(--accent)' }}>Chipnet</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
