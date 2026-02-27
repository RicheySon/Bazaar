/**
 * Bazaar SDK — The Liquidity Layer for Bitcoin Cash NFTs
 *
 * Plug-and-play BCH NFT trading for games, wallets, and dApps.
 *
 * @example
 * import { createBazaarSDK } from '@/lib/nexus-sdk';
 *
 * const bazaar = createBazaarSDK({ baseUrl: 'https://your-app.com/api' });
 *
 * // Instant sell an NFT
 * const result = await bazaar.instantSell(nftRef, credentials);
 *
 * // Place a collection bid
 * const bid = await bazaar.bid(tokenCategory, price, creatorPkh, royaltyBps, credentials);
 */

import type {
  NexusConfig,
  NexusNFTRef,
  NexusCredentials,
  FloorData,
  BidData,
  PoolData,
  SellResult,
  BuyResult,
  SweepResult,
  BidResult,
  ListResult,
  PoolResult,
} from './types';

export type * from './types';

async function apiFetch(base: string, path: string, options?: RequestInit) {
  const url = `${base}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err?.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function createBazaarSDK(config: NexusConfig = {}) {
  const base = (config.baseUrl || '/api').replace(/\/$/, '');

  return {
    /**
     * Instantly sell an NFT by accepting the best available collection bid or pool offer.
     * Tries collection bids first (highest price), then falls back to pool offers.
     */
    async instantSell(nftRef: NexusNFTRef, creds: NexusCredentials): Promise<SellResult> {
      const nftUtxo = {
        txid: nftRef.txid,
        vout: nftRef.vout,
        satoshis: nftRef.satoshis.toString(),
        tokenCategory: nftRef.tokenCategory,
        commitment: nftRef.commitment || '',
        capability: nftRef.capability || 'none',
      };

      // 1. Try collection bids first
      try {
        const bidResult = await apiFetch(base, '/instant-sell', {
          method: 'POST',
          body: JSON.stringify({
            privateKeyHex: creds.privateKeyHex,
            sellerAddress: creds.address,
            nftUtxo,
          }),
        });
        if (bidResult.success) return { ...bidResult, source: 'bid' };
      } catch {
        // No bids — fall through to pool
      }

      // 2. Try liquidity pools
      try {
        const { pools } = await apiFetch(base, `/pool?category=${nftRef.tokenCategory}`, {});
        const activePools: PoolData[] = (pools || [])
          .filter((p: PoolData) => p.status === 'active')
          .sort((a: PoolData, b: PoolData) => Number(BigInt(b.price) - BigInt(a.price)));

        if (activePools.length > 0) {
          const bestPool = activePools[0];
          const poolResult = await apiFetch(base, '/pool/sell', {
            method: 'POST',
            body: JSON.stringify({
              privateKeyHex: creds.privateKeyHex,
              sellerAddress: creds.address,
              nftUtxo,
              poolTxid: bestPool.txid,
            }),
          });
          if (poolResult.success) return { ...poolResult, source: 'pool' };
        }
      } catch {
        // No pools
      }

      return { success: false, error: 'No active bids or pools for this collection', source: 'bid' };
    },

    /**
     * Buy a fixed-price listing.
     */
    async buy(listingTxid: string, creds: NexusCredentials): Promise<BuyResult> {
      return apiFetch(base, '/sweep', {
        method: 'POST',
        body: JSON.stringify({
          privateKeyHex: creds.privateKeyHex,
          buyerAddress: creds.address,
          listingTxid,
        }),
      });
    },

    /**
     * Batch-buy multiple fixed-price listings atomically (floor sweep).
     */
    async sweep(listingTxids: string[], creds: NexusCredentials): Promise<SweepResult> {
      const results = await Promise.allSettled(
        listingTxids.map((txid) =>
          apiFetch(base, '/sweep', {
            method: 'POST',
            body: JSON.stringify({
              privateKeyHex: creds.privateKeyHex,
              buyerAddress: creds.address,
              listingTxid: txid,
            }),
          })
        )
      );

      const txids: string[] = [];
      const errors: string[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value?.success) {
          txids.push(r.value.txid);
        } else {
          errors.push(r.status === 'rejected' ? r.reason?.message : r.value?.error || 'Unknown error');
        }
      }

      return { success: errors.length === 0, purchased: txids.length, failed: errors.length, txids, errors };
    },

    /**
     * Place a collection bid (limit buy order for any NFT in a collection).
     */
    async bid(
      tokenCategory: string,
      priceSats: bigint | string,
      creatorPkh: string,
      royaltyBasisPoints: number,
      creds: NexusCredentials
    ): Promise<BidResult> {
      if (!creds.pkh) throw new Error('credentials.pkh required for bid');
      return apiFetch(base, '/collection-bid', {
        method: 'POST',
        body: JSON.stringify({
          privateKeyHex: creds.privateKeyHex,
          bidderPkh: creds.pkh,
          bidderAddress: creds.address,
          tokenCategory,
          price: priceSats.toString(),
          creatorPkh,
          royaltyBasisPoints,
        }),
      });
    },

    /**
     * List an NFT at a fixed price.
     */
    async listNFT(
      nftRef: NexusNFTRef,
      priceSats: bigint | string,
      creatorPkh: string,
      royaltyBasisPoints: number,
      creds: NexusCredentials
    ): Promise<ListResult> {
      return apiFetch(base, '/list', {
        method: 'POST',
        body: JSON.stringify({
          privateKeyHex: creds.privateKeyHex,
          sellerAddress: creds.address,
          listingType: 'fixed',
          tokenCategory: nftRef.tokenCategory,
          nftCommitment: nftRef.commitment || '',
          nftCapability: nftRef.capability || 'none',
          price: priceSats.toString(),
          creatorPkh,
          royaltyBasisPoints,
        }),
      });
    },

    /**
     * Deploy a liquidity pool (AMM) for a collection.
     */
    async deployPool(
      tokenCategory: string,
      pricePerNFT: bigint | string,
      depositSats: bigint | string,
      creatorPkh: string,
      royaltyBasisPoints: number,
      creds: NexusCredentials
    ): Promise<PoolResult> {
      if (!creds.pkh) throw new Error('credentials.pkh required for pool deployment');
      return apiFetch(base, '/pool', {
        method: 'POST',
        body: JSON.stringify({
          privateKeyHex: creds.privateKeyHex,
          operatorPkh: creds.pkh,
          operatorAddress: creds.address,
          creatorAddress: creds.address,
          creatorPkh,
          tokenCategory,
          price: pricePerNFT.toString(),
          depositSats: depositSats.toString(),
          royaltyBasisPoints,
        }),
      });
    },

    /**
     * Get floor price and liquidity data for a collection.
     */
    async getFloor(tokenCategory: string): Promise<FloorData> {
      const [marketRes, poolRes] = await Promise.all([
        apiFetch(base, `/marketplace`, {}),
        apiFetch(base, `/pool?category=${tokenCategory}`, {}),
      ]);

      const listings = (marketRes?.listings || []).filter(
        (l: any) => l.tokenCategory === tokenCategory && l.status === 'active'
      );
      const bids = (marketRes?.bids || []).filter(
        (b: any) => b.tokenCategory === tokenCategory && b.status === 'active'
      );
      const pools: PoolData[] = (poolRes?.pools || []).filter(
        (p: PoolData) => p.status === 'active'
      );

      const sortedListings = listings.sort((a: any, b: any) => Number(BigInt(a.price) - BigInt(b.price)));
      const sortedBids = bids.sort((a: any, b: any) => Number(BigInt(b.price) - BigInt(a.price)));
      const sortedPools = pools.sort((a, b) => Number(BigInt(b.price) - BigInt(a.price)));

      return {
        tokenCategory,
        floorPrice: sortedListings[0]?.price || '0',
        listingCount: listings.length,
        bestBid: sortedBids[0]?.price || '0',
        bidCount: bids.length,
        poolCount: pools.length,
        bestPoolPrice: sortedPools[0]?.price || '0',
      };
    },

    /**
     * Get active collection bids for a token category, sorted by price (highest first).
     */
    async getBids(tokenCategory: string): Promise<BidData[]> {
      const { bids } = await apiFetch(base, `/marketplace`, {});
      return (bids || [])
        .filter((b: BidData) => b.tokenCategory === tokenCategory && b.status === 'active')
        .sort((a: BidData, b: BidData) => Number(BigInt(b.price) - BigInt(a.price)));
    },

    /**
     * Get active liquidity pools for a token category, sorted by price (highest first).
     */
    async getPools(tokenCategory: string): Promise<PoolData[]> {
      const { pools } = await apiFetch(base, `/pool?category=${tokenCategory}`, {});
      return (pools || [])
        .filter((p: PoolData) => p.status === 'active')
        .sort((a: PoolData, b: PoolData) => Number(BigInt(b.price) - BigInt(a.price)));
    },
  };
}

/** Default Bazaar SDK instance (uses /api base) */
export const Bazaar = createBazaarSDK();
