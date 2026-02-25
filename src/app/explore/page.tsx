'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, PackageOpen, Wallet, Layers, Tag, Lock } from 'lucide-react';
import { CollectionCard } from '@/components/nft/CollectionCard';
import { ListNFTModal, type WalletNFT } from '@/components/nft/ListNFTModal';
import { useWalletStore } from '@/lib/store/wallet-store';
import { ipfsToHttp, shortenAddress, formatBCH } from '@/lib/utils';
import Image from 'next/image';
import Link from 'next/link';

type ExploreMode = 'collections' | 'vaults' | 'wallet';

interface VaultWithMeta {
  sharesCategory: string;
  nftCategory: string;
  nftCommitment: string;
  reserveSats: string;
  ownerAddress: string;
  createdAt: number;
  metadata?: { name?: string; image?: string };
}

interface WalletNFTWithMeta extends WalletNFT {
  metadata?: { name?: string; image?: string; collection?: string };
  collectionSlug?: string;
}

export default function ExplorePage() {
  // — Collections mode state —
  const [collections, setCollections] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<'volume' | 'floor-low' | 'floor-high' | 'newest'>('volume');

  // — Mode / Wallet state —
  const [mode, setMode] = useState<ExploreMode>('collections');
  const [walletAddress, setWalletAddress] = useState('');
  const [walletNfts, setWalletNfts] = useState<WalletNFTWithMeta[]>([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  // — Vaults mode state —
  const [vaults, setVaults] = useState<VaultWithMeta[]>([]);
  const [vaultsLoading, setVaultsLoading] = useState(false);

  // — List NFT modal —
  const [listingNft, setListingNft] = useState<WalletNFT | null>(null);

  const { wallet } = useWalletStore();
  const walletInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async (showLoading = false) => {
      if (showLoading) setIsLoading(true);
      try {
        const res = await fetch('/api/collections');
        const data = await res.json();
        setCollections(data.collections || []);
      } catch {
        setCollections([]);
      } finally {
        if (showLoading) setIsLoading(false);
      }
    };
    load(true);
    const interval = setInterval(() => load(false), 30000);
    return () => clearInterval(interval);
  }, []);

  // When switching to wallet mode, pre-fill with connected wallet address
  useEffect(() => {
    if (mode === 'wallet' && wallet?.address && !walletAddress) {
      setWalletAddress(wallet.address);
    }
  }, [mode, wallet?.address]);

  // Load vaults when switching to vaults tab
  useEffect(() => {
    if (mode !== 'vaults') return;
    const load = async () => {
      setVaultsLoading(true);
      try {
        const res = await fetch('/api/vaults');
        const data = await res.json();
        const raw: VaultWithMeta[] = data.vaults || [];
        // Enrich with metadata in parallel (best-effort)
        const enriched = await Promise.all(
          raw.map(async (v) => {
            let metadata: VaultWithMeta['metadata'] = undefined;
            if (v.nftCommitment) {
              try {
                const mRes = await fetch(`/api/metadata?commitment=${encodeURIComponent(v.nftCommitment)}`);
                if (mRes.ok) metadata = await mRes.json();
              } catch {
                // ignore
              }
            }
            return { ...v, metadata };
          }),
        );
        setVaults(enriched);
      } catch {
        setVaults([]);
      } finally {
        setVaultsLoading(false);
      }
    };
    load();
  }, [mode]);

  const filtered = collections.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.creatorAddress?.toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case 'floor-low': return Number(BigInt(a.floorPrice || '0') - BigInt(b.floorPrice || '0'));
      case 'floor-high': return Number(BigInt(b.floorPrice || '0') - BigInt(a.floorPrice || '0'));
      case 'newest': return (b.createdAt || 0) - (a.createdAt || 0);
      default: return Number(BigInt(b.totalVolume || '0') - BigInt(a.totalVolume || '0'));
    }
  });

  const searchWallet = async (address: string) => {
    if (!address.trim()) return;
    setWalletLoading(true);
    setWalletError('');
    setHasSearched(true);
    try {
      const res = await fetch(`/api/nft?address=${encodeURIComponent(address.trim())}`);
      if (!res.ok) {
        setWalletError('Could not fetch NFTs for this address.');
        setWalletNfts([]);
        return;
      }
      const data = await res.json();
      const rawNfts: WalletNFT[] = (data.nfts || []).map((n: any) => ({
        txid: n.txid,
        vout: n.vout,
        satoshis: n.satoshis,
        tokenCategory: n.tokenCategory,
        nftCommitment: n.nftCommitment || n.commitment || '',
        nftCapability: n.nftCapability || n.capability || 'none',
      }));

      // Build a set of known tokenCategories from Bazaar collections for badge linking
      const categoryToSlug = new Map<string, string>(
        collections
          .filter((c) => c.tokenCategory)
          .map((c): [string, string] => [c.tokenCategory!, c.slug])
      );

      // Resolve metadata for each NFT in parallel (best-effort, no throw)
      const enriched: WalletNFTWithMeta[] = await Promise.all(
        rawNfts.map(async (nft) => {
          let metadata: WalletNFTWithMeta['metadata'] = undefined;
          if (nft.nftCommitment) {
            try {
              const mRes = await fetch(`/api/metadata?commitment=${encodeURIComponent(nft.nftCommitment)}`);
              if (mRes.ok) metadata = await mRes.json();
            } catch {
              // ignore
            }
          }
          return {
            ...nft,
            metadata,
            collectionSlug: categoryToSlug.get(nft.tokenCategory),
          };
        })
      );

      setWalletNfts(enriched);
    } catch {
      setWalletError('Network error. Please try again.');
    } finally {
      setWalletLoading(false);
    }
  };

  const isOwnWallet = wallet?.address === walletAddress.trim();

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="mx-auto max-w-[1400px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Explore</h1>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Discover CashTokens NFTs on Bitcoin Cash Chipnet
            </p>
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {mode === 'collections'
              ? (isLoading ? 'Loading...' : `${sorted.length} collection${sorted.length !== 1 ? 's' : ''}`)
              : mode === 'vaults'
              ? (vaultsLoading ? 'Loading...' : `${vaults.length} vault${vaults.length !== 1 ? 's' : ''}`)
              : (hasSearched ? `${walletNfts.length} NFT${walletNfts.length !== 1 ? 's' : ''}` : '')}
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex items-center gap-1 mb-5 border-b" style={{ borderColor: 'var(--border)' }}>
          {[
            { id: 'collections' as const, label: 'Collections', icon: Layers },
            { id: 'vaults' as const, label: 'Vaults', icon: Lock },
            { id: 'wallet' as const, label: 'By Wallet', icon: Wallet },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                mode === id
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Collections mode ─────────────────────────────── */}
        {mode === 'collections' && (
          <>
            <div className="flex flex-col md:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search collections..."
                  className="input-field pl-9"
                />
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
                className="input-field w-full md:w-48 cursor-pointer"
              >
                <option value="volume" style={{ background: 'var(--bg-secondary)' }}>Volume: High to Low</option>
                <option value="floor-low" style={{ background: 'var(--bg-secondary)' }}>Floor: Low to High</option>
                <option value="floor-high" style={{ background: 'var(--bg-secondary)' }}>Floor: High to Low</option>
                <option value="newest" style={{ background: 'var(--bg-secondary)' }}>Newest</option>
              </select>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="card overflow-hidden animate-pulse">
                    <div className="h-32" style={{ background: 'var(--bg-secondary)' }} />
                    <div className="p-3 space-y-2">
                      <div className="skeleton h-4 w-3/4" />
                      <div className="skeleton h-3 w-1/2" />
                      <div className="skeleton h-8" />
                    </div>
                  </div>
                ))}
              </div>
            ) : sorted.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <PackageOpen className="h-12 w-12 mb-3" style={{ color: 'var(--text-muted)' }} />
                <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  {searchQuery ? 'No collections match your search' : 'No collections yet'}
                </h3>
                <p className="text-xs max-w-sm" style={{ color: 'var(--text-muted)' }}>
                  Be the first to create and list an NFT on BAZAAR.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {sorted.map((col, i) => (
                  <CollectionCard key={col.slug} collection={col} index={i} />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Vaults mode ──────────────────────────────────── */}
        {mode === 'vaults' && (
          <>
            {vaultsLoading && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="card overflow-hidden animate-pulse">
                    <div className="h-32" style={{ background: 'var(--bg-secondary)' }} />
                    <div className="p-3 space-y-2">
                      <div className="skeleton h-4 w-3/4" />
                      <div className="skeleton h-3 w-1/2" />
                      <div className="skeleton h-8" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!vaultsLoading && vaults.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Lock className="h-12 w-12 mb-3" style={{ color: 'var(--text-muted)' }} />
                <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  No vaults yet
                </h3>
                <p className="text-xs max-w-sm" style={{ color: 'var(--text-muted)' }}>
                  Fractionalize an NFT from your profile to create the first vault.
                </p>
              </div>
            )}

            {!vaultsLoading && vaults.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {vaults.map((vault) => {
                  const imgUrl = vault.metadata?.image ? ipfsToHttp(vault.metadata.image) : null;
                  const name = vault.metadata?.name || `NFT ${vault.nftCategory.slice(0, 8)}…`;
                  return (
                    <div key={vault.sharesCategory} className="card overflow-hidden flex flex-col">
                      {/* Image */}
                      <div className="relative h-36 shrink-0" style={{ background: 'var(--bg-secondary)' }}>
                        {imgUrl ? (
                          <Image src={imgUrl} alt={name} fill className="object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Lock className="h-8 w-8 opacity-20" style={{ color: 'var(--accent)' }} />
                          </div>
                        )}
                        <div
                          className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                          style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}
                        >
                          <Lock className="h-2.5 w-2.5" />
                          Fractional
                        </div>
                      </div>

                      {/* Info */}
                      <div className="p-3 flex flex-col gap-2 flex-1">
                        <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {name}
                        </div>
                        <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                          Reserve: {formatBCH(BigInt(vault.reserveSats))}
                        </div>
                        <Link
                          href={`/fractionalized/${vault.sharesCategory}`}
                          className="mt-auto w-full py-1.5 rounded-lg text-xs font-medium text-center transition-colors hover:opacity-80"
                          style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}
                        >
                          View Vault
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── By Wallet mode ───────────────────────────────── */}
        {mode === 'wallet' && (
          <>
            {/* Address search bar */}
            <div className="flex gap-2 mb-6">
              <div className="relative flex-1">
                <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
                <input
                  ref={walletInputRef}
                  type="text"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchWallet(walletAddress)}
                  placeholder="Enter BCH address (bchtest:q…)"
                  className="input-field pl-9 font-mono text-xs"
                />
              </div>
              <button
                onClick={() => searchWallet(walletAddress)}
                disabled={walletLoading || !walletAddress.trim()}
                className="btn-primary px-4 text-sm disabled:opacity-50"
              >
                {walletLoading ? 'Searching…' : 'Search'}
              </button>
              {wallet?.address && walletAddress !== wallet.address && (
                <button
                  onClick={() => { setWalletAddress(wallet.address); searchWallet(wallet.address); }}
                  className="btn-secondary text-xs px-3"
                  title="Use my wallet"
                >
                  Mine
                </button>
              )}
            </div>

            {walletError && (
              <div className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: 'color-mix(in srgb, #ef4444 10%, transparent)', color: '#ef4444' }}>
                {walletError}
              </div>
            )}

            {walletLoading && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="card overflow-hidden animate-pulse">
                    <div className="h-32" style={{ background: 'var(--bg-secondary)' }} />
                    <div className="p-3 space-y-2">
                      <div className="skeleton h-4 w-3/4" />
                      <div className="skeleton h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!walletLoading && hasSearched && walletNfts.length === 0 && !walletError && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <PackageOpen className="h-12 w-12 mb-3" style={{ color: 'var(--text-muted)' }} />
                <h3 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  No NFTs found for this address
                </h3>
                <p className="text-xs mt-1 max-w-xs" style={{ color: 'var(--text-muted)' }}>
                  This address holds no CashTokens NFTs on Chipnet.
                </p>
              </div>
            )}

            {!walletLoading && !hasSearched && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Wallet className="h-12 w-12 mb-3" style={{ color: 'var(--text-muted)' }} />
                <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Search any BCH wallet
                </h3>
                <p className="text-xs max-w-sm" style={{ color: 'var(--text-muted)' }}>
                  Enter any Chipnet address above to see all their NFTs — regardless of where they were minted.
                </p>
              </div>
            )}

            {!walletLoading && walletNfts.length > 0 && (
              <>
                {isOwnWallet && (
                  <div className="mb-4 px-4 py-2.5 rounded-xl text-xs flex items-center gap-2"
                    style={{ background: 'color-mix(in srgb, var(--accent) 8%, transparent)', color: 'var(--accent)' }}>
                    <Tag className="h-3.5 w-3.5 shrink-0" />
                    This is your wallet. Click <strong>List on Bazaar</strong> on any NFT to list it for sale.
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {walletNfts.map((nft) => {
                    const imgUrl = nft.metadata?.image ? ipfsToHttp(nft.metadata.image) : null;
                    const name = nft.metadata?.name || `Token #${nft.tokenCategory.slice(0, 8)}`;
                    return (
                      <div key={`${nft.txid}-${nft.vout}`} className="card overflow-hidden flex flex-col">
                        {/* Image */}
                        <div className="relative h-36 shrink-0" style={{ background: 'var(--bg-secondary)' }}>
                          {imgUrl ? (
                            <Image src={imgUrl} alt={name} fill className="object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="text-2xl font-black font-mono opacity-20" style={{ color: 'var(--accent)' }}>
                                {nft.tokenCategory.slice(0, 2).toUpperCase()}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="p-3 flex flex-col gap-2 flex-1">
                          <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                            {name}
                          </div>
                          {nft.collectionSlug ? (
                            <Link href={`/collection/${nft.collectionSlug}`}
                              className="text-[11px] flex items-center gap-1 hover:underline"
                              style={{ color: 'var(--accent)' }}>
                              <Layers className="h-2.5 w-2.5" />
                              Listed on Bazaar
                            </Link>
                          ) : (
                            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                              Not listed · {shortenAddress(walletAddress, 4)}
                            </span>
                          )}

                          {/* List button for own wallet */}
                          {isOwnWallet && (
                            <button
                              onClick={() => setListingNft(nft)}
                              className="mt-auto w-full py-1.5 rounded-lg text-xs font-medium border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                            >
                              List on Bazaar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* List NFT Modal */}
      {listingNft && (
        <ListNFTModal
          isOpen={!!listingNft}
          onClose={() => setListingNft(null)}
          nft={listingNft}
          ownerAddress={walletAddress.trim()}
          onComplete={() => { setListingNft(null); searchWallet(walletAddress); }}
        />
      )}
    </div>
  );
}
