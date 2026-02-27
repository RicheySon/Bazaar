// Bazaar SDK — Type definitions
// The Liquidity Layer for Bitcoin Cash NFTs

export interface NexusConfig {
  /** Base URL of the Bazaar API (default: '/api') */
  baseUrl?: string;
}

export interface NexusNFTRef {
  txid: string;
  vout: number;
  satoshis: string | number | bigint;
  tokenCategory: string;
  commitment?: string;
  capability?: 'none' | 'mutable' | 'minting';
}

export interface NexusCredentials {
  privateKeyHex: string;
  address: string;
  /** Public key hash (20-byte hex) */
  pkh?: string;
}

export interface FloorData {
  tokenCategory: string;
  floorPrice: string;   // satoshis
  listingCount: number;
  bestBid: string;      // satoshis
  bidCount: number;
  poolCount: number;
  bestPoolPrice: string; // satoshis
}

export interface BidData {
  txid: string;
  tokenCategory: string;
  bidSalt: string;
  price: string;
  bidder: string;
  bidderPkh: string;
  creator: string;
  creatorPkh: string;
  royaltyBasisPoints: number;
  status: 'active' | 'filled' | 'cancelled';
  contractAddress?: string;
  createdAt?: number;
}

export interface PoolData {
  txid: string;
  tokenCategory: string;
  poolSalt: string;
  price: string;
  operator: string;
  operatorPkh: string;
  creator: string;
  creatorPkh: string;
  royaltyBasisPoints: number;
  contractAddress: string;
  availableSats: string;
  status: 'active' | 'empty' | 'withdrawn';
  createdAt?: number;
}

export interface SellResult {
  success: boolean;
  txid?: string;
  error?: string;
  bid?: BidData;
  pool?: PoolData;
  source: 'bid' | 'pool';
}

export interface BuyResult {
  success: boolean;
  txid?: string;
  error?: string;
}

export interface SweepResult {
  success: boolean;
  purchased: number;
  failed: number;
  txids: string[];
  errors: string[];
}

export interface BidResult {
  success: boolean;
  txid?: string;
  bidSalt?: string;
  error?: string;
}

export interface ListResult {
  success: boolean;
  txid?: string;
  error?: string;
}

export interface PoolResult {
  success: boolean;
  txid?: string;
  contractAddress?: string;
  poolSalt?: string;
  pool?: PoolData;
  error?: string;
}
