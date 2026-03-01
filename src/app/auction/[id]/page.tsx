'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft, Gavel, Clock, User, TrendingUp, Shield, Loader2,
  Check, AlertCircle, ChevronDown, History
} from 'lucide-react';
import { useWalletStore } from '@/lib/store/wallet-store';
import { usePriceStore } from '@/lib/store/price-store';
import { formatBCH, formatUSD, shortenAddress, timeRemaining, ipfsToHttp } from '@/lib/utils';
import { fetchMarketplaceListingById } from '@/lib/bch/api-client';
import { placeBid, claimAuction, cancelListing, buildWcBidParams, buildWcClaimParams } from '@/lib/bch/contracts';
import { loadWallet } from '@/lib/bch/wallet';
import type { AuctionListing } from '@/lib/types';
import { useWeb3ModalConnectorContext } from '@bch-wc2/web3modal-connector';

export default function AuctionPage() {
  const params = useParams();
  const id = params.id as string;
  const { wallet, setModalOpen, connectionType } = useWalletStore();
  const { signTransaction } = useWeb3ModalConnectorContext();
  // Default to hex payloads for WalletConnect (raw Transaction objects can break some wallets)
  const wcPayloadMode = process.env.NEXT_PUBLIC_WC_PAYLOAD_MODE || 'hex';
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
    const load = async () => {
      try {
        const data = await fetchMarketplaceListingById(id);
        if (data && data.minBid) {
          const mapped: AuctionListing = {
            txid: data.txid,
            vout: 0,
            tokenCategory: data.tokenCategory,
            commitment: data.commitment || '',
            satoshis: 0,
            price: BigInt(data.currentBid || data.minBid || '0'),
            sellerAddress: data.seller,
            sellerPkh: data.sellerPkh || '',
            creatorAddress: data.creator || data.seller,
            creatorPkh: data.creatorPkh || '',
            royaltyBasisPoints: data.royaltyBasisPoints || 0,
            status: data.status || 'active',
            listingType: 'auction',
            minBid: BigInt(data.minBid || '0'),
            currentBid: BigInt(data.currentBid || '0'),
            currentBidder: data.currentBidder || '',
            endTime: data.endTime || 0,
            minBidIncrement: BigInt(data.minBidIncrement || '0'),
            bidHistory: (data.bidHistory || []).map((b: any) => ({
              bidder: b.bidder || '',
              amount: BigInt(b.amount || '0'),
              txid: b.txid || '',
              timestamp: b.timestamp || Date.now(),
            })),
            metadata: data.metadata,
          };
          setAuction(mapped);
        } else {
          setAuction(null);
        }
      } catch (err) {
        console.error('Failed to load auction:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
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
    if (auction) {
      if (auction.status !== 'active') {
        setError('Auction is not active');
        return;
      }
      const bidSats = BigInt(Math.floor(amount * 1e8));
      const minRequired = auction.currentBid > 0n ? auction.currentBid + auction.minBidIncrement : auction.minBid;
      if (bidSats < minRequired) {
        setError(`Bid must be at least ${formatBCH(minRequired)}`);
        return;
      }
    }

    setIsBidding(true);
    setError('');
    try {
      if (!auction) throw new Error('Auction not found');
      const bidSats = BigInt(Math.floor(amount * 1e8));

      if (connectionType === 'walletconnect') {
        const wcParams = await buildWcBidParams({
          auction,
          bidAmount: bidSats,
          bidderAddress: wallet.address,
        });
        if ('error' in wcParams) throw new Error(wcParams.error);

        const wcRequest = wcPayloadMode === 'raw'
          ? {
              transaction: wcParams.transaction,
              sourceOutputs: wcParams.sourceOutputs as any,
            }
          : {
              transaction: wcParams.transactionHex,
              sourceOutputs: wcParams.sourceOutputsJson as any,
            };

        const signResult = await signTransaction({
          ...wcRequest,
          broadcast: true,
          userPrompt: wcParams.userPrompt,
        });
        if (!signResult) throw new Error('Bid transaction was rejected by wallet.');

        setAuction((prev) => prev ? ({
          ...prev,
          currentBid: bidSats,
          currentBidder: wallet.address,
          bidHistory: [
            ...(prev.bidHistory || []),
            { bidder: wallet.address, amount: bidSats, txid: signResult.signedTransactionHash || '', timestamp: Date.now() },
          ],
        }) : prev);
        setBidAmount('');
      } else {
        const walletData = loadWallet();
        if (!walletData) throw new Error('Wallet not found. Please reconnect.');

        const result = await placeBid(walletData.privateKey, auction, bidSats, walletData.address);
        if (!result.success) throw new Error(result.error || 'Bid failed');

        setAuction((prev) => prev ? ({
          ...prev,
          currentBid: bidSats,
          currentBidder: walletData.address,
          bidHistory: [
            ...(prev.bidHistory || []),
            { bidder: walletData.address, amount: bidSats, txid: result.txid || '', timestamp: Date.now() },
          ],
        }) : prev);
        setBidAmount('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bid failed');
    } finally {
      setIsBidding(false);
    }
  };

  const handleClaim = async () => {
    if (!wallet?.isConnected) {
      setModalOpen(true);
      return;
    }
    setIsBidding(true);
    setError('');
    try {
      if (!auction) throw new Error('Auction not found');
      if (connectionType === 'walletconnect') {
        const wcParams = await buildWcClaimParams({
          auction,
          winnerAddress: wallet.address,
        });
        if ('error' in wcParams) throw new Error(wcParams.error);

        const wcRequest = wcPayloadMode === 'raw'
          ? {
              transaction: wcParams.transaction,
              sourceOutputs: wcParams.sourceOutputs as any,
            }
          : {
              transaction: wcParams.transactionHex,
              sourceOutputs: wcParams.sourceOutputsJson as any,
            };

        const signResult = await signTransaction({
          ...wcRequest,
          broadcast: true,
          userPrompt: wcParams.userPrompt,
        });
        if (!signResult) throw new Error('Claim transaction was rejected by wallet.');

        setAuction((prev) => prev ? { ...prev, status: 'sold' } : prev);
      } else {
        const walletData = loadWallet();
        if (!walletData) throw new Error('Wallet not found. Please reconnect.');

        const result = await claimAuction(walletData.privateKey, auction, walletData.address);
        if (!result.success) throw new Error(result.error || 'Claim failed');
        setAuction((prev) => prev ? { ...prev, status: 'sold' } : prev);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Claim failed');
    } finally {
      setIsBidding(false);
    }
  };

  const handleReclaim = async () => {
    if (!wallet?.isConnected) {
      setModalOpen(true);
      return;
    }
    setIsBidding(true);
    setError('');
    try {
      if (!auction) throw new Error('Auction not found');
      if (connectionType === 'walletconnect') {
        throw new Error('WalletConnect reclaim is not supported yet. Use the generated wallet for now.');
      }
      const walletData = loadWallet();
      if (!walletData) throw new Error('Wallet not found. Please reconnect.');

      const result = await cancelListing(walletData.privateKey, auction);
      if (!result.success) throw new Error(result.error || 'Reclaim failed');
      setAuction((prev) => prev ? { ...prev, status: 'cancelled' } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reclaim failed');
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

  if (!auction) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        <div className="mx-auto max-w-4xl">
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 text-sm hover:text-white mb-6"
            style={{ color: 'var(--text-muted)' }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Explore
          </Link>
          <div className="card p-8 text-center">
            <AlertCircle className="h-8 w-8 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Auction not found
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              The auction may have ended or been cancelled.
            </div>
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
  const isActive = auction?.status === 'active';
  const isWinner = auction && wallet?.address && auction.currentBidder === wallet.address;
  const canReclaim = auction && isEnded && currentBid === 0n && wallet?.address === auction.sellerAddress;

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

              {!isEnded && isActive ? (
                <div className="space-y-3">
                  <div className="relative">
                    <input
                      type="number"
                      value={bidAmount}
                      onChange={(e) => { setBidAmount(e.target.value); setError(''); }}
                      placeholder={`Min: ${formatBCH(currentBid > 0n ? currentBid + (auction?.minBidIncrement || 1000n) : minBid)}`}
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
                  <p style={{ color: 'var(--text-muted)' }}>
                    {isActive ? 'This auction has ended' : 'This auction is not active'}
                  </p>
                  {currentBid > 0n && (
                    <p className="text-sm mt-1" style={{ color: 'var(--accent-purple)' }}>
                      Winning bid: {formatBCH(currentBid)}
                    </p>
                  )}

                  {isWinner && (
                    <button
                      onClick={handleClaim}
                      disabled={isBidding}
                      className="btn-primary w-full mt-4 py-3 text-sm"
                    >
                      {isBidding ? 'Claiming...' : 'Claim NFT'}
                    </button>
                  )}

                  {canReclaim && (
                    <button
                      onClick={handleReclaim}
                      disabled={isBidding}
                      className="btn-secondary w-full mt-3 py-2 text-sm"
                    >
                      {isBidding ? 'Reclaiming...' : 'Reclaim NFT'}
                    </button>
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
