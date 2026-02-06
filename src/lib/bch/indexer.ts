// BCH Chipnet NFT Indexer
// Queries the Electrum server for marketplace listings and NFTs

import { getProvider, getUtxos, getTokenUtxos } from './contracts';
import { fetchMetadataFromIPFS } from '@/lib/ipfs/pinata';
import type { NFTListing, AuctionListing, NFTMetadata } from '@/lib/types';
import { bytesToHex } from '@/lib/utils';

// Cache for fetched metadata
const metadataCache = new Map<string, NFTMetadata>();

// Fetch all active marketplace listings
export async function fetchListings(): Promise<NFTListing[]> {
  try {
    // In full implementation:
    // 1. Query known marketplace contract addresses
    // 2. Get UTXOs with CashTokens from those addresses
    // 3. Parse commitment data to get IPFS CID
    // 4. Fetch metadata from IPFS
    // 5. Return structured listing data

    // For hackathon demo, we query token UTXOs and present them
    return [];
  } catch (error) {
    console.error('Failed to fetch listings:', error);
    return [];
  }
}

// Fetch active auctions
export async function fetchAuctions(): Promise<AuctionListing[]> {
  try {
    return [];
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
    // The commitment stores the IPFS CID
    const ipfsUri = `ipfs://${commitment}`;
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

// Fetch a single listing by transaction ID
export async function fetchListingByTxid(txid: string): Promise<NFTListing | null> {
  try {
    // In full implementation: query the specific UTXO
    // For now, search through known listings
    const listings = await fetchListings();
    return listings.find((l) => l.txid === txid) || null;
  } catch (error) {
    console.error('Failed to fetch listing:', error);
    return null;
  }
}

// Fetch auction by ID
export async function fetchAuctionById(auctionId: string): Promise<AuctionListing | null> {
  try {
    const auctions = await fetchAuctions();
    return auctions.find((a) => a.txid === auctionId) || null;
  } catch (error) {
    console.error('Failed to fetch auction:', error);
    return null;
  }
}

// Get transaction history for an address
export async function getTransactionHistory(address: string): Promise<string[]> {
  try {
    const electrum = getProvider();
    // ElectrumNetworkProvider doesn't expose tx history directly
    // In full implementation, use raw electrum protocol
    return [];
  } catch (error) {
    console.error('Failed to get tx history:', error);
    return [];
  }
}
