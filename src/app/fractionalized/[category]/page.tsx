'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft, Layers, Loader2, Check, AlertCircle, ShoppingCart,
  Coins, Lock, Unlock, Copy, ExternalLink, RotateCcw,
} from 'lucide-react';
import { useWalletStore } from '@/lib/store/wallet-store';
import { usePriceStore } from '@/lib/store/price-store';
import { formatBCH, formatUSD, shortenAddress, ipfsToHttp } from '@/lib/utils';
import { loadWallet } from '@/lib/bch/wallet';

interface VaultData {
  // live status
  active: boolean;
  boughtOut: boolean;
  claimsHasBch: boolean;
  remainingShares: string;
  remainingSats: string;
  totalShares: string;
  reserveSats: string;
  // stored metadata
  nftCategory: string;
  nftCommitment: string;
  nftCapability: string;
  ownerAddress: string;
  createdAt: number;
}

export default function FractionalizedVaultPage() {
  const params = useParams();
  const sharesCategory = params.category as string;

  const { wallet, setModalOpen } = useWalletStore();
  const { bchUsd, fetchPrice } = usePriceStore();

  const [vault, setVault] = useState<VaultData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [nftMeta, setNftMeta] = useState<{ name?: string; image?: string } | null>(null);

  // User share balance (from /api/utxos — includes FTs)
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
  const [burnInput, setBurnInput] = useState('');

  // Redeem state
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState('');
  const [redeemTxid, setRedeemTxid] = useState('');

  const [copied, setCopied] = useState(false);

  useEffect(() => { fetchPrice(); }, [fetchPrice]);

  const loadVault = useCallback(async () => {
    if (!sharesCategory) return;
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/fractionalize/${sharesCategory}`);
      if (res.status === 404) {
        setError('Vault not found. It may not have been registered yet.');
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setVault(data);

      // Fetch NFT metadata from commitment
      if (data.nftCommitment) {
        try {
          const mRes = await fetch(`/api/metadata?commitment=${encodeURIComponent(data.nftCommitment)}`);
          if (mRes.ok) setNftMeta(await mRes.json());
        } catch {
          // ignore
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vault');
    } finally {
      setIsLoading(false);
    }
  }, [sharesCategory]);

  useEffect(() => { loadVault(); }, [loadVault]);

  // Fetch user's FT share balance via /api/utxos (returns ALL UTXOs including FTs)
  useEffect(() => {
    if (!wallet?.isConnected || !sharesCategory) return;
    setSharesLoaded(false);
    const fetchShares = async () => {
      try {
        const res = await fetch(`/api/utxos?address=${encodeURIComponent(wallet.address)}`);
        if (!res.ok) return;
        const data = await res.json();
        const ftUtxos: any[] = (data.utxos || []).filter(
          (u: any) =>
            u.token?.category === sharesCategory &&
            !u.token?.nft &&
            u.token?.amount,
        );
        const total = ftUtxos.reduce((s: bigint, u: any) => s + BigInt(u.token.amount), 0n);
        setUserShares(total);
        if (total > 0n) setBurnInput(total.toString());
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
    if (!walletData || !vault) return;
    const privateKeyHex = Array.from(walletData.privateKey).map(b => b.toString(16).padStart(2, '0')).join('');
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
          reserveSats: vault.reserveSats,
          nftCategory: vault.nftCategory,
          nftCommitment: vault.nftCommitment,
          nftCapability: vault.nftCapability,
        }),
      });
      const result = await res.json();
      if (result.success && result.txid) {
        setBuyTxid(result.txid);
        await loadVault();
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
    if (!walletData) return;
    const burnAmt = burnInput ? BigInt(burnInput) : userShares;
    if (burnAmt <= 0n) { setClaimError('Enter a valid burn amount.'); return; }
    const privateKeyHex = Array.from(walletData.privateKey).map(b => b.toString(16).padStart(2, '0')).join('');
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
          burnAmount: burnAmt.toString(),
        }),
      });
      const result = await res.json();
      if (result.success && result.txid) {
        setClaimTxid(result.txid);
        if (result.payout) setClaimPayout(BigInt(result.payout));
        setUserShares(prev => prev - burnAmt);
        await loadVault();
      } else {
        setClaimError(result.error || 'Claim failed.');
      }
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsClaiming(false);
    }
  };

  const handleRedeem = async () => {
    if (!wallet?.isConnected) { setModalOpen(true); return; }
    const walletData = loadWallet();
    if (!walletData) return;
    const privateKeyHex = Array.from(walletData.privateKey).map(b => b.toString(16).padStart(2, '0')).join('');
    setIsRedeeming(true);
    setRedeemError('');
    try {
      const res = await fetch('/api/fractionalize/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privateKeyHex, ownerAddress: wallet.address, sharesCategory }),
      });
      const result = await res.json();
      if (result.success && result.txid) {
        setRedeemTxid(result.txid);
        setUserShares(0n);
        await loadVault();
      } else {
        setRedeemError(result.error || 'Redeem failed.');
      }
    } catch (err) {
      setRedeemError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsRedeeming(false);
    }
  };

  const copyCategory = () => {
    navigator.clipboard.writeText(sharesCategory).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const reserveSats = vault ? BigInt(vault.reserveSats) : 0n;
  const remainingShares = vault ? BigInt(vault.remainingShares) : 1_000_000n;
  const totalShares = vault ? BigInt(vault.totalShares) : 1_000_000n;
  const remainingSats = vault ? BigInt(vault.remainingSats) : 0n;

  const userSharePct = totalShares > 0n ? Number((userShares * 10000n) / totalShares) / 100 : 0;

  const burnAmt = burnInput ? BigInt(burnInput) : 0n;
  const userClaimableSats =
    vault?.boughtOut && remainingShares > 0n && burnAmt > 0n
      ? (burnAmt * remainingSats) / remainingShares
      : 0n;

  const imgUrl = nftMeta?.image ? ipfsToHttp(nftMeta.image) : null;
  const nftName = nftMeta?.name || (vault ? `NFT ${vault.nftCategory.slice(0, 12)}…` : '');

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

        {/* NFT image + title */}
        <div className="flex items-start gap-4 mb-6">
          <div
            className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
          >
            {imgUrl ? (
              <Image src={imgUrl} alt={nftName} width={64} height={64} className="object-cover w-full h-full" />
            ) : (
              <Layers className="h-7 w-7" style={{ color: 'var(--accent)' }} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate mb-0.5" style={{ color: 'var(--text-primary)' }}>
              {nftName || 'Fractional Vault'}
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

        {vault && !isLoading && (
          <>
            {/* Vault status card */}
            <div
              className="rounded-2xl p-5 mb-4"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Vault Status
                </span>
                <span
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={
                    vault.active
                      ? { background: 'color-mix(in srgb, #22c55e 12%, transparent)', color: '#22c55e' }
                      : vault.boughtOut
                      ? { background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }
                      : { background: 'color-mix(in srgb, #6b7280 12%, transparent)', color: '#6b7280' }
                  }
                >
                  {vault.active
                    ? <><Lock className="h-3 w-3" /> Active</>
                    : vault.boughtOut
                    ? <><Unlock className="h-3 w-3" /> Bought Out</>
                    : <><AlertCircle className="h-3 w-3" /> Unknown</>}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl" style={{ background: 'var(--bg-primary)' }}>
                  <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Reserve Price</div>
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
                  <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Shares Remaining</div>
                  <div className="text-sm font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>
                    {remainingShares.toLocaleString()}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    of {totalShares.toLocaleString()}
                  </div>
                </div>

                {vault.boughtOut && (
                  <div className="p-3 rounded-xl col-span-2" style={{ background: 'var(--bg-primary)' }}>
                    <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Claimable BCH Pool</div>
                    <div className="text-sm font-semibold font-mono" style={{ color: '#22c55e' }}>
                      {formatBCH(remainingSats)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Your shares */}
            {wallet?.isConnected && (
              <div
                className="rounded-2xl p-5 mb-4"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center gap-2 mb-2">
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
                  <div>
                    <div className="text-xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                      {userShares.toLocaleString()}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {userSharePct.toFixed(4)}% ownership
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3">

              {/* Buyout */}
              {vault.active && (
                <div className="rounded-2xl p-5" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <div className="flex items-start gap-3">
                    <ShoppingCart className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                    <div className="flex-1">
                      <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                        Buy Out the Vault
                      </div>
                      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                        Pay {formatBCH(reserveSats)} to acquire the original NFT instantly. Proceeds go to share holders.
                      </p>
                      {buyTxid ? (
                        <div className="flex items-center gap-2 text-xs" style={{ color: '#22c55e' }}>
                          <Check className="h-4 w-4" />
                          <span>Buyout complete!</span>
                          <a href={`https://chipnet.imaginary.cash/tx/${buyTxid}`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 underline" style={{ color: 'var(--accent)' }}>
                            tx <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      ) : (
                        <>
                          {buyError && (
                            <div className="mb-3 px-3 py-2 rounded-lg text-xs"
                              style={{ background: 'color-mix(in srgb, #ef4444 10%, transparent)', color: '#ef4444' }}>
                              {buyError}
                            </div>
                          )}
                          <button onClick={handleBuyout} disabled={isBuying}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                            style={{ background: 'var(--accent)' }}>
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

              {/* Redeem all (own 100% shares + vault active) */}
              {vault.active && sharesLoaded && userShares === 1_000_000n && (
                <div className="rounded-2xl p-5" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <div className="flex items-start gap-3">
                    <RotateCcw className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#a78bfa' }} />
                    <div className="flex-1">
                      <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                        Redeem NFT
                      </div>
                      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                        You own 100% of shares. Burn all 1,000,000 to reclaim the original NFT directly.
                      </p>
                      {redeemTxid ? (
                        <div className="flex items-center gap-2 text-xs" style={{ color: '#22c55e' }}>
                          <Check className="h-4 w-4" />
                          <span>NFT redeemed!</span>
                          <a href={`https://chipnet.imaginary.cash/tx/${redeemTxid}`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 underline" style={{ color: 'var(--accent)' }}>
                            tx <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      ) : (
                        <>
                          {redeemError && (
                            <div className="mb-3 px-3 py-2 rounded-lg text-xs"
                              style={{ background: 'color-mix(in srgb, #ef4444 10%, transparent)', color: '#ef4444' }}>
                              {redeemError}
                            </div>
                          )}
                          <button onClick={handleRedeem} disabled={isRedeeming}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                            style={{ background: '#7c3aed' }}>
                            {isRedeeming
                              ? <><Loader2 className="h-4 w-4 animate-spin" /> Redeeming…</>
                              : <><RotateCcw className="h-4 w-4" /> Redeem NFT</>}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Claim proceeds */}
              {vault.boughtOut && sharesLoaded && userShares > 0n && !claimTxid && (
                <div className="rounded-2xl p-5" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <div className="flex items-start gap-3">
                    <Coins className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#22c55e' }} />
                    <div className="flex-1">
                      <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                        Claim BCH Proceeds
                      </div>
                      <div className="mb-3">
                        <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                          Shares to burn (1 – {userShares.toLocaleString()})
                        </label>
                        <div className="flex gap-2 items-center">
                          <input
                            type="number"
                            min="1"
                            max={userShares.toString()}
                            value={burnInput}
                            onChange={e => setBurnInput(e.target.value)}
                            className="input-field flex-1 font-mono text-xs"
                            placeholder={userShares.toString()}
                          />
                          <button
                            onClick={() => setBurnInput(userShares.toString())}
                            className="px-2 py-1.5 rounded-lg text-[11px] font-medium border"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                          >
                            Max
                          </button>
                        </div>
                        {burnAmt > 0n && remainingShares > 0n && (
                          <div className="text-[11px] mt-1 font-mono" style={{ color: '#22c55e' }}>
                            ≈ {formatBCH(userClaimableSats)} payout
                          </div>
                        )}
                      </div>
                      {claimError && (
                        <div className="mb-3 px-3 py-2 rounded-lg text-xs"
                          style={{ background: 'color-mix(in srgb, #ef4444 10%, transparent)', color: '#ef4444' }}>
                          {claimError}
                        </div>
                      )}
                      <button onClick={handleClaim} disabled={isClaiming || burnAmt <= 0n}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                        style={{ background: '#16a34a' }}>
                        {isClaiming
                          ? <><Loader2 className="h-4 w-4 animate-spin" /> Claiming…</>
                          : <><Coins className="h-4 w-4" /> Claim {burnAmt > 0n ? formatBCH(userClaimableSats) : '…'}</>}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Claim success */}
              {claimTxid && (
                <div className="rounded-2xl p-4 flex items-center gap-2 text-sm"
                  style={{ background: 'color-mix(in srgb, #22c55e 10%, transparent)', color: '#22c55e' }}>
                  <Check className="h-4 w-4 flex-shrink-0" />
                  <span>Claimed {claimPayout ? formatBCH(claimPayout) : ''}!</span>
                  <a href={`https://chipnet.imaginary.cash/tx/${claimTxid}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 ml-1 underline text-xs" style={{ color: 'var(--accent)' }}>
                    tx <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}

              {/* No wallet / no shares when bought out */}
              {vault.boughtOut && sharesLoaded && userShares === 0n && !claimTxid && (
                <div className="rounded-2xl p-4 text-center"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {wallet?.isConnected
                      ? 'You have no shares in this vault.'
                      : 'Connect your wallet to see your shares and claim proceeds.'}
                  </p>
                  {!wallet?.isConnected && (
                    <button onClick={() => setModalOpen(true)}
                      className="mt-3 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                      style={{ background: 'var(--accent)' }}>
                      Connect Wallet
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Vault owner */}
            {vault.ownerAddress && (
              <div className="mt-4 flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                <span>Fractionalized by</span>
                <Link href={`/profile/${vault.ownerAddress}`}
                  className="font-mono hover:underline" style={{ color: 'var(--accent)' }}>
                  {shortenAddress(vault.ownerAddress)}
                </Link>
              </div>
            )}

            {/* Shares token info */}
            <div className="mt-6 p-4 rounded-xl" style={{ background: 'var(--bg-secondary)' }}>
              <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
                Shares Token Category
              </div>
              <div className="text-xs font-mono break-all" style={{ color: 'var(--text-secondary)' }}>
                {sharesCategory}
              </div>
              <div className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                1,000,000 FT shares total. Add this category to your wallet to view and transfer shares.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
