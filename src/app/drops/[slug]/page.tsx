'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Users, Clock, Zap, Lock, CheckCircle, AlertCircle,
  ExternalLink, Minus, Plus, Flame, ArrowLeft, Share2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CountdownTimer } from '@/components/drops/CountdownTimer';
import { MediaDisplay } from '@/components/nft/MediaDisplay';
import { useWalletStore } from '@/lib/store/wallet-store';
import { loadWallet } from '@/lib/bch/wallet';
import { formatBCH, ipfsToHttp, shortenAddress } from '@/lib/utils';
import type { NFTDrop, DropStatus } from '@/lib/types';

const STATUS_STYLES: Record<DropStatus, { label: string; color: string; pulse?: boolean }> = {
  live:       { label: 'Live',     color: 'var(--accent)',         pulse: true },
  presale:    { label: 'Presale',  color: 'var(--accent-purple)',  pulse: true },
  upcoming:   { label: 'Upcoming', color: 'var(--accent-blue)' },
  ended:      { label: 'Ended',    color: 'var(--text-muted)' },
  'sold-out': { label: 'Sold Out', color: 'var(--accent-red)' },
};

export default function DropDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { wallet, setModalOpen } = useWalletStore();

  const [drop, setDrop] = useState<(NFTDrop & { status: DropStatus }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [isMinting, setIsMinting] = useState(false);
  const [mintResult, setMintResult] = useState<{ success: boolean; message: string; txids?: string[] } | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchDrop = useCallback(async () => {
    try {
      const res = await fetch(`/api/drops/${slug}`);
      if (!res.ok) return;
      const data = await res.json();
      setDrop(data.drop);
    } catch {
      /* ignore */
    }
  }, [slug]);

  useEffect(() => {
    setIsLoading(true);
    fetchDrop().finally(() => setIsLoading(false));
    const interval = setInterval(fetchDrop, 10000);
    return () => clearInterval(interval);
  }, [fetchDrop]);

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 py-6">
        <div className="mx-auto max-w-[1200px] animate-pulse">
          <div className="skeleton h-64 w-full rounded-xl mb-6" />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 space-y-3">
              <div className="skeleton h-8 w-2/3" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-4/5" />
            </div>
            <div className="lg:col-span-2">
              <div className="skeleton h-64 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!drop) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="h-10 w-10 mb-3" style={{ color: 'var(--text-muted)' }} />
        <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Drop not found</h3>
        <Link href="/drops" className="btn-secondary text-xs px-4 py-2">Back to Drops</Link>
      </div>
    );
  }

  const statusStyle = STATUS_STYLES[drop.status];
  const mintPrice = BigInt(drop.mintPrice || '0');
  const mintedPct = drop.totalSupply > 0 ? (drop.mintedCount / drop.totalSupply) * 100 : 0;
  const remaining = drop.totalSupply - drop.mintedCount;
  const imageUrl = drop.bannerImage ? ipfsToHttp(drop.bannerImage) : null;

  const userMinted = wallet?.address ? (drop.mintedBy[wallet.address] ?? 0) : 0;
  const canMintMore = wallet?.address ? userMinted < drop.maxPerWallet : true;
  const maxMintable = wallet?.address ? Math.min(drop.maxPerWallet - userMinted, remaining) : 0;
  const isOnWhitelist = drop.whitelistAddresses?.includes(wallet?.address ?? '') ?? false;

  const mintEnabled =
    wallet?.isConnected &&
    (drop.status === 'live' || (drop.status === 'presale' && isOnWhitelist)) &&
    canMintMore &&
    remaining > 0 &&
    !isMinting;

  const handleMint = async () => {
    if (!wallet?.isConnected) {
      setModalOpen(true);
      return;
    }

    const stored = loadWallet();
    if (!stored) {
      setMintResult({ success: false, message: 'Wallet keys not found. Please reconnect your wallet.' });
      return;
    }

    setIsMinting(true);
    setMintResult(null);

    try {
      const pkh = Buffer.from(stored.pubkeyHash).toString('hex');
      const privateKeyHex = Buffer.from(stored.privateKey).toString('hex');

      const res = await fetch('/api/drops/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dropId: drop.id,
          buyerAddress: wallet.address,
          pkh,
          tokenAddress: wallet.tokenAddress,
          privateKeyHex,
          quantity,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMintResult({ success: false, message: data.error || 'Mint failed. Please try again.' });
      } else {
        const txids = (data.minted as any[]).map((m) => m.txid);
        const nums = (data.minted as any[]).map((m) => `#${m.nftNumber}`).join(', ');
        setMintResult({
          success: true,
          message: `Successfully minted ${nums}!`,
          txids,
        });
        await fetchDrop();
      }
    } catch (err) {
      setMintResult({ success: false, message: err instanceof Error ? err.message : 'Unexpected error.' });
    } finally {
      setIsMinting(false);
    }
  };

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalCost = mintPrice * BigInt(quantity);
  const countdownTarget =
    drop.status === 'upcoming'
      ? (drop.whitelistEnabled && drop.whitelistStartTime ? drop.whitelistStartTime : drop.mintStartTime)
      : drop.status === 'presale'
        ? drop.mintStartTime
        : null;

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="mx-auto max-w-[1200px]">

        {/* Back link */}
        <Link href="/drops" className="inline-flex items-center gap-1.5 text-xs mb-4 hover:text-[var(--text-primary)] transition-colors" style={{ color: 'var(--text-muted)' }}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Drops
        </Link>

        {/* Banner */}
        <div className="relative h-56 sm:h-72 rounded-xl overflow-hidden mb-6" style={{ background: 'var(--bg-secondary)' }}>
          {imageUrl ? (
            <MediaDisplay src={imageUrl} alt={drop.name} fill className="object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-8xl font-black font-mono" style={{ color: 'var(--accent)', opacity: 0.1 }}>
                {drop.name.slice(0, 2).toUpperCase()}
              </span>
            </div>
          )}
          {/* Gradient overlay */}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, var(--bg-primary) 0%, transparent 60%)' }} />

          {/* Status badge */}
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full"
              style={{ background: 'rgba(0,0,0,0.7)', color: statusStyle.color }}>
              {statusStyle.pulse && (
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              )}
              {statusStyle.label}
            </span>
          </div>

          {/* Share */}
          <button
            onClick={handleShare}
            className="absolute top-4 right-4 p-2 rounded-lg transition-colors"
            style={{ background: 'rgba(0,0,0,0.7)', color: copied ? 'var(--accent)' : 'var(--text-muted)' }}
            title="Copy link"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Left: Info */}
          <div className="lg:col-span-3 space-y-5">
            <div>
              <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{drop.name}</h1>
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                <span>By</span>
                <Link href={`/profile/${drop.creatorAddress}`} className="font-mono hover:text-[var(--accent)] transition-colors">
                  {shortenAddress(drop.creatorAddress, 6)}
                </Link>
                <span>·</span>
                <span>{drop.collectionName}</span>
                {drop.royaltyBasisPoints > 0 && (
                  <>
                    <span>·</span>
                    <span>{drop.royaltyBasisPoints / 100}% royalty</span>
                  </>
                )}
              </div>
            </div>

            {drop.description && (
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {drop.description}
              </p>
            )}

            {/* Collection attributes */}
            {drop.attributes && drop.attributes.length > 0 && (
              <div>
                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Collection Traits</div>
                <div className="flex flex-wrap gap-2">
                  {drop.attributes.map((attr) => (
                    <div key={attr.trait_type} className="px-2 py-1 rounded-lg text-xs" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{attr.trait_type}: </span>
                      <span style={{ color: 'var(--text-primary)' }}>{attr.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total Supply', value: drop.totalSupply.toLocaleString() },
                { label: 'Minted',       value: drop.mintedCount.toLocaleString() },
                { label: 'Remaining',    value: remaining.toLocaleString() },
              ].map(({ label, value }) => (
                <div key={label} className="card p-3 text-center">
                  <div className="text-[10px] mb-1 uppercase" style={{ color: 'var(--text-muted)' }}>{label}</div>
                  <div className="text-sm font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Supply bar */}
            <div>
              <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                <span>Minted: {drop.mintedCount}/{drop.totalSupply}</span>
                <span>{mintedPct.toFixed(1)}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${mintedPct}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ background: 'var(--accent)' }}
                />
              </div>
            </div>

            {/* Whitelist section */}
            {drop.whitelistEnabled && (
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Lock className="h-4 w-4" style={{ color: 'var(--accent-purple)' }} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Allowlist Access</span>
                </div>
                <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                  This drop has an early access phase for allowlisted wallets.
                </p>
                {wallet?.isConnected ? (
                  isOnWhitelist ? (
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--accent)' }}>
                      <CheckCircle className="h-3.5 w-3.5" />
                      Your wallet is on the allowlist
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <AlertCircle className="h-3.5 w-3.5" />
                      Your wallet is not on the allowlist
                    </div>
                  )
                ) : (
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Connect wallet to check allowlist status
                  </div>
                )}
                {drop.whitelistStartTime && (
                  <div className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    Pre-sale: {new Date(drop.whitelistStartTime * 1000).toLocaleString()}
                  </div>
                )}
              </div>
            )}

            {/* Schedule */}
            <div className="card p-4">
              <div className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>Schedule</div>
              <div className="space-y-2 text-xs">
                {drop.whitelistEnabled && drop.whitelistStartTime && (
                  <div className="flex items-center justify-between">
                    <span style={{ color: 'var(--text-muted)' }}>Pre-sale opens</span>
                    <span className="font-mono" style={{ color: 'var(--accent-purple)' }}>
                      {new Date(drop.whitelistStartTime * 1000).toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Public mint opens</span>
                  <span className="font-mono" style={{ color: 'var(--accent)' }}>
                    {new Date(drop.mintStartTime * 1000).toLocaleString()}
                  </span>
                </div>
                {drop.mintEndTime && (
                  <div className="flex items-center justify-between">
                    <span style={{ color: 'var(--text-muted)' }}>Mint closes</span>
                    <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>
                      {new Date(drop.mintEndTime * 1000).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Mint panel */}
          <div className="lg:col-span-2">
            <div className="card p-5 sticky top-20">

              {/* Countdown */}
              {countdownTarget && (
                <div className="mb-4 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
                  <CountdownTimer
                    targetTime={countdownTarget}
                    size="lg"
                    label={drop.status === 'presale' ? 'Public mint opens in' : (drop.whitelistEnabled && drop.whitelistStartTime ? 'Pre-sale opens in' : 'Mint opens in')}
                    onExpire={fetchDrop}
                  />
                </div>
              )}

              {/* Live now indicator */}
              {(drop.status === 'live' || drop.status === 'presale') && (
                <div className="flex items-center gap-2 mb-4 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
                  <Flame className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
                    {drop.status === 'presale' ? 'Pre-sale is live!' : 'Minting is live!'}
                  </span>
                </div>
              )}

              {/* Price */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Mint Price</span>
                <span className="text-lg font-bold font-mono" style={{ color: 'var(--accent)' }}>
                  {mintPrice === 0n ? 'Free' : formatBCH(mintPrice)}
                </span>
              </div>

              {/* Quantity selector */}
              {drop.status !== 'ended' && drop.status !== 'sold-out' && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Quantity</span>
                    {wallet?.address && (
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {userMinted}/{drop.maxPerWallet} minted
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setQuantity(q => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      className="p-2 rounded-lg border transition-colors disabled:opacity-30"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="flex-1 text-center text-lg font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                      {quantity}
                    </span>
                    <button
                      onClick={() => setQuantity(q => Math.min(maxMintable || 1, q + 1))}
                      disabled={quantity >= (maxMintable || 1)}
                      className="p-2 rounded-lg border transition-colors disabled:opacity-30"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Total cost */}
                  {mintPrice > 0n && quantity > 1 && (
                    <div className="flex items-center justify-between mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span>Total cost</span>
                      <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{formatBCH(totalCost)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Mint result */}
              <AnimatePresence>
                {mintResult && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="mb-4 p-3 rounded-lg text-xs"
                    style={{
                      background: mintResult.success ? 'rgba(0,229,69,0.1)' : 'rgba(239,68,68,0.1)',
                      border: `1px solid ${mintResult.success ? 'rgba(0,229,69,0.3)' : 'rgba(239,68,68,0.3)'}`,
                      color: mintResult.success ? 'var(--accent)' : 'var(--accent-red)',
                    }}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {mintResult.success ? <CheckCircle className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                      <span className="font-semibold">{mintResult.success ? 'Success!' : 'Error'}</span>
                    </div>
                    <div>{mintResult.message}</div>
                    {mintResult.txids && mintResult.txids.map((txid) => (
                      <a
                        key={txid}
                        href={`https://chipnet.imaginary.cash/tx/${txid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 mt-1 font-mono hover:underline"
                        style={{ color: 'var(--accent)' }}
                      >
                        {txid.slice(0, 20)}…
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* CTA */}
              {drop.status === 'ended' ? (
                <div className="text-center py-3 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
                  This drop has ended
                </div>
              ) : drop.status === 'sold-out' ? (
                <div className="text-center py-3 text-sm font-semibold" style={{ color: 'var(--accent-red)' }}>
                  Sold out
                </div>
              ) : !wallet?.isConnected ? (
                <button
                  onClick={() => setModalOpen(true)}
                  className="btn-primary w-full text-sm py-3"
                >
                  Connect Wallet to Mint
                </button>
              ) : drop.status === 'upcoming' ? (
                <button disabled className="btn-secondary w-full text-sm py-3 opacity-50 cursor-not-allowed">
                  Mint Not Open Yet
                </button>
              ) : drop.status === 'presale' && !isOnWhitelist ? (
                <button disabled className="btn-secondary w-full text-sm py-3 opacity-50 cursor-not-allowed">
                  Not on Allowlist
                </button>
              ) : !canMintMore ? (
                <button disabled className="btn-secondary w-full text-sm py-3 opacity-50 cursor-not-allowed">
                  Wallet Limit Reached ({drop.maxPerWallet}/{drop.maxPerWallet})
                </button>
              ) : (
                <button
                  onClick={handleMint}
                  disabled={!mintEnabled || isMinting}
                  className="btn-primary w-full text-sm py-3 disabled:opacity-50"
                >
                  {isMinting ? 'Minting…' : mintPrice === 0n ? `Mint ${quantity > 1 ? `${quantity} NFTs` : 'Free NFT'}` : `Mint ${quantity > 1 ? `${quantity} NFTs` : 'NFT'} · ${formatBCH(totalCost)}`}
                </button>
              )}

              {/* Per-wallet limit note */}
              <div className="mt-3 text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Max {drop.maxPerWallet} per wallet · {remaining} remaining
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
