import { promises as fs } from 'fs';
import path from 'path';

export type ListingStatus = 'active' | 'ended' | 'sold' | 'cancelled';

export interface BidRecord {
  bidder: string;
  amount: string; // satoshis
  txid: string;
  timestamp: number;
}

export interface ListingRecord {
  id: string; // listing txid
  listingType: 'fixed' | 'auction';
  contractAddress: string;
  tokenCategory: string;
  commitment: string; // hex string commitment
  sellerAddress: string;
  sellerPkh: string;
  creatorAddress: string;
  creatorPkh: string;
  royaltyBasisPoints: number;
  price?: string; // satoshis
  minBid?: string; // satoshis
  minBidIncrement?: string; // satoshis
  endTime?: number; // unix seconds
  currentBid?: string; // satoshis
  currentBidder?: string;
  bidHistory?: BidRecord[];
  status: ListingStatus;
  createdAt: number;
  updatedAt: number;
}

interface RegistryFile {
  listings: ListingRecord[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const REGISTRY_PATH = path.join(DATA_DIR, 'marketplace.json');

async function ensureRegistryFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(REGISTRY_PATH);
  } catch {
    const empty: RegistryFile = { listings: [] };
    await fs.writeFile(REGISTRY_PATH, JSON.stringify(empty, null, 2), 'utf-8');
  }
}

export async function readRegistry(): Promise<RegistryFile> {
  await ensureRegistryFile();
  const raw = await fs.readFile(REGISTRY_PATH, 'utf-8');
  try {
    const parsed = JSON.parse(raw) as RegistryFile;
    return { listings: parsed.listings || [] };
  } catch {
    return { listings: [] };
  }
}

async function writeRegistry(registry: RegistryFile): Promise<void> {
  await ensureRegistryFile();
  const tmpPath = `${REGISTRY_PATH}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(registry, null, 2), 'utf-8');
  await fs.rename(tmpPath, REGISTRY_PATH);
}

export async function upsertListing(listing: ListingRecord): Promise<void> {
  const registry = await readRegistry();
  const idx = registry.listings.findIndex((l) => l.id === listing.id);
  if (idx >= 0) {
    registry.listings[idx] = listing;
  } else {
    registry.listings.push(listing);
  }
  await writeRegistry(registry);
}

export async function updateListing(
  id: string,
  updates: Partial<ListingRecord>
): Promise<ListingRecord | null> {
  const registry = await readRegistry();
  const idx = registry.listings.findIndex((l) => l.id === id);
  if (idx < 0) return null;
  const updated: ListingRecord = {
    ...registry.listings[idx],
    ...updates,
    updatedAt: Date.now(),
  };
  registry.listings[idx] = updated;
  await writeRegistry(registry);
  return updated;
}

export async function addBid(
  id: string,
  bid: BidRecord,
  currentBid: string,
  currentBidder: string
): Promise<ListingRecord | null> {
  const registry = await readRegistry();
  const idx = registry.listings.findIndex((l) => l.id === id);
  if (idx < 0) return null;
  const listing = registry.listings[idx];
  const bidHistory = listing.bidHistory ? [...listing.bidHistory, bid] : [bid];
  const updated: ListingRecord = {
    ...listing,
    bidHistory,
    currentBid,
    currentBidder,
    updatedAt: Date.now(),
  };
  registry.listings[idx] = updated;
  await writeRegistry(registry);
  return updated;
}

export async function getListing(id: string): Promise<ListingRecord | null> {
  const registry = await readRegistry();
  return registry.listings.find((l) => l.id === id) || null;
}

export async function getAllListings(): Promise<ListingRecord[]> {
  const registry = await readRegistry();
  return registry.listings;
}
