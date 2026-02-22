// Core types for BCH Chipnet NFT Marketplace

export interface NFTMetadata {
  name: string;
  description: string;
  image: string; // ipfs:// URI
  creator: string; // BCH address
  attributes?: NFTAttribute[];
  createdAt?: number;
  collection?: string;       // Collection name (groups multiple NFTs)
  collectionImage?: string;  // ipfs:// URI for collection thumbnail
}

export interface Collection {
  slug: string;
  name: string;
  description?: string;
  image?: string;          // ipfs:// URI for collection image
  creatorAddress: string;
  creatorPkh?: string;
  tokenCategory?: string;  // Set when all items share the same tokenCategory (minting token model)
  floorPrice: string;      // Satoshis string
  totalVolume: string;     // Satoshis string
  listedCount: number;
  totalSupply: number;
  ownerCount: number;
  royaltyBasisPoints: number;
  items: any[];
  createdAt?: number;
}

export interface NFTAttribute {
  trait_type: string;
  value: string;
}

export interface NFTListing {
  txid: string;
  vout: number;
  tokenCategory: string;
  commitment: string;
  satoshis: number;
  price: bigint;
  sellerAddress: string;
  sellerPkh: string;
  creatorAddress: string;
  creatorPkh: string;
  royaltyBasisPoints: number;
  metadata?: NFTMetadata;
  status: 'active' | 'sold' | 'cancelled';
  listingType: 'fixed' | 'auction';
  contractAddress?: string;
}

export interface AuctionListing extends NFTListing {
  listingType: 'auction';
  minBid: bigint;
  currentBid: bigint;
  currentBidder: string;
  endTime: number; // Unix timestamp
  minBidIncrement: bigint;
  bidHistory: AuctionBid[];
}

export interface AuctionBid {
  bidder: string;
  amount: bigint;
  txid: string;
  timestamp: number;
}

export interface WalletInfo {
  address: string;
  tokenAddress: string;
  balance: bigint;
  publicKey: string;
  isConnected: boolean;
}

export interface MintParams {
  name: string;
  description: string;
  imageFile: File;
  royaltyPercent: number;
  attributes?: NFTAttribute[];
  collection?: string;
  capability?: 'none' | 'mutable' | 'minting';
}

export interface ListingParams {
  tokenCategory: string;
  commitment: string;
  price: bigint;
  royaltyBasisPoints: number;
  creatorPkh: string;
}

export interface AuctionParams {
  tokenCategory: string;
  commitment: string;
  minBid: bigint;
  durationHours: number;
  royaltyBasisPoints: number;
  minBidIncrement: bigint;
  creatorPkh: string;
}

export interface TransactionResult {
  success: boolean;
  txid?: string;
  error?: string;
  tokenCategory?: string; // For mintNFT: the newly created token category
}

export interface ChipnetConfig {
  electrumHost: string;
  electrumPort: number;
  network: 'chipnet' | 'mainnet' | 'testnet';
  addressPrefix: string;
}

export type ListingFilter = 'all' | 'fixed' | 'auction';
export type SortOption = 'newest' | 'price-low' | 'price-high' | 'ending-soon';

// ─── NFT Drops ───────────────────────────────────────────────────────────────

export interface NFTDrop {
  id: string;
  slug: string;
  name: string;
  description: string;
  bannerImage: string;          // ipfs:// URI (used as main banner)
  thumbnailImage?: string;      // ipfs:// URI (optional separate thumbnail)
  creatorAddress: string;

  // Supply
  totalSupply: number;          // max mintable NFTs
  mintedCount: number;          // how many have been minted

  // Pricing
  mintPrice: string;            // satoshis as string (BigInt-safe)

  // Timing (unix timestamps, seconds)
  mintStartTime: number;        // public mint opens
  mintEndTime?: number;         // optional close time

  // Early access / allowlist
  whitelistEnabled: boolean;
  whitelistStartTime?: number;  // pre-sale opens (before mintStartTime)
  whitelistAddresses?: string[];

  // Per-wallet cap
  maxPerWallet: number;

  // Metadata template (applied to each sequentially minted NFT)
  collectionName: string;
  metadataDescription: string;
  royaltyBasisPoints: number;
  attributes?: Array<{ trait_type: string; value: string }>;

  // Per-address mint count: address → number minted
  mintedBy: Record<string, number>;

  // Token categories for minted NFTs (txids)
  mintedTokenCategories: string[];

  createdAt: number;            // unix timestamp, seconds
}

export type DropStatus = 'upcoming' | 'presale' | 'live' | 'ended' | 'sold-out';
