// BCH Chipnet NFT Indexer
// Uses API-backed chain indexer for listings and Electrum for wallet NFTs

import { getProvider, getUtxos, getTokenUtxos } from './contracts';
import { fetchMetadataFromIPFS } from '@/lib/ipfs/pinata';
import type { NFTListing, AuctionListing, NFTMetadata } from '@/lib/types';
import { hexToUtf8, isHexString } from '@/lib/utils';
import { fetchMarketplaceListings, fetchMarketplaceListingById } from '@/lib/bch/api-client';

// Cache for fetched metadata
const metadataCache = new Map<string, NFTMetadata>();

// Fetch all active marketplace listings (from chain indexer API)
export async function fetchListings(): Promise<NFTListing[]> {
  try {
    const data = await fetchMarketplaceListings();
    if (!data) return [];
    return data.listings.map((l) => ({
      txid: l.txid,
      vout: 0,
      tokenCategory: l.tokenCategory,
      commitment: l.commitment,
      satoshis: 0,
      price: BigInt(l.price),
      sellerAddress: l.seller,
      sellerPkh: l.sellerPkh || '',
      creatorAddress: l.creator || l.seller,
      creatorPkh: l.creatorPkh || '',
      royaltyBasisPoints: l.royaltyBasisPoints,
      status: (l.status || 'active') as any,
      listingType: 'fixed',
      metadata: l.metadata,
    }));
  } catch (error) {
    console.error('Failed to fetch listings:', error);
    return [];
  }
}

// Fetch active auctions (from chain indexer API)
export async function fetchAuctions(): Promise<AuctionListing[]> {
  try {
    const data = await fetchMarketplaceListings();
    if (!data) return [];
    return data.auctions.map((a) => ({
      txid: a.txid,
      vout: 0,
      tokenCategory: a.tokenCategory,
      commitment: a.commitment || '',
      satoshis: 0,
      price: BigInt(a.currentBid || a.minBid || '0'),
      sellerAddress: a.seller,
      sellerPkh: a.sellerPkh || '',
      creatorAddress: a.creator || a.seller,
      creatorPkh: a.creatorPkh || '',
      royaltyBasisPoints: a.royaltyBasisPoints,
      status: (a.status || 'active') as any,
      listingType: 'auction',
      minBid: BigInt(a.minBid || '0'),
      currentBid: BigInt(a.currentBid || '0'),
      currentBidder: a.currentBidder || '',
      endTime: a.endTime || 0,
      minBidIncrement: BigInt(a.minBidIncrement || '0'),
      bidHistory: a.bidHistory || [],
      metadata: a.metadata,
    }));
  } catch (error) {
    console.error('Failed to fetch auctions:', error);
    return [];
  }
}

// Fetch NFTs owned by a specific address
export async function fetchUserNFTs(address: string): Promise<NFTListing[]> {
  try {
    const tokenUtxos = await getTokenUtxos(address);

    const nfts: NFTListing[] = tokenUtxos.map((utxo) => {
      const commitment = utxo.token?.nft?.commitment || '';

      return {
        txid: utxo.txid,
        vout: utxo.vout,
        tokenCategory: utxo.token?.category || '',
        commitment,
        satoshis: Number(utxo.satoshis),
        price: 0n,
        sellerAddress: address,
        sellerPkh: '',
        creatorAddress: address,
        creatorPkh: '',
        royaltyBasisPoints: 1000,
        status: 'active' as const,
        listingType: 'fixed' as const,
      };
    });

    // Try to fetch metadata for each NFT
    for (const nft of nfts) {
      if (nft.commitment) {
        const metadata = await fetchNFTMetadata(nft.commitment);
        if (metadata) {
          nft.metadata = metadata;
        }
      }
    }

    return nfts;
  } catch (error) {
    console.error('Failed to fetch user NFTs:', error);
    return [];
  }
}

// Fetch metadata for an NFT from its commitment (IPFS CID)
async function fetchNFTMetadata(commitment: string): Promise<NFTMetadata | null> {
  // Check cache first
  if (metadataCache.has(commitment)) {
    return metadataCache.get(commitment) || null;
  }

  try {
    const cid = isHexString(commitment) ? hexToUtf8(commitment) : commitment;
    if (!cid) return null;
    // The commitment stores the IPFS CID
    const ipfsUri = `ipfs://${cid}`;
    const data = await fetchMetadataFromIPFS(ipfsUri);

    if (data) {
      const metadata: NFTMetadata = {
        name: (data.name as string) || 'Untitled',
        description: (data.description as string) || '',
        image: (data.image as string) || '',
        creator: (data.creator as string) || '',
        attributes: (data.attributes as NFTMetadata['attributes']) || [],
        createdAt: (data.createdAt as number) || Date.now(),
      };

      metadataCache.set(commitment, metadata);
      return metadata;
    }
  } catch {
    // Metadata fetch failed, return null
  }

  return null;
}

// Fetch a single listing by transaction ID (chain indexer)
export async function fetchListingByTxid(txid: string): Promise<NFTListing | null> {
  try {
    const data = await fetchMarketplaceListingById(txid);
    if (!data || data.minBid) return null;
    return {
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
      status: (data.status || 'active') as any,
      listingType: 'fixed',
      metadata: data.metadata,
    };
  } catch (error) {
    console.error('Failed to fetch listing:', error);
    return null;
  }
}

// Fetch auction by ID (chain indexer)
export async function fetchAuctionById(auctionId: string): Promise<AuctionListing | null> {
  try {
    const data = await fetchMarketplaceListingById(auctionId);
    if (!data || !data.minBid) return null;
    return {
      txid: data.txid,
      vout: 0,
      tokenCategory: data.tokenCategory,
      commitment: data.commitment || '',
      satoshis: 0,
      price: BigInt(data.currentBid || data.minBid || '0'),
      sellerAddress: data.seller,
      sellerPkh: data.sellerPkh || '',
      creatorAddress: data.creator || data.seller,
      creatorPkh: data.creatorPkh || '',
      royaltyBasisPoints: data.royaltyBasisPoints || 0,
      status: (data.status || 'active') as any,
      listingType: 'auction',
      minBid: BigInt(data.minBid || '0'),
      currentBid: BigInt(data.currentBid || '0'),
      currentBidder: data.currentBidder || '',
      endTime: data.endTime || 0,
      minBidIncrement: BigInt(data.minBidIncrement || '0'),
      bidHistory: data.bidHistory || [],
      metadata: data.metadata,
    };
  } catch (error) {
    console.error('Failed to fetch auction:', error);
    return null;
  }
}

// Get transaction history for an address (not available via ElectrumNetworkProvider)
export async function getTransactionHistory(address: string): Promise<string[]> {
  try {
    const electrum = getProvider();
    // ElectrumNetworkProvider doesn't expose tx history directly
    return [];
  } catch (error) {
    console.error('Failed to get tx history:', error);
    return [];
  }
}
