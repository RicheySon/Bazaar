'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { formatBCH } from '@/lib/utils';
import { useWalletStore } from '@/lib/store/wallet-store';
import { loadWallet } from '@/lib/bch/wallet';
import type { CollectionBid, LiquidityPool } from '@/lib/types';

interface InstantSellModalProps {
  isOpen: boolean;
  onClose: () => void;
  nftUtxo: {
    txid: string;
    vout: number;
    satoshis: string | number;
    tokenCategory: string;
    commitment?: string;
    capability?: 'none' | 'mutable' | 'minting';
    metadata?: { name?: string };
  };
  /** Pre-fetched best bid (from collection bids) */
  bestBid?: CollectionBid | null;
  /** Pre-fetched best pool offer */
  bestPool?: LiquidityPool | null;
  onComplete?: (txid: string) => void;
}

type Phase = 'confirm' | 'selling' | 'done' | 'error';

const PROTOCOL_FEE_BPS = 0; // Display only; not yet enforced on-chain

export function InstantSellModal({
  isOpen,
  onClose,
  nftUtxo,
  bestBid,
  bestPool,
  onComplete,
}: InstantSellModalProps) {
  const { wallet } = useWalletStore();
  const [phase, setPhase] = useState<Phase>('confirm');
  const [txid, setTxid] = useState('');
  const [error, setError] = useState('');

  // Determine best source: bid vs pool
  const bidPrice = bestBid ? BigInt(bestBid.price) : 0n;
  const poolPrice = bestPool ? BigInt(bestPool.price) : 0n;
  const usePool = !bestBid || (bestPool && poolPrice > bidPrice);
  const bestPrice = usePool ? poolPrice : bidPrice;
  const source = usePool ? 'pool' : 'bid';

  const royaltyBps = usePool
    ? (bestPool?.royaltyBasisPoints ?? 0)
    : (bestBid?.royaltyBasisPoints ?? 0);

  const royaltyAmount = (bestPrice * BigInt(royaltyBps)) / 10000n;
  const protocolFee = (bestPrice * BigInt(PROTOCOL_FEE_BPS)) / 10000n;
  const youReceive = bestPrice - royaltyAmount - protocolFee;

  useEffect(() => {
    if (!isOpen) {
      setPhase('confirm');
      setTxid('');
      setError('');
    }
  }, [isOpen]);

  const handleSell = async () => {
    const walletData = loadWallet();
    if (!walletData || !wallet?.address) {
      setError('Wallet not connected');
      setPhase('error');
      return;
    }

    const privateKeyHex = Array.from(walletData.privateKey)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    setPhase('selling');
    setError('');

    try {
      let result: any;

      if (source === 'bid' && bestBid) {
        result = await fetch('/api/instant-sell', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            privateKeyHex,
            sellerAddress: wallet.address,
            nftUtxo: {
              txid: nftUtxo.txid,
              vout: nftUtxo.vout,
              satoshis: nftUtxo.satoshis.toString(),
              tokenCategory: nftUtxo.tokenCategory,
              commitment: nftUtxo.commitment || '',
              capability: nftUtxo.capability || 'none',
            },
          }),
        }).then((r) => r.json());
      } else if (bestPool) {
        result = await fetch('/api/pool/sell', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            privateKeyHex,
            sellerAddress: wallet.address,
            poolTxid: bestPool.txid,
            nftUtxo: {
              txid: nftUtxo.txid,
              vout: nftUtxo.vout,
              satoshis: nftUtxo.satoshis.toString(),
              tokenCategory: nftUtxo.tokenCategory,
              commitment: nftUtxo.commitment || '',
              capability: nftUtxo.capability || 'none',
            },
          }),
        }).then((r) => r.json());
      } else {
        throw new Error('No bid or pool available');
      }

      if (result.success && result.txid) {
        setTxid(result.txid);
        setPhase('done');
        onComplete?.(result.txid);
      } else {
        throw new Error(result.error || 'Transaction failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sell NFT');
      setPhase('error');
    }
  };

  const nftName = nftUtxo.metadata?.name || `Token #${nftUtxo.tokenCategory.slice(0, 8)}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={phase !== 'selling' ? onClose : undefined}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative z-10 w-full max-w-sm card p-6"
            style={{ background: 'var(--bg-primary)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5" style={{ color: 'var(--accent)' }} />
                <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Instant Sell
                </h2>
              </div>
              {phase !== 'selling' && (
                <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--bg-hover)] transition-colors">
                  <X className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                </button>
              )}
            </div>

            {phase === 'confirm' && (
              <>
                {bestPrice === 0n ? (
                  <div className="text-center py-6">
                    <AlertCircle className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      No active bids or liquidity pools for this collection.
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      To sell instantly, a buyer must place a collection bid first.
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                      Selling <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{nftName}</span>
                      {' '}to the {source === 'pool' ? 'liquidity pool' : 'highest bidder'} instantly.
                    </p>

                    {/* Source badge */}
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs mb-4"
                      style={{
                        background: source === 'pool'
                          ? 'color-mix(in srgb, var(--accent-blue) 15%, transparent)'
                          : 'color-mix(in srgb, var(--accent) 15%, transparent)',
                        color: source === 'pool' ? 'var(--accent-blue)' : 'var(--accent)',
                      }}>
                      {source === 'pool' ? 'Liquidity Pool' : 'Collection Bid'}
                    </div>

                    {/* Price breakdown */}
                    <div className="space-y-2 mb-5 rounded-xl p-4" style={{ background: 'var(--bg-secondary)' }}>
                      <Row label="Offer Price" value={formatBCH(bestPrice)} accent />
                      {royaltyAmount > 0n && (
                        <Row label={`Creator Royalty (${royaltyBps / 100}%)`} value={`- ${formatBCH(royaltyAmount)}`} />
                      )}
                      {PROTOCOL_FEE_BPS > 0 && (
                        <Row label={`Bazaar Fee (${PROTOCOL_FEE_BPS / 100}%)`} value={`- ${formatBCH(protocolFee)}`} />
                      )}
                      <div className="border-t my-2" style={{ borderColor: 'var(--border)' }} />
                      <Row label="You Receive" value={formatBCH(youReceive)} accent bold />
                    </div>

                    <button
                      onClick={handleSell}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                      style={{ background: 'var(--accent)' }}
                    >
                      <Zap className="h-4 w-4" />
                      Confirm Instant Sell
                    </button>
                  </>
                )}
              </>
            )}

            {phase === 'selling' && (
              <div className="text-center py-8">
                <Loader2 className="h-10 w-10 mx-auto mb-4 animate-spin" style={{ color: 'var(--accent)' }} />
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Broadcasting transaction…</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Selling to {source === 'pool' ? 'liquidity pool' : 'bidder'}
                </p>
              </div>
            )}

            {phase === 'done' && (
              <div className="text-center py-6">
                <CheckCircle className="h-12 w-12 mx-auto mb-3" style={{ color: 'var(--accent)' }} />
                <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Sold!</p>
                <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
                  You received <span className="font-mono" style={{ color: 'var(--accent)' }}>{formatBCH(youReceive)}</span>
                </p>
                {txid && (
                  <p className="text-[10px] font-mono break-all mt-3 px-2" style={{ color: 'var(--text-muted)' }}>
                    {txid}
                  </p>
                )}
                <button
                  onClick={onClose}
                  className="mt-5 w-full py-2.5 rounded-xl text-sm font-medium border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  Close
                </button>
              </div>
            )}

            {phase === 'error' && (
              <div className="text-center py-6">
                <AlertCircle className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--accent-red, #ef4444)' }} />
                <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Transaction Failed</p>
                <p className="text-xs px-2 mb-4" style={{ color: 'var(--text-muted)' }}>{error}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPhase('confirm')}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors hover:border-[var(--accent)]"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                  >
                    Try Again
                  </button>
                  <button
                    onClick={onClose}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors hover:border-[var(--accent-red,#ef4444)]"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function Row({ label, value, accent, bold }: { label: string; value: string; accent?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span
        className={`font-mono ${bold ? 'font-semibold text-sm' : ''}`}
        style={{ color: accent ? 'var(--accent)' : 'var(--text-primary)' }}
      >
        {value}
      </span>
    </div>
  );
}
