'use client';

import { useState } from 'react';
import { X, Tag, Gavel, Loader2, Check, ExternalLink } from 'lucide-react';
import { loadWallet, getPkhHex } from '@/lib/bch/wallet';
import { bchToSatoshis, formatBCH } from '@/lib/utils';
import Link from 'next/link';

export interface WalletNFT {
  txid: string;
  vout: number;
  satoshis: string;
  tokenCategory: string;
  nftCommitment: string;
  nftCapability: string;
}

interface ListNFTModalProps {
  isOpen: boolean;
  onClose: () => void;
  nft: WalletNFT;
  ownerAddress: string;
  onComplete: (listingTxid: string) => void;
}

type Phase = 'form' | 'listing' | 'done';

export function ListNFTModal({ isOpen, onClose, nft, ownerAddress, onComplete }: ListNFTModalProps) {
  const [phase, setPhase] = useState<Phase>('form');
  const [listingType, setListingType] = useState<'fixed' | 'auction'>('fixed');
  const [priceBCH, setPriceBCH] = useState('');
  const [royaltyPct, setRoyaltyPct] = useState('10');
  const [auctionDurationHrs, setAuctionDurationHrs] = useState('24');
  const [minIncrementBCH, setMinIncrementBCH] = useState('0.001');
  const [listingTxid, setListingTxid] = useState('');
  const [error, setError] = useState('');

  const handleList = async () => {
    const walletData = loadWallet();
    if (!walletData) {
      setError('Wallet not connected. Please connect your wallet first.');
      return;
    }

    const priceSats = bchToSatoshis(parseFloat(priceBCH) || 0);
    if (priceSats <= 0n) {
      setError('Please enter a valid price greater than 0.');
      return;
    }

    const royaltyBps = Math.round(parseFloat(royaltyPct || '0') * 100);
    const sellerPkh = getPkhHex(walletData);

    const privateKeyHex = Array.from(walletData.privateKey)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    setPhase('listing');
    setError('');

    try {
      const body: Record<string, unknown> = {
        privateKeyHex,
        sellerPkh,
        sellerAddress: ownerAddress,
        creatorPkh: sellerPkh,
        tokenCategory: nft.tokenCategory,
        nftUtxo: {
          txid: nft.txid,
          vout: nft.vout,
          satoshis: nft.satoshis,
          commitment: nft.nftCommitment,
          capability: nft.nftCapability || 'none',
        },
        listingType,
        royaltyBasisPoints: royaltyBps,
      };

      if (listingType === 'fixed') {
        body.price = priceSats.toString();
      } else {
        body.minBid = priceSats.toString();
        body.minBidIncrement = bchToSatoshis(parseFloat(minIncrementBCH) || 0.001).toString();
        body.endTime = (Math.floor(Date.now() / 1000) + parseInt(auctionDurationHrs) * 3600).toString();
      }

      const res = await fetch('/api/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await res.json();
      if (result.success && result.txid) {
        setListingTxid(result.txid);
        setPhase('done');
        onComplete(result.txid);
      } else {
        setError(result.error || 'Listing failed. Please try again.');
        setPhase('form');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setPhase('form');
    }
  };

  const handleClose = () => {
    setPhase('form');
    setError('');
    setPriceBCH('');
    setListingTxid('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={phase === 'form' ? handleClose : undefined} />
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4" style={{ color: 'var(--accent)' }} />
            <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              {phase === 'done' ? 'Listed Successfully' : 'List on Bazaar'}
            </span>
          </div>
          {phase !== 'listing' && (
            <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors">
              <X className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          {/* NFT identity */}
          <div className="mb-5 p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            <div className="text-xs font-mono truncate" style={{ color: 'var(--text-muted)' }}>
              {nft.tokenCategory.slice(0, 16)}…
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              txid: {nft.txid.slice(0, 12)}…
            </div>
          </div>

          {phase === 'form' && (
            <>
              {/* Listing type */}
              <div className="mb-4">
                <label className="block text-xs mb-2 font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Listing Type
                </label>
                <div className="flex gap-2">
                  {(['fixed', 'auction'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setListingType(type)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        listingType === type
                          ? 'border-[var(--accent)] text-[var(--accent)]'
                          : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]'
                      }`}
                      style={listingType === type ? { background: 'color-mix(in srgb, var(--accent) 8%, transparent)' } : {}}
                    >
                      {type === 'fixed' ? <Tag className="h-3.5 w-3.5" /> : <Gavel className="h-3.5 w-3.5" />}
                      {type === 'fixed' ? 'Fixed Price' : 'Auction'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price */}
              <div className="mb-4">
                <label className="block text-xs mb-1.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {listingType === 'fixed' ? 'Price (BCH)' : 'Starting Bid (BCH)'}
                </label>
                <input
                  type="number"
                  value={priceBCH}
                  onChange={(e) => setPriceBCH(e.target.value)}
                  placeholder="0.0100"
                  min="0.00001"
                  step="0.001"
                  className="input-field w-full font-mono"
                />
                {priceBCH && parseFloat(priceBCH) > 0 && (
                  <div className="text-[11px] mt-1 font-mono" style={{ color: 'var(--text-muted)' }}>
                    = {formatBCH(bchToSatoshis(parseFloat(priceBCH)))}
                  </div>
                )}
              </div>

              {/* Auction extras */}
              {listingType === 'auction' && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="block text-xs mb-1.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Duration (hours)
                    </label>
                    <input
                      type="number"
                      value={auctionDurationHrs}
                      onChange={(e) => setAuctionDurationHrs(e.target.value)}
                      min="1"
                      max="168"
                      className="input-field w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Min Increment (BCH)
                    </label>
                    <input
                      type="number"
                      value={minIncrementBCH}
                      onChange={(e) => setMinIncrementBCH(e.target.value)}
                      min="0.00001"
                      step="0.001"
                      className="input-field w-full font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Royalty */}
              <div className="mb-5">
                <label className="block text-xs mb-1.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Creator Royalty (%)
                </label>
                <input
                  type="number"
                  value={royaltyPct}
                  onChange={(e) => setRoyaltyPct(e.target.value)}
                  min="0"
                  max="50"
                  step="0.5"
                  className="input-field w-full"
                />
                <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  You receive royalties on secondary sales as the creator.
                </div>
              </div>

              {error && (
                <div className="mb-4 px-3 py-2 rounded-lg text-xs" style={{ background: 'color-mix(in srgb, #ef4444 10%, transparent)', color: '#ef4444' }}>
                  {error}
                </div>
              )}

              <button
                onClick={handleList}
                disabled={!priceBCH || parseFloat(priceBCH) <= 0}
                className="w-full py-2.5 rounded-xl font-semibold text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ background: 'var(--accent)' }}
              >
                List on Bazaar
              </button>
            </>
          )}

          {phase === 'listing' && (
            <div className="flex flex-col items-center py-6 gap-3">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--accent)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Creating listing on-chain…</p>
            </div>
          )}

          {phase === 'done' && (
            <div className="flex flex-col items-center py-4 gap-4 text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
                <Check className="h-6 w-6" style={{ color: 'var(--accent)' }} />
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                NFT is now listed on Bazaar!
              </p>
              <Link
                href={`/nft/${listingTxid}`}
                className="flex items-center gap-1.5 text-xs underline"
                style={{ color: 'var(--accent)' }}
                onClick={handleClose}
              >
                View listing <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
