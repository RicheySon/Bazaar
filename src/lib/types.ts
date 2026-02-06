// Core types for BCH Chipnet NFT Marketplace

export interface NFTMetadata {
  name: string;
  description: string;
  image: string; // ipfs:// URI
  creator: string; // BCH address
  attributes?: NFTAttribute[];
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
  creatorPkh: string;
}

export interface TransactionResult {
  success: boolean;
  txid?: string;
  error?: string;
}

export interface ChipnetConfig {
  electrumHost: string;
  electrumPort: number;
  network: 'chipnet' | 'mainnet' | 'testnet';
  addressPrefix: string;
}

export type ListingFilter = 'all' | 'fixed' | 'auction';
export type SortOption = 'newest' | 'price-low' | 'price-high' | 'ending-soon';
