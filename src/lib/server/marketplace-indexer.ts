import { ElectrumNetworkProvider, Contract, Artifact } from 'cashscript';
import {
  cashAddressToLockingBytecode,
  decodeTransaction,
  hexToBin,
  binToHex,
  addressContentsToLockingBytecode,
  lockingBytecodeToCashAddress,
  LockingBytecodeType,
} from '@bitauth/libauth';
import { sha256 } from '@noble/hashes/sha256';
import { bytecodeToScript, Op } from '@cashscript/utils';
import marketplaceArtifact from '@/lib/bch/artifacts/marketplace.json';
import auctionArtifact from '@/lib/bch/artifacts/auction.json';
import { parseListingEventPayload, parseBidEventPayload, parseStatusEventPayload } from '@/lib/bch/listing-events';
import { fetchMetadataFromIPFS } from '@/lib/ipfs/pinata';
import { getListingIndexAddress } from '@/lib/bch/config';
import { commitmentHexToCid } from '@/lib/utils';
import { getElectrumProvider } from '@/lib/bch/electrum';

const NETWORK = (process.env.NEXT_PUBLIC_NETWORK as 'chipnet' | 'mainnet') || 'chipnet';
const MAX_EVENTS = parseInt(process.env.MARKETPLACE_INDEX_LIMIT || '200');
const ADDRESS_PREFIX =
  (process.env.NEXT_PUBLIC_ADDRESS_PREFIX as 'bchtest' | 'bitcoincash' | 'bchreg' | undefined) ||
  (NETWORK === 'mainnet' ? 'bitcoincash' : 'bchtest');
const MARKETPLACE_CACHE_MS = Math.max(0, parseInt(process.env.MARKETPLACE_INDEX_CACHE_MS || '30000'));

type MarketplaceData = {
  listings: any[];
  auctions: any[];
  total: number;
};

let marketplaceCache: { data: MarketplaceData; fetchedAt: number } | null = null;
let marketplaceInFlight: Promise<MarketplaceData> | null = null;


function commitmentToCid(commitment: string): string {
  return commitmentHexToCid(commitment);
}

// In-memory IPFS metadata cache: avoids re-fetching Pinata on every index refresh.
// TTL of 10 minutes — long enough to survive multiple cache cycles without going stale.
const METADATA_CACHE_TTL_MS = 10 * 60 * 1000;
const metadataCache = new Map<string, { data: ReturnType<typeof parseMetadata>; fetchedAt: number }>();

function parseMetadata(data: Record<string, unknown>) {
  return {
    name: (data.name as string) || 'Untitled',
    description: (data.description as string) || '',
    image: (data.image as string) || '',
    creator: (data.creator as string) || '',
    attributes: (data.attributes as Array<{ trait_type: string; value: string }>) || [],
    createdAt: (data.createdAt as number) || Date.now(),
    collection: (data.collection as string) || '',
    collectionImage: (data.collectionImage as string) || '',
  };
}

async function enrichMetadata(commitmentHex: string) {
  const cid = commitmentToCid(commitmentHex);
  if (!cid) return null;

  const cached = metadataCache.get(cid);
  if (cached && Date.now() - cached.fetchedAt < METADATA_CACHE_TTL_MS) {
    return cached.data;
  }

  const data = await fetchMetadataFromIPFS(`ipfs://${cid}`);
  if (!data) return null;
  const parsed = parseMetadata(data);
  metadataCache.set(cid, { data: parsed, fetchedAt: Date.now() });
  return parsed;
}

function makeSlug(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'unnamed';
}

function toSatoshisString(value: string | number | bigint | undefined): string {
  if (value === undefined) return '0';
  if (typeof value === 'string') return value;
  return value.toString();
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function parseBlockTimestamp(headerHex: string): number | null {
  if (!headerHex || headerHex.length < 160) return null;
  const bytes = hexToBin(headerHex);
  if (bytes.length < 80) return null;
  // Block header: version(4) prev(32) merkle(32) time(4) bits(4) nonce(4)
  const offset = 68;
  const time =
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24);
  return time >>> 0;
}

const blockTimeCache = new Map<number, number>();

async function getBlockTimeMs(
  provider: ElectrumNetworkProvider,
  height: number
): Promise<number> {
  if (!height || height <= 0) return Date.now();
  const cached = blockTimeCache.get(height);
  if (cached) return cached;
  try {
    const headerHex = await provider.performRequest('blockchain.block.header', height);
    if (typeof headerHex === 'string') {
      const time = parseBlockTimestamp(headerHex);
      if (time) {
        const ms = time * 1000;
        blockTimeCache.set(height, ms);
        return ms;
      }
    }
  } catch {
    // ignore
  }
  const fallback = Date.now();
  blockTimeCache.set(height, fallback);
  return fallback;
}

function scriptHashFromLockingBytecode(bytecode: Uint8Array): string {
  const hash = sha256(bytecode);
  const reversed = Uint8Array.from([...hash].reverse());
  return binToHex(reversed);
}

function pkhToCashAddress(pkhHex: string): string {
  const payload = hexToBin(pkhHex);
  const lockingBytecode = addressContentsToLockingBytecode({
    payload,
    type: LockingBytecodeType.p2pkh,
  });
  const result = lockingBytecodeToCashAddress({
    bytecode: lockingBytecode,
    prefix: ADDRESS_PREFIX,
    tokenSupport: false,
  });
  if (typeof result === 'string') return '';
  return result.address;
}

async function fetchIndexEventHistory(provider: ElectrumNetworkProvider): Promise<Array<{ txid: string; height: number }>> {
  const indexAddress = getListingIndexAddress();
  if (!indexAddress) return [];

  const decoded = cashAddressToLockingBytecode(indexAddress);
  if (typeof decoded === 'string') return [];

  const scriptHash = scriptHashFromLockingBytecode(decoded.bytecode);
  try {
    if (typeof provider.connectCluster === 'function') {
      await provider.connectCluster().catch(() => {});
    }
  } catch {
    // ignore connection errors; request may still succeed
  }

  let history: unknown;
  try {
    history = await provider.performRequest('blockchain.scripthash.get_history', scriptHash);
  } catch (error) {
    console.error('[Marketplace Indexer] Failed to fetch index history:', error);
    return [];
  }
  if (!Array.isArray(history)) return [];

  const entries = history
    .map((entry: any) => ({
      txid: (entry.tx_hash || entry.txid) as string,
      height: typeof entry.height === 'number' ? entry.height : 0,
    }))
    .filter((entry) => entry.txid);

  return entries.slice(-MAX_EVENTS);
}

async function parseIndexEventsFromTx(
  provider: ElectrumNetworkProvider,
  txid: string
): Promise<{
  listing?: { payload: ReturnType<typeof parseListingEventPayload>; commitment: string };
  bid?: ReturnType<typeof parseBidEventPayload>;
  status?: ReturnType<typeof parseStatusEventPayload>;
} | null> {
  const rawTx = await provider.getRawTransaction(txid);
  const decoded = decodeTransaction(hexToBin(rawTx));
  if (typeof decoded === 'string') return null;

  let listingPayload: ReturnType<typeof parseListingEventPayload> | null = null;
  let bidPayload: ReturnType<typeof parseBidEventPayload> | null = null;
  let statusPayload: ReturnType<typeof parseStatusEventPayload> | null = null;
  let commitment = '';

  for (const output of decoded.outputs) {
    const script = bytecodeToScript(output.lockingBytecode);
    if (script.length === 0 || script[0] !== Op.OP_RETURN) continue;
    for (const chunk of script.slice(1)) {
      if (!(chunk instanceof Uint8Array)) continue;
      if (!listingPayload) {
        listingPayload = parseListingEventPayload(chunk);
      }
      if (!bidPayload) {
        bidPayload = parseBidEventPayload(chunk);
      }
      if (!statusPayload) {
        statusPayload = parseStatusEventPayload(chunk);
      }
    }
  }

  if (listingPayload) {
    for (const output of decoded.outputs) {
      if (!output.token?.nft) continue;
      const categoryHex = binToHex(output.token.category);
      if (categoryHex !== listingPayload.tokenCategory) continue;
      commitment = binToHex(output.token.nft.commitment);
      break;
    }
  }

  if (!listingPayload && !bidPayload && !statusPayload) return null;

  return {
    listing: listingPayload ? { payload: listingPayload, commitment } : undefined,
    bid: bidPayload || undefined,
    status: statusPayload || undefined,
  };
}

function buildMarketplaceAddress(
  provider: ElectrumNetworkProvider,
  sellerPkh: string,
  creatorPkh: string,
  price: bigint,
  royaltyBasisPoints: number
): string {
  const sellerPkhBytes = hexToBin(sellerPkh);
  const creatorPkhBytes = hexToBin(creatorPkh);
  const contract = new Contract(
    marketplaceArtifact as Artifact,
    [sellerPkhBytes, price, creatorPkhBytes, BigInt(royaltyBasisPoints)],
    { provider }
  );
  return contract.address;
}

function buildAuctionAddress(
  provider: ElectrumNetworkProvider,
  sellerPkh: string,
  creatorPkh: string,
  minBid: bigint,
  endTime: number,
  royaltyBasisPoints: number,
  minBidIncrement: bigint
): string {
  const sellerPkhBytes = hexToBin(sellerPkh);
  const creatorPkhBytes = hexToBin(creatorPkh);
  const contract = new Contract(
    auctionArtifact as Artifact,
    [
      sellerPkhBytes,
      minBid,
      BigInt(endTime),
      creatorPkhBytes,
      BigInt(royaltyBasisPoints),
      minBidIncrement,
    ],
    { provider }
  );
  return contract.address;
}

export async function getMarketplaceData() {
  const now = Date.now();
  if (MARKETPLACE_CACHE_MS > 0 && marketplaceCache) {
    if (now - marketplaceCache.fetchedAt < MARKETPLACE_CACHE_MS) {
      return marketplaceCache.data;
    }
  }

  if (marketplaceInFlight) {
    return marketplaceInFlight;
  }

  marketplaceInFlight = (async () => {
    try {
      const provider = getElectrumProvider(NETWORK);
      const history = await fetchIndexEventHistory(provider);

      const listings: any[] = [];
      const auctions: any[] = [];

      const listingEvents = new Map<
        string,
        { payload: NonNullable<ReturnType<typeof parseListingEventPayload>>; commitment: string; height: number }
      >();
      const bidEvents = new Map<
        string,
        Array<{ bidderPkh: string; bidAmount: bigint; txid: string; height: number }>
      >();
      const statusEvents = new Map<
        string,
        { status: 'sold' | 'cancelled' | 'claimed'; actorPkh: string; txid: string; height: number }
      >();

      for (const entry of history) {
        let event = null as {
          listing?: { payload: ReturnType<typeof parseListingEventPayload>; commitment: string };
          bid?: ReturnType<typeof parseBidEventPayload>;
          status?: ReturnType<typeof parseStatusEventPayload>;
        } | null;
        try {
          event = await parseIndexEventsFromTx(provider, entry.txid);
        } catch {
          event = null;
        }

        if (!event) continue;

        if (event.listing?.payload) {
          listingEvents.set(entry.txid, {
            payload: event.listing.payload,
            commitment: event.listing.commitment,
            height: entry.height,
          });
        }

        if (event.bid) {
          const existing = bidEvents.get(event.bid.listingTxid) || [];
          existing.push({
            bidderPkh: event.bid.bidderPkh,
            bidAmount: event.bid.bidAmount,
            txid: entry.txid,
            height: entry.height,
          });
          bidEvents.set(event.bid.listingTxid, existing);
        }

        if (event.status) {
          statusEvents.set(event.status.listingTxid, {
            status: event.status.status,
            actorPkh: event.status.actorPkh,
            txid: entry.txid,
            height: entry.height,
          });
        }
      }

      const orderedListings = Array.from(listingEvents.entries()).sort((a, b) => a[1].height - b[1].height);

      // Process all listings in parallel — avoids sequential Electrum + IPFS round-trips.
      const results = await Promise.all(
        orderedListings.map(async ([txid, entry]) => {
          try {
            const payload = entry.payload;
            const createdAtMs = await getBlockTimeMs(provider, entry.height);

            const isAuction = payload.listingType === 'auction';
            const contractAddress = isAuction
              ? buildAuctionAddress(
                  provider,
                  payload.sellerPkh,
                  payload.creatorPkh,
                  payload.minBid,
                  payload.endTime,
                  payload.royaltyBasisPoints,
                  payload.minBidIncrement
                )
              : buildMarketplaceAddress(
                  provider,
                  payload.sellerPkh,
                  payload.creatorPkh,
                  payload.price,
                  payload.royaltyBasisPoints
                );

            let activeUtxo = null as any;
            try {
              const utxos = await provider.getUtxos(contractAddress);
              activeUtxo = utxos.find((u) => u.token?.category === payload.tokenCategory);
            } catch {
              activeUtxo = null;
            }

            const isActive = !!activeUtxo;
            const commitment = activeUtxo?.token?.nft?.commitment || entry.commitment || '';
            const metadata = await enrichMetadata(commitment);
            const statusEvent = statusEvents.get(txid);
            const statusAtMs = statusEvent
              ? await getBlockTimeMs(provider, statusEvent.height)
              : createdAtMs;
            const bidderEvents = (bidEvents.get(txid) || []).slice().sort((a, b) => a.height - b.height);
            const lastBidAtMs =
              bidderEvents.length > 0
                ? await getBlockTimeMs(provider, bidderEvents[bidderEvents.length - 1].height)
                : createdAtMs;

            if (isAuction) {
              const lastBid = bidderEvents.length ? bidderEvents[bidderEvents.length - 1].bidAmount : 0n;
              const currentBidRaw = activeUtxo ? activeUtxo.satoshis : lastBid;
              const currentBid = currentBidRaw >= payload.minBid ? currentBidRaw.toString() : '0';
              const ended = payload.endTime ? payload.endTime <= nowSeconds() : false;
              const lastBidder = bidderEvents.length ? bidderEvents[bidderEvents.length - 1].bidderPkh : '';
              const currentBidder = currentBid !== '0' && lastBidder ? pkhToCashAddress(lastBidder) : '';
              const bidHistory = await Promise.all(
                bidderEvents.map(async (bid) => ({
                  bidder: pkhToCashAddress(bid.bidderPkh),
                  amount: bid.bidAmount.toString(),
                  txid: bid.txid,
                  timestamp: await getBlockTimeMs(provider, bid.height),
                }))
              );
              let status: string = isActive ? (ended ? 'ended' : 'active') : 'sold';
              if (statusEvent) status = statusEvent.status === 'cancelled' ? 'cancelled' : 'sold';
              return { type: 'auction' as const, item: {
                txid, tokenCategory: payload.tokenCategory,
                minBid: toSatoshisString(payload.minBid),
                minBidIncrement: toSatoshisString(payload.minBidIncrement),
                currentBid, endTime: payload.endTime,
                seller: pkhToCashAddress(payload.sellerPkh), sellerPkh: payload.sellerPkh,
                creator: pkhToCashAddress(payload.creatorPkh), creatorPkh: payload.creatorPkh,
                commitment, royaltyBasisPoints: payload.royaltyBasisPoints,
                currentBidder, bidHistory, status, metadata,
                createdAt: createdAtMs, updatedAt: statusEvent ? statusAtMs : lastBidAtMs,
              }};
            } else {
              let status: string = isActive ? 'active' : 'sold';
              if (statusEvent) status = statusEvent.status === 'cancelled' ? 'cancelled' : 'sold';
              return { type: 'listing' as const, item: {
                txid, tokenCategory: payload.tokenCategory,
                price: toSatoshisString(payload.price),
                seller: pkhToCashAddress(payload.sellerPkh), sellerPkh: payload.sellerPkh,
                creator: pkhToCashAddress(payload.creatorPkh), creatorPkh: payload.creatorPkh,
                commitment, royaltyBasisPoints: payload.royaltyBasisPoints,
                status, metadata, createdAt: createdAtMs, updatedAt: statusAtMs,
              }};
            }
          } catch {
            return null;
          }
        })
      );

      for (const result of results) {
        if (!result) continue;
        if (result.type === 'auction') auctions.push(result.item);
        else listings.push(result.item);
      }

      return {
        listings,
        auctions,
        total: listings.length + auctions.length,
      };
    } catch (error) {
      console.error('[Marketplace Indexer] Failed to build marketplace data:', error);
      if (marketplaceCache) {
        return marketplaceCache.data;
      }
      return { listings: [], auctions: [], total: 0 };
    }
  })();

  try {
    const data = await marketplaceInFlight;
    if (MARKETPLACE_CACHE_MS > 0) {
      marketplaceCache = { data, fetchedAt: Date.now() };
    }
    return data;
  } finally {
    marketplaceInFlight = null;
  }
}

export async function getListingById(id: string) {
  const data = await getMarketplaceData();
  const item = data.listings.find((l: any) => l.txid === id)
    || data.auctions.find((a: any) => a.txid === id)
    || null;
  if (!item) return null;

  // Compute floor price: min active price across all listings with the same tokenCategory
  const category = item.tokenCategory;
  if (category) {
    const allActive: any[] = [...data.listings, ...data.auctions].filter(
      (x: any) => x.tokenCategory === category && x.status === 'active'
    );
    if (allActive.length > 0) {
      const floor = allActive.reduce((min: bigint, x: any) => {
        const p = BigInt(x.currentBid && x.currentBid !== '0' ? x.currentBid : (x.price || '0'));
        return p < min ? p : min;
      }, BigInt(allActive[0].currentBid && allActive[0].currentBid !== '0'
        ? allActive[0].currentBid : (allActive[0].price || '0')));
      return { ...item, collectionFloor: floor.toString() };
    }
  }
  return item;
}

export async function getCollectionsData() {
  const data = await getMarketplaceData();
  const allItems: any[] = [...data.listings, ...data.auctions];

  type CollEntry = {
    name: string;
    slug: string;
    image: string;
    creatorAddress: string;
    creatorPkh: string;
    sharedCategory: string | undefined; // set when all items share same tokenCategory
    floorPrice: bigint;
    totalVolume: bigint;
    listedCount: number;
    supply: number;
    owners: Set<string>;
    royaltyBasisPoints: number;
    items: any[];
    createdAt: number;
  };

  const collectionsMap = new Map<string, CollEntry>();

  for (const item of allItems) {
    // Determine collection identity:
    // 1. metadata.collection field (explicit collection name)
    // 2. tokenCategory (if multiple items already share it — minting model)
    const collName =
      item.metadata?.collection?.trim() ||
      item.metadata?.name ||
      `Token #${item.tokenCategory?.slice(0, 8)}`;
    const slug = makeSlug(collName);

    const itemPrice = BigInt(item.price ?? item.minBid ?? item.currentBid ?? 0);

    if (!collectionsMap.has(slug)) {
      collectionsMap.set(slug, {
        name: collName,
        slug,
        image: item.metadata?.collectionImage || item.metadata?.image || '',
        creatorAddress: item.creator || item.seller || '',
        creatorPkh: item.creatorPkh || '',
        sharedCategory: item.tokenCategory,
        floorPrice: item.status === 'active' ? itemPrice : BigInt(Number.MAX_SAFE_INTEGER),
        totalVolume: item.status === 'sold' ? itemPrice : 0n,
        listedCount: item.status === 'active' ? 1 : 0,
        supply: 1,
        owners: new Set([item.seller || '']),
        royaltyBasisPoints: item.royaltyBasisPoints ?? 0,
        items: [item],
        createdAt: item.createdAt ?? Date.now(),
      });
    } else {
      const col = collectionsMap.get(slug)!;
      col.supply++;
      col.items.push(item);
      col.owners.add(item.seller || '');
      if (item.status === 'active') {
        col.listedCount++;
        if (itemPrice < col.floorPrice) col.floorPrice = itemPrice;
      }
      if (item.status === 'sold') {
        col.totalVolume += itemPrice;
      }
      // Track shared tokenCategory for minting-model collections
      if (col.sharedCategory !== item.tokenCategory) col.sharedCategory = undefined;
      // Use collectionImage if available
      if (!col.image && item.metadata?.image) col.image = item.metadata.image;
    }
  }

  return Array.from(collectionsMap.values())
    .sort((a, b) => Number(b.totalVolume - a.totalVolume) || b.listedCount - a.listedCount)
    .map((col) => ({
      slug: col.slug,
      name: col.name,
      image: col.image || '',
      creatorAddress: col.creatorAddress,
      creatorPkh: col.creatorPkh,
      tokenCategory: col.sharedCategory,
      floorPrice: col.floorPrice === BigInt(Number.MAX_SAFE_INTEGER) ? '0' : col.floorPrice.toString(),
      totalVolume: col.totalVolume.toString(),
      listedCount: col.listedCount,
      totalSupply: col.supply,
      ownerCount: col.owners.size,
      royaltyBasisPoints: col.royaltyBasisPoints,
      items: col.items,
      createdAt: col.createdAt,
    }));
}

export async function getCollectionBySlug(slug: string) {
  const collections = await getCollectionsData();
  return collections.find((c) => c.slug === slug) || null;
}
