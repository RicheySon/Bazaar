import { ElectrumNetworkProvider } from 'cashscript';
import { getAllListings, updateListing, type ListingRecord } from './marketplace-store';
import { fetchMetadataFromIPFS } from '@/lib/ipfs/pinata';
import { hexToUtf8, isHexString } from '@/lib/utils';

const NETWORK = (process.env.NEXT_PUBLIC_NETWORK as 'chipnet' | 'mainnet') || 'chipnet';

function getProvider() {
  return new ElectrumNetworkProvider(NETWORK);
}

function commitmentToCid(commitment: string): string {
  if (!commitment) return '';
  if (!isHexString(commitment)) return commitment;
  try {
    return hexToUtf8(commitment);
  } catch {
    return commitment;
  }
}

async function enrichMetadata(commitmentHex: string) {
  const cid = commitmentToCid(commitmentHex);
  if (!cid) return null;
  const data = await fetchMetadataFromIPFS(`ipfs://${cid}`);
  if (!data) return null;
  return {
    name: (data.name as string) || 'Untitled',
    description: (data.description as string) || '',
    image: (data.image as string) || '',
    creator: (data.creator as string) || '',
    attributes: (data.attributes as Array<{ trait_type: string; value: string }>) || [],
    createdAt: (data.createdAt as number) || Date.now(),
  };
}

function toSatoshisString(value: string | number | bigint | undefined): string {
  if (value === undefined) return '0';
  if (typeof value === 'string') return value;
  return value.toString();
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export async function getMarketplaceData() {
  const provider = getProvider();
  const registryListings = await getAllListings();

  const listings = [];
  const auctions = [];

  for (const record of registryListings) {
    let activeUtxo = null as any;
    let electrumFailed = false;
    try {
      const utxos = await provider.getUtxos(record.contractAddress);
      activeUtxo = utxos.find(
        (u) =>
          u.token?.category === record.tokenCategory &&
          (u.token?.nft?.commitment || '') === record.commitment
      );
    } catch {
      // If electrum is unavailable, fall back to registry status
      electrumFailed = true;
    }

    const isActive = electrumFailed ? record.status === 'active' : !!activeUtxo;
    const isAuction = record.listingType === 'auction';
    const ended = isAuction && record.endTime ? record.endTime <= nowSeconds() : false;

    if (!isActive && !electrumFailed) {
      if (record.status === 'active' || record.status === 'ended') {
        await updateListing(record.id, { status: 'sold' });
      }
      continue;
    }

    const metadata = await enrichMetadata(record.commitment);

    if (isAuction) {
      const currentBid = activeUtxo ? activeUtxo.satoshis.toString() : record.currentBid || '0';
      const listing = {
        txid: record.id,
        tokenCategory: record.tokenCategory,
        minBid: toSatoshisString(record.minBid),
        minBidIncrement: toSatoshisString(record.minBidIncrement),
        currentBid,
        endTime: record.endTime || 0,
        seller: record.sellerAddress,
        sellerPkh: record.sellerPkh,
        creator: record.creatorAddress,
        creatorPkh: record.creatorPkh,
        commitment: record.commitment,
        royaltyBasisPoints: record.royaltyBasisPoints,
        currentBidder: record.currentBidder || '',
        bidHistory: record.bidHistory || [],
        status: ended ? 'ended' : 'active',
        metadata,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
      if (ended && record.status !== 'ended') {
        await updateListing(record.id, { status: 'ended' });
      }
      auctions.push(listing);
    } else {
      const listing = {
        txid: record.id,
        tokenCategory: record.tokenCategory,
        price: toSatoshisString(record.price),
        seller: record.sellerAddress,
        sellerPkh: record.sellerPkh,
        creator: record.creatorAddress,
        creatorPkh: record.creatorPkh,
        commitment: record.commitment,
        royaltyBasisPoints: record.royaltyBasisPoints,
        status: 'active',
        metadata,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
      listings.push(listing);
    }
  }

  return {
    listings,
    auctions,
    total: listings.length + auctions.length,
  };
}

export async function getListingById(id: string) {
  const data = await getMarketplaceData();
  const listing = data.listings.find((l: any) => l.txid === id);
  if (listing) return listing;
  const auction = data.auctions.find((a: any) => a.txid === id);
  return auction || null;
}
