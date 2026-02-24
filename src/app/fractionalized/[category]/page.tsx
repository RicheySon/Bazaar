'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Layers, Loader2, Check, AlertCircle, ShoppingCart,
  Coins, Lock, Unlock, Copy, ExternalLink,
} from 'lucide-react';
import { useWalletStore } from '@/lib/store/wallet-store';
import { usePriceStore } from '@/lib/store/price-store';
import { formatBCH, formatUSD, shortenAddress } from '@/lib/utils';
import { loadWallet } from '@/lib/bch/wallet';
import type { VaultStatus } from '@/lib/types';

interface PageVaultStatus extends VaultStatus {
  // All fields are strings (serialized from bigint)
}

export default function FractionalizedVaultPage() {
  const params = useParams();
  const sharesCategory = params.category as string;

  const { wallet, setModalOpen } = useWalletStore();
  const { bchUsd, fetchPrice } = usePriceStore();

  const [status, setStatus] = useState<PageVaultStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // We need to know the original NFT category to query the vault.
  // It's encoded in the URL as a query param: ?nftCategory=...&reserveSats=...
  const [searchParams, setSearchParams] = useState<URLSearchParams | null>(null);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSearchParams(new URLSearchParams(window.location.search));
    }
  }, []);

  const nftCategory = searchParams?.get('nftCategory') || sharesCategory;
  const reserveSatsParam = searchParams?.get('reserveSats') || '100000';

  // Derive user's share balance from wallet NFTs (FT of sharesCategory)
  const [userShares, setUserShares] = useState<bigint>(0n);
  const [sharesLoaded, setSharesLoaded] = useState(false);

  // Buyout state
  const [isBuying, setIsBuying] = useState(false);
  const [buyError, setBuyError] = useState('');
  const [buyTxid, setBuyTxid] = useState('');

  // Claim state
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [claimTxid, setClaimTxid] = useState('');
  const [claimPayout, setClaimPayout] = useState<bigint | null>(null);

  const [copied, setCopied] = useState(false);

  useEffect(() => { fetchPrice(); }, [fetchPrice]);

  const loadStatus = useCallback(async () => {
    if (!sharesCategory || !searchParams) return;
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/fractionalize/${sharesCategory}?reserveSats=${reserveSatsParam}&nftCategory=${nftCategory}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vault status');
    } finally {
      setIsLoading(false);
    }
  }, [sharesCategory, searchParams, nftCategory, reserveSatsParam]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Fetch user's share balance via Electrum
  useEffect(() => {
    if (!wallet?.isConnected || !sharesCategory) return;
    const fetchShares = async () => {
      try {
        const res = await fetch(`/api/nft?address=${wallet.address}`);
        if (!res.ok) return;
        const data = await res.json();
        // Look for FT UTXOs matching sharesCategory
        const ftUtxos: any[] = (data.utxos || []).filter(
          (u: any) => u.token?.category === sharesCategory && !u.token?.nft && u.token?.amount,
        );
        const total = ftUtxos.reduce((s: bigint, u: any) => s + BigInt(u.token.amount), 0n);
        setUserShares(total);
      } catch {
        // ignore
      } finally {
        setSharesLoaded(true);
      }
    };
    fetchShares();
  }, [wallet, sharesCategory]);

  const handleBuyout = async () => {
    if (!wallet?.isConnected) { setModalOpen(true); return; }
    const walletData = loadWallet();
    if (!walletData) { setBuyError('Wallet not connected.'); return; }

    const privateKeyHex = Array.from(walletData.privateKey)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    setIsBuying(true);
    setBuyError('');
    try {
      const res = await fetch('/api/fractionalize/buyout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKeyHex,
          buyerAddress: wallet.address,
          sharesCategory,
          reserveSats: reserveSatsParam,
          nftCategory,
          nftCommitment: '',
          nftCapability: 'none',
        }),
      });
      const result = await res.json();
      if (result.success && result.txid) {
        setBuyTxid(result.txid);
        await loadStatus();
      } else {
        setBuyError(result.error || 'Buyout failed.');
      }
    } catch (err) {
      setBuyError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsBuying(false);
    }
  };

  const handleClaim = async () => {
    if (!wallet?.isConnected) { setModalOpen(true); return; }
    const walletData = loadWallet();
    if (!walletData) { setClaimError('Wallet not connected.'); return; }

    const privateKeyHex = Array.from(walletData.privateKey)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    setIsClaiming(true);
    setClaimError('');
    try {
      const res = await fetch('/api/fractionalize/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKeyHex,
          claimantAddress: wallet.address,
          sharesCategory,
        }),
      });
      const result = await res.json();
      if (result.success && result.txid) {
        setClaimTxid(result.txid);
        if (result.payout) setClaimPayout(BigInt(result.payout));
        setUserShares(0n);
        await loadStatus();
      } else {
        setClaimError(result.error || 'Claim failed.');
      }
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsClaiming(false);
    }
  };

  const copyCategory = () => {
    navigator.clipboard.writeText(sharesCategory).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const reserveSats = status ? BigInt(status.reserveSats) : BigInt(reserveSatsParam);
  const remainingShares = status ? BigInt(status.remainingShares) : 1_000_000n;
  const totalShares = status ? BigInt(status.totalShares) : 1_000_000n;
  const remainingSats = status ? BigInt(status.remainingSats) : 0n;

  const userSharePct = totalShares > 0n
    ? Number((userShares * 10000n) / totalShares) / 100
    : 0;

  const userClaimableSats = (status?.boughtOut && remainingShares > 0n && userShares > 0n)
    ? (userShares * remainingSats) / remainingShares
    : 0n;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Back nav */}
        <Link
          href="/explore"
          className="inline-flex items-center gap-1.5 text-sm mb-6 hover:opacity-70 transition-opacity"
          style={{ color: 'var(--text-muted)' }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Explore
        </Link>

        {/* Page title */}
        <div className="flex items-center gap-2.5 mb-6">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}
          >
            <Layers className="h-5 w-5" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              Fractional Vault
            </h1>
            <button
              onClick={copyCategory}
              className="flex items-center gap-1 text-xs font-mono hover:opacity-70 transition-opacity"
              style={{ color: 'var(--text-muted)' }}
            >
              {sharesCategory.slice(0, 20)}…
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        </div>

        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        )}

        {error && !isLoading && (
          <div
            className="flex items-start gap-2 p-4 rounded-xl mb-6"
            style={{ background: 'color-mix(in srgb, #ef4444 10%, transparent)', color: '#ef4444' }}
          >
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {status && !isLoading && (
          <>
            {/* Vault status card */}
            <div
              className="rounded-2xl p-5 mb-5"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              {/* Status badge */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Vault Status
                </span>
                <span
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={
                    status.active
                      ? { background: 'color-mix(in srgb, #22c55e 12%, transparent)', color: '#22c55e' }
                      : status.boughtOut
                      ? { background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }
                      : { background: 'color-mix(in srgb, #6b7280 12%, transparent)', color: '#6b7280' }
                  }
                >
                  {status.active
                    ? <><Lock className="h-3 w-3" /> Active</>
                    : status.boughtOut
                    ? <><Unlock className="h-3 w-3" /> Bought Out</>
                    : <><AlertCircle className="h-3 w-3" /> Unknown</>}
                </span>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl" style={{ background: 'var(--bg-primary)' }}>
                  <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                    Reserve Price
                  </div>
                  <div className="text-sm font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>
                    {formatBCH(reserveSats)}
                  </div>
                  {bchUsd > 0 && (
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {formatUSD(reserveSats, bchUsd)}
                    </div>
                  )}
                </div>

                <div className="p-3 rounded-xl" style={{ background: 'var(--bg-primary)' }}>
                  <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                    Shares Remaining
                  </div>
                  <div className="text-sm font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>
                    {remainingShares.toLocaleString()}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    of {totalShares.toLocaleString()} total
                  </div>
                </div>

                {status.boughtOut && (
                  <div className="p-3 rounded-xl col-span-2" style={{ background: 'var(--bg-primary)' }}>
                    <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                      Claimable BCH Pool
                    </div>
                    <div className="text-sm font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>
                      {formatBCH(remainingSats)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Your shares card */}
            {wallet?.isConnected && (
              <div
                className="rounded-2xl p-5 mb-5"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Coins className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Your Shares
                  </span>
                </div>

                {!sharesLoaded ? (
                  <div className="flex items-center gap-2 py-1">
                    <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--text-muted)' }} />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</span>
                  </div>
                ) : (
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                        {userShares.toLocaleString()}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {userSharePct.toFixed(4)}% ownership
                      </div>
                    </div>
                    {status.boughtOut && userClaimableSats > 0n && (
                      <div className="text-right">
                        <div className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>
                          Your claimable
                        </div>
                        <div className="text-sm font-semibold font-mono" style={{ color: '#22c55e' }}>
                          {formatBCH(userClaimableSats)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3">
              {/* Buyout action */}
              {status.active && (
                <div
                  className="rounded-2xl p-5"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
                >
                  <div className="flex items-start gap-3">
                    <ShoppingCart className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                    <div className="flex-1">
                      <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                        Buy Out the Vault
                      </div>
                      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                        Pay {formatBCH(reserveSats)} to instantly acquire the original NFT. Proceeds
                        are distributed to share holders.
                      </p>

                      {buyTxid ? (
                        <div className="flex items-center gap-2 text-xs" style={{ color: '#22c55e' }}>
                          <Check className="h-4 w-4" />
                          <span>Buyout complete!</span>
                          <a
                            href={`https://chipnet.imaginary.cash/tx/${buyTxid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 underline"
                            style={{ color: 'var(--accent)' }}
                          >
                            tx <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      ) : (
                        <>
                          {buyError && (
                            <div
                              className="mb-3 px-3 py-2 rounded-lg text-xs"
                              style={{ background: 'color-mix(in srgb, #ef4444 10%, transparent)', color: '#ef4444' }}
                            >
                              {buyError}
                            </div>
                          )}
                          <button
                            onClick={handleBuyout}
                            disabled={isBuying}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                            style={{ background: 'var(--accent)' }}
                          >
                            {isBuying
                              ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
                              : <><ShoppingCart className="h-4 w-4" /> Buyout for {formatBCH(reserveSats)}</>}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Claim action */}
              {status.boughtOut && userShares > 0n && (
                <div
                  className="rounded-2xl p-5"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
                >
                  <div className="flex items-start gap-3">
                    <Coins className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#22c55e' }} />
                    <div className="flex-1">
                      <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                        Claim Your BCH
                      </div>
                      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                        Burn your {userShares.toLocaleString()} shares and receive{' '}
                        <span className="font-semibold" style={{ color: '#22c55e' }}>
                          {formatBCH(userClaimableSats)}
                        </span>{' '}
                        from the proceeds pool.
                      </p>

                      {claimTxid ? (
                        <div className="flex items-center gap-2 text-xs" style={{ color: '#22c55e' }}>
                          <Check className="h-4 w-4" />
                          <span>Claimed {claimPayout ? formatBCH(claimPayout) : ''}!</span>
                          <a
                            href={`https://chipnet.imaginary.cash/tx/${claimTxid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 underline"
                            style={{ color: 'var(--accent)' }}
                          >
                            tx <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      ) : (
                        <>
                          {claimError && (
                            <div
                              className="mb-3 px-3 py-2 rounded-lg text-xs"
                              style={{ background: 'color-mix(in srgb, #ef4444 10%, transparent)', color: '#ef4444' }}
                            >
                              {claimError}
                            </div>
                          )}
                          <button
                            onClick={handleClaim}
                            disabled={isClaiming}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                            style={{ background: '#16a34a' }}
                          >
                            {isClaiming
                              ? <><Loader2 className="h-4 w-4 animate-spin" /> Claiming…</>
                              : <><Coins className="h-4 w-4" /> Claim {formatBCH(userClaimableSats)}</>}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Claimed out / no shares */}
              {status.boughtOut && userShares === 0n && !claimTxid && sharesLoaded && (
                <div
                  className="rounded-2xl p-4 text-center"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
                >
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {wallet?.isConnected
                      ? 'You have no shares in this vault.'
                      : 'Connect your wallet to see your shares and claim proceeds.'}
                  </p>
                  {!wallet?.isConnected && (
                    <button
                      onClick={() => setModalOpen(true)}
                      className="mt-3 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                      style={{ background: 'var(--accent)' }}
                    >
                      Connect Wallet
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Share category info */}
            <div className="mt-6 p-4 rounded-xl" style={{ background: 'var(--bg-secondary)' }}>
              <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
                Shares Token Category
              </div>
              <div className="text-xs font-mono break-all" style={{ color: 'var(--text-secondary)' }}>
                {sharesCategory}
              </div>
              <div className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                Add this category to your wallet to view and transfer share tokens.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
