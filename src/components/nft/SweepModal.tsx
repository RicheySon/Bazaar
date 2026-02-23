'use client';

import { useState, useEffect } from 'react';
import { X, Zap, Check, AlertCircle, Loader2 } from 'lucide-react';
import { loadWallet } from '@/lib/bch/wallet';
import { formatBCH } from '@/lib/utils';
import type { NFTListing } from '@/lib/types';

interface SweepResult {
  txid: string;
  success: boolean;
  purchaseTxid?: string;
  error?: string;
  skipped?: boolean;
}

type RowStatus = 'pending' | 'buying' | 'success' | 'failed' | 'skipped';

interface RowState {
  status: RowStatus;
  purchaseTxid?: string;
  error?: string;
}

type Phase = 'confirm' | 'sweeping' | 'done';

interface SweepModalProps {
  isOpen: boolean;
  onClose: () => void;
  listings: NFTListing[];
  buyerAddress: string;
  onComplete: () => void;
}

export function SweepModal({ isOpen, onClose, listings, buyerAddress, onComplete }: SweepModalProps) {
  const [phase, setPhase] = useState<Phase>('confirm');
  const [rowStates, setRowStates] = useState<Map<string, RowState>>(new Map());
  const [summary, setSummary] = useState({ attempted: 0, succeeded: 0, failed: 0 });

  // Reset state whenever modal opens with new listings
  useEffect(() => {
    if (isOpen) {
      setPhase('confirm');
      setRowStates(new Map());
      setSummary({ attempted: 0, succeeded: 0, failed: 0 });
    }
  }, [isOpen]);

  const totalCost = listings.reduce((s, l) => s + l.price, 0n);

  const updateRow = (txid: string, state: RowState) => {
    setRowStates((prev) => new Map(prev).set(txid, state));
  };

  const handleSweep = async () => {
    const walletData = loadWallet();
    if (!walletData) {
      alert('Wallet not connected. Please connect your wallet first.');
      return;
    }

    setPhase('sweeping');

    // Convert private key Uint8Array → hex string for API
    const privateKeyHex = Array.from(walletData.privateKey)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    let succeeded = 0;
    let failed = 0;

    for (const listing of listings) {
      updateRow(listing.txid, { status: 'buying' });

      try {
        const res = await fetch('/api/sweep', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            listing: {
              txid: listing.txid,
              tokenCategory: listing.tokenCategory,
              price: listing.price.toString(),
              seller: listing.sellerAddress,
              sellerPkh: listing.sellerPkh,
              creator: listing.creatorAddress,
              creatorPkh: listing.creatorPkh,
              commitment: listing.commitment,
              royaltyBasisPoints: listing.royaltyBasisPoints,
            },
            privateKeyHex,
            buyerAddress,
          }),
        });

        const result: SweepResult = await res.json();

        if (result.skipped) {
          updateRow(listing.txid, { status: 'skipped', error: result.error });
          failed++;
        } else if (result.success) {
          updateRow(listing.txid, { status: 'success', purchaseTxid: result.purchaseTxid });
          succeeded++;
        } else {
          updateRow(listing.txid, { status: 'failed', error: result.error });
          failed++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Network error';
        updateRow(listing.txid, { status: 'failed', error: msg });
        failed++;
      }
    }

    setSummary({ attempted: listings.length, succeeded, failed });
    setPhase('done');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={phase === 'confirm' ? onClose : undefined} />

      <div
        className="relative w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4" style={{ color: 'var(--accent)' }} />
            <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              {phase === 'confirm' && 'Confirm Sweep'}
              {phase === 'sweeping' && 'Sweeping…'}
              {phase === 'done' && 'Sweep Complete'}
            </span>
          </div>
          {phase !== 'sweeping' && (
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors">
              <X className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          {phase === 'confirm' && (
            <>
              <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
                You are about to purchase {listings.length} NFT{listings.length !== 1 ? 's' : ''} sequentially.
                Each transaction will be submitted separately.
              </p>
              <div className="space-y-2">
                {listings.map((item) => (
                  <div
                    key={item.txid}
                    className="flex items-center justify-between py-2 px-3 rounded-lg"
                    style={{ background: 'var(--bg-secondary)' }}
                  >
                    <span className="text-sm truncate max-w-[60%]" style={{ color: 'var(--text-primary)' }}>
                      {item.metadata?.name || `Token #${item.tokenCategory.slice(0, 8)}`}
                    </span>
                    <span className="text-sm font-mono shrink-0" style={{ color: 'var(--accent)' }}>
                      {formatBCH(item.price)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {(phase === 'sweeping' || phase === 'done') && (
            <div className="space-y-2">
              {listings.map((item) => {
                const row = rowStates.get(item.txid);
                return (
                  <div
                    key={item.txid}
                    className="flex items-center justify-between py-2 px-3 rounded-lg"
                    style={{ background: 'var(--bg-secondary)' }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Status icon */}
                      {!row || row.status === 'pending' ? (
                        <div className="w-4 h-4 rounded-full border-2 shrink-0" style={{ borderColor: 'var(--border)' }} />
                      ) : row.status === 'buying' ? (
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" style={{ color: 'var(--accent)' }} />
                      ) : row.status === 'success' ? (
                        <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--accent)' }}>
                          <Check className="h-2.5 w-2.5 text-white" />
                        </div>
                      ) : (
                        <AlertCircle className="h-4 w-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                      )}
                      <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                        {item.metadata?.name || `Token #${item.tokenCategory.slice(0, 8)}`}
                      </span>
                    </div>
                    <div className="text-right ml-2 shrink-0">
                      {row?.status === 'failed' || row?.status === 'skipped' ? (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {row.status === 'skipped' ? 'Skipped' : 'Failed'}
                        </span>
                      ) : (
                        <span className="text-sm font-mono" style={{ color: 'var(--accent)' }}>
                          {formatBCH(item.price)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          {phase === 'confirm' && (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Total cost</div>
                <div className="text-base font-bold font-mono" style={{ color: 'var(--accent)' }}>
                  {formatBCH(totalCost)}
                </div>
              </div>
              <button
                onClick={handleSweep}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm text-white transition-opacity hover:opacity-90"
                style={{ background: 'var(--accent)' }}
              >
                <Zap className="h-4 w-4" />
                Sweep {listings.length} NFT{listings.length !== 1 ? 's' : ''}
              </button>
            </div>
          )}

          {phase === 'sweeping' && (
            <div className="flex items-center justify-center gap-2 py-1">
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--text-muted)' }} />
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Processing {listings.length} purchase{listings.length !== 1 ? 's' : ''}…
              </span>
            </div>
          )}

          {phase === 'done' && (
            <div className="flex items-center justify-between">
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span className="font-semibold" style={{ color: 'var(--accent)' }}>{summary.succeeded}</span>
                {' '}of{' '}
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{summary.attempted}</span>
                {' '}purchased
                {summary.failed > 0 && (
                  <span className="ml-1" style={{ color: 'var(--text-muted)' }}>
                    ({summary.failed} failed)
                  </span>
                )}
              </div>
              <button
                onClick={() => { onComplete(); onClose(); }}
                className="px-5 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
