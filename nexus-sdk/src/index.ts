/**
 * NexusClient — Bazaar BCH NFT Marketplace SDK
 *
 * Zero-dependency TypeScript client. Wraps all BAZAAR REST endpoints.
 * No blockchain imports — safe to use in any browser or Node.js frontend.
 *
 * Usage:
 *   import { NexusClient } from './nexus-sdk/src';
 *   const nexus = new NexusClient();           // same-origin
 *   const nexus = new NexusClient('https://bazaar.example.com'); // cross-origin
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NexusMetadata {
  name: string;
  description: string;
  image: string;               // ipfs:// URI
  creator?: string;
  attributes?: Array<{ trait_type: string; value: string }>;
  collection?: string;
  collectionImage?: string;
  bcmrUrl?: string;            // Bitcoin Cash Metadata Registry URL
  createdAt?: number;          // Unix ms
}

export interface NexusListing {
  txid: string;
  tokenCategory: string;
  price: string;               // satoshis — use BigInt(listing.price) to compare
  seller: string;              // BCH address
  sellerPkh?: string;          // hex pubkey hash
  creator?: string;            // BCH address
  creatorPkh?: string;
  commitment: string;          // hex-encoded NFT commitment (decodes to CID)
  royaltyBasisPoints: number;  // e.g. 500 = 5%
  status: 'active' | 'sold' | 'cancelled';
  listingType: 'fixed' | 'auction';
  metadata?: NexusMetadata;
  createdAt?: number;          // block time ms
  updatedAt?: number;          // status-event block time ms
}

export interface NexusAuction extends NexusListing {
  listingType: 'auction';
  minBid: string;              // satoshis
  currentBid: string;          // satoshis
  endTime: number;             // Unix seconds
  minBidIncrement: string;     // satoshis
  currentBidder?: string;      // BCH address (if bid placed)
  bidHistory: Array<{
    bidder: string;
    amount: string;
    txid: string;
    timestamp: number;
  }>;
}

export interface NexusCollection {
  slug: string;
  name: string;
  image?: string;              // ipfs:// URI
  creatorAddress: string;
  creatorPkh?: string;
  tokenCategory?: string;      // set for minting-model collections
  floorPrice: string;          // satoshis
  totalVolume: string;         // satoshis
  listedCount: number;
  totalSupply: number;
  ownerCount: number;
  royaltyBasisPoints: number;
  items: Array<NexusListing | NexusAuction>;
  createdAt?: number;
}

export interface NexusActivity {
  txid: string;
  tokenCategory: string;
  price: string;               // satoshis
  seller: string;
  status: 'sold' | 'cancelled';
  listingType: 'fixed' | 'auction';
  metadata?: NexusMetadata;
  updatedAt?: number;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class NexusClient {
  private baseUrl: string;

  /**
   * @param baseUrl - Base URL of the BAZAAR deployment (default: same origin).
   *                  Example: 'https://bazaar-three-gamma.vercel.app'
   */
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  // ── Collections ─────────────────────────────────────────────────────────────

  /** Fetch all NFT collections grouped by token category. */
  async getCollections(): Promise<NexusCollection[]> {
    const res = await fetch(`${this.baseUrl}/api/collections`);
    if (!res.ok) throw new Error(`getCollections failed: HTTP ${res.status}`);
    const data = await res.json();
    return data.collections ?? [];
  }

  /** Fetch a single collection by slug. Returns null if not found. */
  async getCollection(slug: string): Promise<NexusCollection | null> {
    const res = await fetch(
      `${this.baseUrl}/api/collections/${encodeURIComponent(slug)}`
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`getCollection failed: HTTP ${res.status}`);
    return res.json();
  }

  /** Fetch only active fixed-price listings in a collection, sorted cheapest first. */
  async getListings(slug: string): Promise<NexusListing[]> {
    const col = await this.getCollection(slug);
    if (!col) return [];
    return (col.items as NexusListing[])
      .filter((item) => item.status === 'active' && item.listingType === 'fixed')
      .sort((a, b) => {
        const diff = BigInt(a.price) - BigInt(b.price);
        return diff < 0n ? -1 : diff > 0n ? 1 : 0;
      });
  }

  /** Get the current floor price in satoshis. Returns null if no active listings. */
  async getFloorPrice(slug: string): Promise<bigint | null> {
    const col = await this.getCollection(slug);
    if (!col || col.floorPrice === '0') return null;
    return BigInt(col.floorPrice);
  }

  // ── Listings ─────────────────────────────────────────────────────────────────

  /** Fetch a single listing or auction by txid. Returns null if not found. */
  async getListing(id: string): Promise<NexusListing | NexusAuction | null> {
    const res = await fetch(
      `${this.baseUrl}/api/marketplace/${encodeURIComponent(id)}`
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`getListing failed: HTTP ${res.status}`);
    return res.json();
  }

  // ── Activity ──────────────────────────────────────────────────────────────────

  /**
   * Fetch recent activity (sold/cancelled items), sorted most-recent first.
   * @param slug - If provided, restricts activity to that collection.
   */
  async getActivity(slug?: string): Promise<NexusActivity[]> {
    if (slug) {
      const col = await this.getCollection(slug);
      if (!col) return [];
      return (col.items as NexusListing[])
        .filter((item) => item.status !== 'active')
        .map((item) => ({
          txid: item.txid,
          tokenCategory: item.tokenCategory,
          price: item.price,
          seller: item.seller,
          status: item.status as 'sold' | 'cancelled',
          listingType: item.listingType,
          metadata: item.metadata,
          updatedAt: item.updatedAt,
        }))
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    }

    const res = await fetch(`${this.baseUrl}/api/marketplace`);
    if (!res.ok) return [];
    const data = await res.json();
    const all: NexusListing[] = [
      ...(data.listings ?? []),
      ...(data.auctions ?? []),
    ];
    return all
      .filter((item) => item.status !== 'active')
      .map((item) => ({
        txid: item.txid,
        tokenCategory: item.tokenCategory,
        price: item.price ?? (item as any).minBid ?? '0',
        seller: item.seller,
        status: item.status as 'sold' | 'cancelled',
        listingType: item.listingType,
        metadata: item.metadata,
        updatedAt: item.updatedAt,
      }))
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }
}

export default NexusClient;
