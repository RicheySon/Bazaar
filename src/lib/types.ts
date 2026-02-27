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
  bcmrUrl?: string;          // Bitcoin Cash Metadata Registry URL for verified status
}

/**
 * Serialized NFT listing as returned by the marketplace indexer.
 * Prices are strings (JSON-safe bigint), and address fields use `seller`/`creator`
 * rather than the `sellerAddress`/`creatorAddress` names used in NFTListing.
 */
export interface CollectionItem {
  txid: string;
  tokenCategory: string;
  commitment: string;
  price?: string;           // satoshis string (fixed listings)
  minBid?: string;          // satoshis string (auctions)
  currentBid?: string;      // satoshis string (auctions)
  endTime?: number;         // unix timestamp (auctions)
  seller: string;           // seller BCH address
  sellerPkh: string;
  creator: string;          // creator BCH address
  creatorPkh: string;
  royaltyBasisPoints: number;
  status: 'active' | 'sold' | 'cancelled' | 'ended';
  listingType?: 'fixed' | 'auction';
  metadata?: NFTMetadata | null;
  createdAt?: number;
  updatedAt?: number;
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
  bids?: CollectionBid[];
  items: CollectionItem[];
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

export interface CollectionBid {
  txid: string;
  tokenCategory: string;
  bidSalt: string;
  price: string; // satoshis string
  bidder: string;
  bidderPkh: string;
  creator: string;
  creatorPkh: string;
  royaltyBasisPoints: number;
  status: 'active' | 'filled' | 'cancelled';
  contractAddress?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface AuctionListing extends NFTListing {
  listingType: 'auction';
  minBid: bigint;
  currentBid: bigint;
  currentBidder: string;
  endTime: number; // Unix timestamp
  minBidIncrement: bigint;
  bidHistory: AuctionBid[];
  trackingCategory?: string;
  auctionStateAddress?: string;
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

// ─── Liquidity Pools ──────────────────────────────────────────────────────────

export interface LiquidityPool {
  txid: string;             // creation txid (pool UTXO txid)
  tokenCategory: string;   // collection this pool buys
  poolSalt: string;         // 32-byte hex salt (makes pool address unique)
  price: string;            // satoshis per NFT (string for JSON safety)
  operator: string;         // operator BCH address
  operatorPkh: string;      // operator public key hash hex
  creator: string;          // creator BCH address (receives royalties)
  creatorPkh: string;       // creator public key hash hex
  royaltyBasisPoints: number;
  contractAddress: string;  // P2SH32 pool address
  availableSats: string;    // current BCH in pool (satoshis, string)
  status: 'active' | 'empty' | 'withdrawn';
  createdAt?: number;
  updatedAt?: number;
}

// ─── Fractionalized NFTs ──────────────────────────────────────────────────────

export interface FractionalVaultInfo {
  sharesCategory: string;   // 32-byte hex (genesis input txid = shares token category)
  claimsScriptHash: string; // 32-byte hex (sha256d of claims redeem script)
  totalShares: string;      // "1000000" (string for JSON safety)
  reserveSats: string;      // fixed buyout price in satoshis (string)
  vaultAddress: string;     // P2SH32 token-capable address holding the original NFT
  claimsAddress: string;    // P2SH32 token-capable address holding BCH proceeds
  nftCategory: string;      // token category of the original fractionalized NFT
  nftCommitment: string;    // original NFT commitment hex
  nftCapability: string;    // 'none' | 'mutable' | 'minting'
  nftMetadata?: NFTMetadata;
  createdAt?: number;       // unix timestamp
}

export interface VaultStatus {
  active: boolean;          // vault UTXO exists (NFT not yet bought out)
  boughtOut: boolean;       // vault gone, claims holds BCH proceeds
  claimsHasBch: boolean;
  remainingShares: string;  // string for JSON-safe serialization
  remainingSats: string;
  totalShares: string;
  reserveSats: string;
}
