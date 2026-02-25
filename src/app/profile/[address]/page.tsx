'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Copy, Check, ExternalLink, Wallet, Image as ImageIcon,
  Tag, Gavel, ArrowLeft, RefreshCw, Coins, Layers
} from 'lucide-react';
import { NFTGrid } from '@/components/nft/NFTGrid';
import { ListNFTModal, type WalletNFT } from '@/components/nft/ListNFTModal';
import { FractionalizeModal } from '@/components/nft/FractionalizeModal';
import { useWalletStore } from '@/lib/store/wallet-store';
import { formatBCH, shortenAddress } from '@/lib/utils';
import { fetchWalletData, fetchMarketplaceListings } from '@/lib/bch/api-client';
import { getExplorerAddressUrl, CHIPNET_CONFIG } from '@/lib/bch/config';
import type { NFTListing } from '@/lib/types';

type ProfileTab = 'owned' | 'listed' | 'auctions';

export default function ProfilePage() {
  const params = useParams();
  const address = decodeURIComponent(params.address as string);
  const { wallet, connectionType } = useWalletStore();
  const isOwnProfile = wallet?.address === address;
  const canSignTx = connectionType !== 'walletconnect';

  const [balance, setBalance] = useState<bigint>(0n);
  const [nfts, setNfts] = useState<NFTListing[]>([]);
  const [listedNfts, setListedNfts] = useState<NFTListing[]>([]);
  const [auctionNfts, setAuctionNfts] = useState<NFTListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProfileTab>('owned');
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [listingNft, setListingNft] = useState<WalletNFT | null>(null);
  const [fractionalizeNft, setFractionalizeNft] = useState<WalletNFT | null>(null);

  const loadProfile = async () => {
    setIsLoading(true);
    try {
      const data = await fetchWalletData(address);
      if (data) {
        setBalance(BigInt(data.balance));
        const userNfts: NFTListing[] = data.nfts.map((nft) => ({
          txid: nft.txid, vout: nft.vout, tokenCategory: nft.tokenCategory,
          commitment: nft.nftCommitment, satoshis: parseInt(nft.satoshis),
          price: 0n, sellerAddress: address, sellerPkh: '',
          creatorAddress: address, creatorPkh: '', royaltyBasisPoints: 1000,
          status: 'active' as const, listingType: 'fixed' as const,
        }));
        setNfts(userNfts);
      }

      const marketplace = await fetchMarketplaceListings();
      if (marketplace) {
        const listed = marketplace.listings
          .filter((l) => l.seller === address)
          .map((l) => ({
            txid: l.txid, vout: 0, tokenCategory: l.tokenCategory,
          commitment: l.commitment || '', satoshis: 0, price: BigInt(l.price),
            sellerAddress: l.seller, sellerPkh: l.sellerPkh || '',
            creatorAddress: l.creator || l.seller, creatorPkh: l.creatorPkh || '',
            royaltyBasisPoints: l.royaltyBasisPoints, status: 'active' as const,
            listingType: 'fixed' as const, metadata: l.metadata,
          }));
        const auctions = marketplace.auctions
          .filter((a) => a.seller === address)
          .map((a) => ({
            txid: a.txid, vout: 0, tokenCategory: a.tokenCategory,
            commitment: a.commitment || '', satoshis: 0,
            price: BigInt(a.currentBid || a.minBid || '0'),
            sellerAddress: a.seller, sellerPkh: a.sellerPkh || '',
            creatorAddress: a.creator || a.seller, creatorPkh: a.creatorPkh || '',
            royaltyBasisPoints: a.royaltyBasisPoints, status: (a.status || 'active') as any,
            listingType: 'auction' as const,
            minBid: BigInt(a.minBid || '0'),
            currentBid: BigInt(a.currentBid || '0'),
            currentBidder: a.currentBidder || '',
            endTime: a.endTime || 0,
            minBidIncrement: BigInt(a.minBidIncrement || '0'),
            bidHistory: a.bidHistory || [],
            metadata: a.metadata,
          }));
        setListedNfts(listed);
        setAuctionNfts(auctions);
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadProfile(); }, [address]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadProfile();
    setIsRefreshing(false);
  };

  const copyAddress = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tabs: { id: ProfileTab; label: string; icon: typeof ImageIcon; count: number }[] = [
    { id: 'owned', label: 'Owned', icon: ImageIcon, count: nfts.length },
    { id: 'listed', label: 'Listed', icon: Tag, count: listedNfts.length },
    { id: 'auctions', label: 'Auctions', icon: Gavel, count: auctionNfts.length },
  ];

  const filteredNfts = activeTab === 'owned'
    ? nfts
    : activeTab === 'listed'
      ? listedNfts
      : auctionNfts;

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="mx-auto max-w-[1400px]">
        <Link href="/explore"
          className="inline-flex items-center gap-2 text-xs mb-6 transition-colors"
          style={{ color: 'var(--text-muted)' }}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Explore
        </Link>

        {/* Profile Header */}
        <div className="card p-6 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
              <Wallet className="h-7 w-7" style={{ color: 'var(--accent)' }} />
            </div>

            {/* Address Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {isOwnProfile ? 'My Profile' : shortenAddress(address, 8)}
                </h1>
                {isOwnProfile && (
                  <span className="badge badge-green text-[10px]">You</span>
                )}
              </div>

              <div className="flex items-center gap-2 mb-3">
                <code className="text-[11px] font-mono truncate max-w-[300px]" style={{ color: 'var(--text-muted)' }}>
                  {address}
                </code>
                <button onClick={copyAddress} className="shrink-0 p-1 transition-colors" style={{ color: 'var(--text-muted)' }}>
                  {copied ? <Check className="h-3 w-3" style={{ color: 'var(--accent)' }} /> : <Copy className="h-3 w-3" />}
                </button>
                <a href={getExplorerAddressUrl(address)} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 p-1" style={{ color: 'var(--text-muted)' }}>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-6">
                <div>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Balance</div>
                  <div className="text-base font-semibold font-mono" style={{ color: 'var(--accent)' }}>
                    {isLoading ? '...' : formatBCH(balance)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>NFTs Owned</div>
                  <div className="text-base font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>
                    {isLoading ? '...' : nfts.length}
                  </div>
                </div>
                <div>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Network</div>
                  <div className="text-xs font-medium" style={{ color: 'var(--accent)' }}>Chipnet</div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={handleRefresh} disabled={isRefreshing}
                className="btn-secondary p-2.5" title="Refresh">
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              {isOwnProfile && (
                <a href={CHIPNET_CONFIG.faucetUrl} target="_blank" rel="noopener noreferrer"
                  className="btn-secondary flex items-center gap-2 text-xs">
                  <Coins className="h-3.5 w-3.5" /> Get tBCH
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1.5 mb-6">
          {tabs.map(({ id, label, icon: Icon, count }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`tab flex items-center gap-1.5 ${activeTab === id ? 'tab-active' : ''}`}>
              <Icon className="h-3.5 w-3.5" />
              {label}
              <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                style={{ background: activeTab === id ? 'rgba(0,229,69,0.1)' : 'var(--bg-hover)' }}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* Owned tab on own profile — custom grid with List button */}
        {activeTab === 'owned' && isOwnProfile ? (
          isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="card overflow-hidden animate-pulse">
                  <div className="aspect-square" style={{ background: 'var(--bg-secondary)' }} />
                  <div className="p-3 space-y-2">
                    <div className="h-3 rounded" style={{ background: 'var(--bg-hover)', width: '70%' }} />
                    <div className="h-7 rounded" style={{ background: 'var(--bg-hover)' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : nfts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <ImageIcon className="h-10 w-10" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No NFTs owned yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {nfts.map((nft) => (
                <div key={nft.txid} className="card overflow-hidden flex flex-col">
                  <div className="aspect-square flex items-center justify-center"
                    style={{ background: 'var(--bg-secondary)' }}>
                    <ImageIcon className="h-8 w-8" style={{ color: 'var(--text-muted)' }} />
                  </div>
                  <div className="p-3 flex flex-col gap-2 flex-1">
                    <div className="text-[11px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>
                      {nft.tokenCategory.slice(0, 16)}…
                    </div>
                    <div className="mt-auto flex flex-col gap-1.5">
                      <button
                        onClick={() => setListingNft({
                          txid: nft.txid,
                          vout: nft.vout,
                          satoshis: nft.satoshis.toString(),
                          tokenCategory: nft.tokenCategory,
                          nftCommitment: nft.commitment,
                          nftCapability: 'none',
                        })}
                        className="w-full py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 flex items-center justify-center gap-1.5"
                        style={{ background: 'var(--accent)' }}
                      >
                        <Tag className="h-3 w-3" />
                        List on Bazaar
                      </button>
                      {canSignTx && (
                        <button
                          onClick={() => setFractionalizeNft({
                            txid: nft.txid,
                            vout: nft.vout,
                            satoshis: nft.satoshis.toString(),
                            tokenCategory: nft.tokenCategory,
                            nftCommitment: nft.commitment,
                            nftCapability: 'none',
                          })}
                          className="w-full py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 flex items-center justify-center gap-1.5"
                          style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                        >
                          <Layers className="h-3 w-3" />
                          Fractionalize
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <NFTGrid listings={filteredNfts} isLoading={isLoading}
            emptyMessage={activeTab === 'owned' ? 'No NFTs owned yet' : activeTab === 'listed' ? 'No active listings' : 'No active auctions'} />
        )}
      </div>

      {/* List NFT Modal */}
      {listingNft && (
        <ListNFTModal
          isOpen={!!listingNft}
          onClose={() => setListingNft(null)}
          nft={listingNft}
          ownerAddress={address}
          onComplete={() => { setListingNft(null); loadProfile(); }}
        />
      )}

      {/* Fractionalize Modal */}
      {fractionalizeNft && (
        <FractionalizeModal
          isOpen={!!fractionalizeNft}
          onClose={() => setFractionalizeNft(null)}
          nft={fractionalizeNft}
          ownerAddress={address}
          ownerTokenAddress={wallet?.tokenAddress || address}
          onComplete={() => { setFractionalizeNft(null); loadProfile(); }}
        />
      )}
    </div>
  );
}
