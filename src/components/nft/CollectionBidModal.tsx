'use client';

import { useState } from 'react';
import { X, Gavel, Loader2, Check, ExternalLink } from 'lucide-react';
import { loadWallet, getPkhHex } from '@/lib/bch/wallet';
import { bchToSatoshis, formatBCH } from '@/lib/utils';
import { getExplorerTxUrl } from '@/lib/bch/config';

interface CollectionBidModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokenCategory: string;
  creatorPkh: string;
  creatorAddress: string;
  royaltyBasisPoints: number;
  onComplete: (txid: string) => void;
}

type Phase = 'form' | 'placing' | 'done';

export function CollectionBidModal({
  isOpen,
  onClose,
  tokenCategory,
  creatorPkh,
  creatorAddress,
  royaltyBasisPoints,
  onComplete,
}: CollectionBidModalProps) {
  const [phase, setPhase] = useState<Phase>('form');
  const [bidBCH, setBidBCH] = useState('');
  const [txid, setTxid] = useState('');
  const [error, setError] = useState('');

  const handlePlaceBid = async () => {
    const walletData = loadWallet();
    if (!walletData) {
      setError('Wallet not connected. Please connect your wallet first.');
      return;
    }

    if (!tokenCategory || !creatorPkh) {
      setError('Collection metadata missing (token category or creator).');
      return;
    }

    const priceSats = bchToSatoshis(parseFloat(bidBCH) || 0);
    if (priceSats <= 0n) {
      setError('Please enter a valid bid greater than 0.');
      return;
    }

    const bidderPkh = getPkhHex(walletData);
    const privateKeyHex = Array.from(walletData.privateKey)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    setPhase('placing');
    setError('');

    try {
      const res = await fetch('/api/collection-bid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKeyHex,
          bidderPkh,
          bidderAddress: walletData.address,
          tokenCategory,
          price: priceSats.toString(),
          creatorPkh,
          royaltyBasisPoints,
        }),
      });

      const result = await res.json();
      if (result.success && result.txid) {
        setTxid(result.txid);
        setPhase('done');
        onComplete(result.txid);
      } else {
        setError(result.error || 'Bid placement failed. Please try again.');
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
    setBidBCH('');
    setTxid('');
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
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <Gavel className="h-4 w-4" style={{ color: 'var(--accent)' }} />
            <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              {phase === 'done' ? 'Bid Placed' : 'Place Collection Bid'}
            </span>
          </div>
          {phase !== 'placing' && (
            <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors">
              <X className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
        </div>

        <div className="px-5 py-5">
          <div className="mb-5 p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            <div className="text-[11px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>
              {tokenCategory.slice(0, 16)}…
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Creator: {creatorAddress ? `${creatorAddress.slice(0, 10)}…` : 'unknown'}
            </div>
          </div>

          {phase === 'form' && (
            <>
              <div className="mb-4">
                <label className="block text-xs mb-1.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Bid Amount (BCH)
                </label>
                <input
                  type="number"
                  value={bidBCH}
                  onChange={(e) => setBidBCH(e.target.value)}
                  placeholder="0.0100"
                  min="0.00001"
                  step="0.001"
                  className="input-field w-full font-mono"
                />
                {bidBCH && parseFloat(bidBCH) > 0 && (
                  <div className="text-[11px] mt-1 font-mono" style={{ color: 'var(--text-muted)' }}>
                    = {formatBCH(bchToSatoshis(parseFloat(bidBCH)))}
                  </div>
                )}
              </div>

              <div className="mb-5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Royalty: {(royaltyBasisPoints || 0) / 100}% → paid automatically to the creator.
              </div>

              {error && (
                <div className="mb-4 px-3 py-2 rounded-lg text-xs" style={{ background: 'color-mix(in srgb, #ef4444 10%, transparent)', color: '#ef4444' }}>
                  {error}
                </div>
              )}

              <button
                onClick={handlePlaceBid}
                disabled={!bidBCH || parseFloat(bidBCH) <= 0}
                className="w-full py-2.5 rounded-xl font-semibold text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ background: 'var(--accent)' }}
              >
                Place Bid
              </button>
            </>
          )}

          {phase === 'placing' && (
            <div className="flex flex-col items-center py-6 gap-3">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--accent)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Submitting bid on-chain…</p>
            </div>
          )}

          {phase === 'done' && (
            <div className="flex flex-col items-center py-4 gap-4 text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
                <Check className="h-6 w-6" style={{ color: 'var(--accent)' }} />
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Collection bid is live!
              </p>
              {txid && (
                <a
                  href={getExplorerTxUrl(txid)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs underline"
                  style={{ color: 'var(--accent)' }}
                  onClick={handleClose}
                >
                  View transaction <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
