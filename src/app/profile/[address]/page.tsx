'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Copy, Check, ExternalLink, Wallet, Image as ImageIcon,
  Tag, Gavel, ArrowLeft, RefreshCw, Coins
} from 'lucide-react';
import { NFTGrid } from '@/components/nft/NFTGrid';
import { useWalletStore } from '@/lib/store/wallet-store';
import { formatBCH, shortenAddress } from '@/lib/utils';
import { fetchWalletData } from '@/lib/bch/api-client';
import { getExplorerAddressUrl, CHIPNET_CONFIG } from '@/lib/bch/config';
import type { NFTListing } from '@/lib/types';

type ProfileTab = 'owned' | 'listed' | 'auctions';

export default function ProfilePage() {
  const params = useParams();
  const address = decodeURIComponent(params.address as string);
  const { wallet } = useWalletStore();
  const isOwnProfile = wallet?.address === address;

  const [balance, setBalance] = useState<bigint>(0n);
  const [nfts, setNfts] = useState<NFTListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProfileTab>('owned');
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
    { id: 'listed', label: 'Listed', icon: Tag, count: 0 },
    { id: 'auctions', label: 'Auctions', icon: Gavel, count: 0 },
  ];

  const filteredNfts = nfts.filter((nft) => {
    switch (activeTab) {
      case 'listed': return nft.status === 'active' && nft.price > 0n;
      case 'auctions': return nft.listingType === 'auction';
      default: return true;
    }
  });

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

        <NFTGrid listings={filteredNfts} isLoading={isLoading}
          emptyMessage={activeTab === 'owned' ? 'No NFTs owned yet' : activeTab === 'listed' ? 'No active listings' : 'No active auctions'} />
      </div>
    </div>
  );
}
