'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Tag, Shield, User, Copy, Check,
  ShoppingCart, Loader2, AlertCircle, Percent
} from 'lucide-react';
import { useWalletStore } from '@/lib/store/wallet-store';
import { usePriceStore } from '@/lib/store/price-store';
import { formatBCH, formatUSD, shortenAddress, ipfsToHttp } from '@/lib/utils';
import { fetchMarketplaceListingById } from '@/lib/bch/api-client';
import { buyNFT, buildWcBuyParams } from '@/lib/bch/contracts';
import { loadWallet } from '@/lib/bch/wallet';
import type { NFTListing } from '@/lib/types';
import { useWeb3ModalConnectorContext } from '@bch-wc2/web3modal-connector';

export default function NFTDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { wallet, setModalOpen, connectionType } = useWalletStore();
  const { signTransaction } = useWeb3ModalConnectorContext();
  const wcPayloadMode = process.env.NEXT_PUBLIC_WC_PAYLOAD_MODE || 'raw';
  const { bchUsd, fetchPrice } = usePriceStore();
  const [listing, setListing] = useState<NFTListing | null>(null);
  const [collectionFloor, setCollectionFloor] = useState<bigint | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuying, setIsBuying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [buySuccess, setBuySuccess] = useState(false);
  const [error, setError] = useState('');
  const imgFallbackRef = useRef(0);

  useEffect(() => { fetchPrice(); }, [fetchPrice]);

  useEffect(() => {
    // Fetch listing data
    const fetchListing = async () => {
      setIsLoading(true);
      try {
        const data = await fetchMarketplaceListingById(id);
        if (data && !data.minBid) {
          const mapped: NFTListing = {
            txid: data.txid,
            vout: 0,
            tokenCategory: data.tokenCategory,
            commitment: data.commitment || '',
            satoshis: 0,
            price: BigInt(data.price || '0'),
            sellerAddress: data.seller,
            sellerPkh: data.sellerPkh || '',
            creatorAddress: data.creator || data.seller,
            creatorPkh: data.creatorPkh || '',
            royaltyBasisPoints: data.royaltyBasisPoints || 0,
            status: data.status || 'active',
            listingType: 'fixed',
            metadata: data.metadata,
          };
          setListing(mapped);
          if (data.collectionFloor) {
            setCollectionFloor(BigInt(data.collectionFloor));
          }
        } else {
          setListing(null);
        }
      } catch (err) {
        console.error('Failed to fetch listing:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchListing();
  }, [id]);

  const handleBuy = async () => {
    if (!wallet?.isConnected) {
      setModalOpen(true);
      return;
    }
    setIsBuying(true);
    setError('');
    try {
      if (!listing) throw new Error('Listing not found');
      if (listing.status !== 'active') throw new Error('Listing is no longer active');
      if (connectionType === 'walletconnect') {
        const wcParams = await buildWcBuyParams({ listing, buyerAddress: wallet.address });
        if ('error' in wcParams) throw new Error(wcParams.error);

        const wcRequest = wcPayloadMode === 'raw'
          ? {
              transaction: wcParams.transaction,
              sourceOutputs: wcParams.sourceOutputs as any,
            }
          : {
              transaction: wcParams.transactionHex,
              sourceOutputs: wcParams.sourceOutputsJson as any,
            };

        const signResult = await signTransaction({
          ...wcRequest,
          broadcast: true,
          userPrompt: wcParams.userPrompt,
        });

        if (!signResult) throw new Error('Transaction signing was rejected by wallet.');

        setListing({ ...listing, status: 'sold' });
        setBuySuccess(true);
      } else {
        const walletData = loadWallet();
        if (!walletData) throw new Error('Wallet not found. Please reconnect.');

        const result = await buyNFT(walletData.privateKey, listing, walletData.address);
        if (!result.success) throw new Error(result.error || 'Purchase failed');

        setListing({ ...listing, status: 'sold' });
        setBuySuccess(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchase failed');
    } finally {
      setIsBuying(false);
    }
  };

  const copyAddress = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="aspect-square rounded-2xl skeleton" />
            <div className="space-y-4">
              <div className="h-8 skeleton w-3/4" />
              <div className="h-4 skeleton w-1/2" />
              <div className="h-32 skeleton" />
              <div className="h-12 skeleton" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        <div className="mx-auto max-w-4xl">
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Explore
          </Link>
          <div className="card p-8 text-center">
            <AlertCircle className="h-8 w-8 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Listing not found
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              The listing may have been sold or cancelled.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show a generic NFT detail view based on the token ID
  const displayName = listing?.metadata?.name || `Token #${id.slice(0, 12)}`;
  const rawImage = listing?.metadata?.image || '';
  // Build a list of gateway URLs to try in sequence on image load error
  const imageGateways = rawImage ? (() => {
    const cid = rawImage.startsWith('ipfs://') ? rawImage.slice(7) : rawImage.startsWith('http') ? null : rawImage;
    if (!cid) return rawImage ? [rawImage] : [];
    return [
      `${process.env.NEXT_PUBLIC_PINATA_GATEWAY || 'https://gateway.pinata.cloud'}/ipfs/${cid}`,
      `https://ipfs.io/ipfs/${cid}`,
      `https://cloudflare-ipfs.com/ipfs/${cid}`,
    ];
  })() : [];
  const displayImage = imageGateways[0] || null;
  const displayPrice = listing?.price || 0n;
  const displayRoyalty = listing?.royaltyBasisPoints || 1000;
  const sellerAddr = listing?.sellerAddress || '';
  const creatorAddr = listing?.creatorAddress || '';
  const isActiveListing = listing?.status === 'active';

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8">
      <div className="mx-auto max-w-6xl">
        {/* Back button */}
        <Link
          href="/explore"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Explore
        </Link>

        <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
          {/* Left - Image */}
          <div>
            <div
              className="aspect-square rounded-2xl overflow-hidden"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
            >
              {displayImage ? (
                <img
                  src={displayImage}
                  alt={displayName}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const next = imgFallbackRef.current + 1;
                    if (next < imageGateways.length) {
                      imgFallbackRef.current = next;
                      (e.target as HTMLImageElement).src = imageGateways[next];
                    } else {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center">
                    <div
                      className="text-8xl font-bold font-mono mb-4"
                      style={{ color: 'rgba(0,229,69,0.1)' }}
                    >
                      {id.slice(0, 6)}
                    </div>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>CashTokens NFT</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right - Details */}
          <div className="space-y-6">
            {/* Title & Badge */}
            <div>
              <div className="badge mb-3">
                <Tag className="h-3 w-3 mr-1" />
                Fixed Price
              </div>
              <h1 className="text-3xl font-bold">{displayName}</h1>
              {listing?.metadata?.description && (
                <p className="text-gray-500 mt-2">{listing.metadata.description}</p>
              )}
            </div>

            {/* Creator & Seller */}
            <div className="grid grid-cols-2 gap-4">
              {creatorAddr && (
                <div
                  className="p-3 rounded-xl"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
                >
                  <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Creator</div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                    <span className="text-sm font-mono">{shortenAddress(creatorAddr, 6)}</span>
                  </div>
                </div>
              )}
              {sellerAddr && (
                <div
                  className="p-3 rounded-xl"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
                >
                  <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Seller</div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" style={{ color: 'var(--accent-purple)' }} />
                    <span className="text-sm font-mono">{shortenAddress(sellerAddr, 6)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Price Card */}
            <div className="card p-6">
              <div className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Price</div>
              <div className="text-3xl font-bold font-mono" style={{ color: 'var(--accent)' }}>
                {formatBCH(displayPrice)}
              </div>
              {bchUsd > 0 && displayPrice > 0n && (
                <div className="text-sm font-mono mb-4" style={{ color: 'var(--text-muted)' }}>
                  {formatUSD(displayPrice, bchUsd)}
                </div>
              )}
              {!(bchUsd > 0 && displayPrice > 0n) && <div className="mb-4" />}

              {/* Collection floor */}
              {collectionFloor !== null && collectionFloor > 0n && (
                <div className="flex items-center justify-between text-xs mb-3 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Collection Floor</span>
                  <span className="font-mono font-semibold" style={{ color: 'var(--accent)' }}>
                    {formatBCH(collectionFloor)}
                    {bchUsd > 0 && (
                      <span className="ml-1 font-normal" style={{ color: 'var(--text-muted)' }}>
                        ({formatUSD(collectionFloor, bchUsd)})
                      </span>
                    )}
                  </span>
                </div>
              )}

              {/* Royalty breakdown */}
              <div className="flex items-center gap-4 text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
                <div className="flex items-center gap-1">
                  <Percent className="h-3 w-3" />
                  {displayRoyalty / 100}% Creator Royalty
                </div>
                <div className="flex items-center gap-1">
                  <Shield className="h-3 w-3" style={{ color: 'var(--accent)' }} />
                  Atomic Swap
                </div>
              </div>

              {buySuccess ? (
                <div
                  className="p-4 rounded-xl text-center"
                  style={{ background: 'rgba(0,229,69,0.1)' }}
                >
                  <Check className="h-8 w-8 mx-auto mb-2" style={{ color: 'var(--accent)' }} />
                  <div className="font-semibold" style={{ color: 'var(--accent)' }}>Purchase Complete!</div>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>NFT transferred to your wallet</p>
                </div>
              ) : (
                <button
                  onClick={handleBuy}
                  disabled={isBuying || !isActiveListing}
                  className="btn-primary w-full py-4 text-lg flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isBuying ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Processing...
                    </>
                  ) : !isActiveListing ? (
                    'Listing Not Active'
                  ) : wallet?.isConnected ? (
                    <>
                      <ShoppingCart className="h-5 w-5" />
                      Buy Now
                    </>
                  ) : (
                    'Connect Wallet to Buy'
                  )}
                </button>
              )}

              {error && (
                <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}
            </div>

            {/* Token Details */}
            <div className="card p-5">
              <h3 className="font-semibold mb-4">Token Details</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Token ID</span>
                  <button
                    onClick={() => copyAddress(id)}
                    className="flex items-center gap-1 text-sm font-mono hover:opacity-80"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {id.slice(0, 16)}...
                    {copied ? <Check className="h-3 w-3" style={{ color: 'var(--accent)' }} /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Standard</span>
                  <span className="text-sm">CashTokens (CHIP-2022-02)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Network</span>
                  <span className="text-sm" style={{ color: 'var(--accent)' }}>Chipnet</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Contract</span>
                  <span className="text-sm">CashScript Covenant</span>
                </div>
              </div>
            </div>

            {/* Attributes */}
            {listing?.metadata?.attributes && listing.metadata.attributes.length > 0 && (
              <div className="card p-5">
                <h3 className="font-semibold mb-4">Attributes</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {listing.metadata.attributes.map((attr, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg text-center"
                      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
                    >
                      <div className="text-xs uppercase" style={{ color: 'var(--accent)' }}>{attr.trait_type}</div>
                      <div className="text-sm font-medium mt-1">{attr.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
