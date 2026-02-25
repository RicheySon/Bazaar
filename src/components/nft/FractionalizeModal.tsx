'use client';

import { useState } from 'react';
import { X, Layers, Loader2, Check, ExternalLink, Info } from 'lucide-react';
import { loadWallet, getPkhHex } from '@/lib/bch/wallet';
import { useWalletStore } from '@/lib/store/wallet-store';
import { bchToSatoshis, formatBCH } from '@/lib/utils';
import Link from 'next/link';
import type { WalletNFT } from '@/components/nft/ListNFTModal';

interface FractionalizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  nft: WalletNFT;
  ownerAddress: string;
  ownerTokenAddress: string;
  onComplete: (sharesCategory: string, txid: string) => void;
}

type Phase = 'form' | 'processing' | 'done';

export function FractionalizeModal({
  isOpen,
  onClose,
  nft,
  ownerAddress,
  ownerTokenAddress,
  onComplete,
}: FractionalizeModalProps) {
  const [phase, setPhase] = useState<Phase>('form');
  const [reserveBCH, setReserveBCH] = useState('');
  const [txid, setTxid] = useState('');
  const [sharesCategory, setSharesCategory] = useState('');
  const [error, setError] = useState('');
  const { connectionType } = useWalletStore();

  const handleFractionalize = async () => {
    if (connectionType === 'walletconnect') {
      setError('Fractionalize requires the built-in wallet. WalletConnect does not expose signing keys needed to build this transaction.');
      return;
    }
    const walletData = loadWallet();
    if (!walletData) {
      setError('Wallet not connected. Please connect your wallet first.');
      return;
    }

    const reserveSats = bchToSatoshis(parseFloat(reserveBCH) || 0);
    if (reserveSats < 10000n) {
      setError('Reserve price must be at least 0.0001 BCH (10,000 sats).');
      return;
    }

    const ownerPkh = getPkhHex(walletData);
    const privateKeyHex = Array.from(walletData.privateKey)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    setPhase('processing');
    setError('');

    try {
      const res = await fetch('/api/fractionalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKeyHex,
          ownerPkh,
          ownerAddress,
          ownerTokenAddress,
          nftUtxo: {
            txid: nft.txid,
            vout: nft.vout,
            satoshis: nft.satoshis,
            tokenCategory: nft.tokenCategory,
            nftCommitment: nft.nftCommitment,
            nftCapability: nft.nftCapability || 'none',
          },
          reserveSats: reserveSats.toString(),
        }),
      });

      const result = await res.json();
      if (result.success && result.txid && result.sharesCategory) {
        setTxid(result.txid);
        setSharesCategory(result.sharesCategory);
        setPhase('done');
        onComplete(result.sharesCategory, result.txid);
      } else {
        setError(result.error || 'Fractionalization failed. Please try again.');
        setPhase('form');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setPhase('form');
    }
  };

  const handleClose = () => {
    if (phase === 'processing') return;
    setPhase('form');
    setError('');
    setReserveBCH('');
    setTxid('');
    setSharesCategory('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={phase === 'form' ? handleClose : undefined}
      />
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4" style={{ color: 'var(--accent)' }} />
            <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              {phase === 'done' ? 'Fractionalized!' : 'Fractionalize NFT'}
            </span>
          </div>
          {phase !== 'processing' && (
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
            >
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
              {/* Info block */}
              <div
                className="mb-5 p-3 rounded-lg flex gap-2.5"
                style={{ background: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}
              >
                <Info className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Your NFT will be locked in a vault. You receive{' '}
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    1,000,000 share tokens
                  </span>{' '}
                  representing 100% ownership. Anyone can buy out the vault by paying the reserve
                  price — share holders then claim pro-rata BCH.
                </p>
              </div>

              {/* Reserve price */}
              <div className="mb-5">
                <label
                  className="block text-xs mb-1.5 font-medium"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Buyout Reserve Price (BCH)
                </label>
                <input
                  type="number"
                  value={reserveBCH}
                  onChange={(e) => setReserveBCH(e.target.value)}
                  placeholder="1.0000"
                  min="0.0001"
                  step="0.01"
                  className="input-field w-full font-mono"
                />
                {reserveBCH && parseFloat(reserveBCH) > 0 && (
                  <div className="text-[11px] mt-1 font-mono" style={{ color: 'var(--text-muted)' }}>
                    = {formatBCH(bchToSatoshis(parseFloat(reserveBCH)))}
                  </div>
                )}
                <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  Anyone paying this amount can instantly acquire the NFT.
                </div>
              </div>

              {error && (
                <div
                  className="mb-4 px-3 py-2 rounded-lg text-xs"
                  style={{
                    background: 'color-mix(in srgb, #ef4444 10%, transparent)',
                    color: '#ef4444',
                  }}
                >
                  {error}
                </div>
              )}

              <button
                onClick={handleFractionalize}
                disabled={!reserveBCH || parseFloat(reserveBCH) <= 0}
                className="w-full py-2.5 rounded-xl font-semibold text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ background: 'var(--accent)' }}
              >
                Fractionalize NFT
              </button>
            </>
          )}

          {phase === 'processing' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--accent)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Locking NFT in vault…
              </p>
              <p className="text-xs text-center max-w-xs" style={{ color: 'var(--text-muted)' }}>
                This may take a moment. A genesis transaction is being broadcast to Chipnet.
              </p>
            </div>
          )}

          {phase === 'done' && (
            <div className="flex flex-col items-center py-4 gap-4 text-center">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}
              >
                <Check className="h-6 w-6" style={{ color: 'var(--accent)' }} />
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                NFT fractionalized successfully!
              </p>
              <p className="text-xs px-2" style={{ color: 'var(--text-secondary)' }}>
                You now hold 1,000,000 share tokens. Share the vault page so others can buy shares
                or make a buyout offer.
              </p>
              <Link
                href={`/fractionalized/${sharesCategory}`}
                className="flex items-center gap-1.5 text-xs underline font-medium"
                style={{ color: 'var(--accent)' }}
                onClick={handleClose}
              >
                View vault page <ExternalLink className="h-3 w-3" />
              </Link>
              <div className="text-[11px] font-mono mt-1" style={{ color: 'var(--text-muted)' }}>
                txid: {txid.slice(0, 20)}…
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
