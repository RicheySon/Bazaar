'use client';

import { useState } from 'react';
import { X, Loader2, Check, ExternalLink } from 'lucide-react';
import { loadWallet } from '@/lib/bch/wallet';
import { formatBCH } from '@/lib/utils';
import { getExplorerTxUrl } from '@/lib/bch/config';
import type { CollectionBid } from '@/lib/types';

interface CancelBidModalProps {
  isOpen: boolean;
  onClose: () => void;
  bid: CollectionBid;
  bidderAddress: string;
  onComplete: (txid: string) => void;
}

type Phase = 'confirm' | 'cancelling' | 'done';

export function CancelBidModal({
  isOpen,
  onClose,
  bid,
  bidderAddress,
  onComplete,
}: CancelBidModalProps) {
  const [phase, setPhase] = useState<Phase>('confirm');
  const [txid, setTxid] = useState('');
  const [error, setError] = useState('');

  const handleCancel = async () => {
    const walletData = loadWallet();
    if (!walletData) {
      setError('Wallet not connected. Please connect your wallet first.');
      return;
    }

    const privateKeyHex = Array.from(walletData.privateKey)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    setPhase('cancelling');
    setError('');

    try {
      const res = await fetch('/api/collection-bid/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKeyHex,
          bidderAddress,
          bid,
        }),
      });

      const result = await res.json();
      if (result.success && result.txid) {
        setTxid(result.txid);
        setPhase('done');
        onComplete(result.txid);
      } else {
        setError(result.error || 'Failed to cancel bid.');
        setPhase('confirm');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setPhase('confirm');
    }
  };

  const handleClose = () => {
    setPhase('confirm');
    setError('');
    setTxid('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={phase === 'confirm' ? handleClose : undefined} />
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            {phase === 'done' ? 'Bid Cancelled' : 'Cancel Collection Bid'}
          </span>
          {phase !== 'cancelling' && (
            <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors">
              <X className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
        </div>

        <div className="px-5 py-5">
          {phase === 'confirm' && (
            <>
              <div className="mb-4 p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Bid Amount</div>
                <div className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>
                  {formatBCH(BigInt(bid.price))}
                </div>
              </div>

              {error && (
                <div className="mb-4 px-3 py-2 rounded-lg text-xs" style={{ background: 'color-mix(in srgb, #ef4444 10%, transparent)', color: '#ef4444' }}>
                  {error}
                </div>
              )}

              <button
                onClick={handleCancel}
                className="w-full py-2.5 rounded-xl font-semibold text-sm text-white transition-opacity hover:opacity-90"
                style={{ background: 'var(--accent-red)' }}
              >
                Cancel Bid
              </button>
            </>
          )}

          {phase === 'cancelling' && (
            <div className="flex flex-col items-center py-6 gap-3">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--accent)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Cancelling on-chain…</p>
            </div>
          )}

          {phase === 'done' && (
            <div className="flex flex-col items-center py-4 gap-4 text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
                <Check className="h-6 w-6" style={{ color: 'var(--accent)' }} />
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Bid cancelled and BCH returned.
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
