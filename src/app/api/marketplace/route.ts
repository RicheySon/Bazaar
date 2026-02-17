import { NextRequest, NextResponse } from 'next/server';
import { ElectrumNetworkProvider } from 'cashscript';
import { decodeCashAddress } from '@bitauth/libauth';
import { getMarketplaceData } from '@/lib/server/marketplace-indexer';
import { upsertListing } from '@/lib/server/marketplace-store';

const NETWORK = (process.env.NEXT_PUBLIC_NETWORK as 'chipnet' | 'mainnet') || 'chipnet';

function getProvider(): ElectrumNetworkProvider {
  return new ElectrumNetworkProvider(NETWORK);
}

// GET /api/marketplace - Fetch all active listings
export async function GET(request: NextRequest) {
  try {
    const data = await getMarketplaceData();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Marketplace API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch marketplace listings' },
      { status: 500 }
    );
  }
}

// POST /api/marketplace - Create a new listing
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      txid,
      contractAddress,
      sellerAddress,
      creatorAddress,
      tokenCategory,
      commitment,
      price,
      minBid,
      endTime,
      minBidIncrement,
      royaltyBasisPoints,
      listingType,
    } = body;

    if (!txid || !contractAddress || !sellerAddress || !tokenCategory || !commitment || !listingType) {
      return NextResponse.json(
        { error: 'Missing required fields: txid, contractAddress, sellerAddress, tokenCategory, commitment, listingType' },
        { status: 400 }
      );
    }

    if (listingType === 'fixed' && !price) {
      return NextResponse.json({ error: 'Missing price for fixed listing' }, { status: 400 });
    }
    if (listingType === 'auction' && (!minBid || !endTime)) {
      return NextResponse.json({ error: 'Missing minBid or endTime for auction' }, { status: 400 });
    }

    const electrum = getProvider();

    const contractUtxos = await electrum.getUtxos(contractAddress);
    const contractHasNft = contractUtxos.find(
      (u) => u.token?.category === tokenCategory && (u.token?.nft?.commitment || '') === commitment
    );

    if (!contractHasNft) {
      return NextResponse.json(
        { error: 'Contract does not hold the listed NFT' },
        { status: 400 }
      );
    }

    const decodedSeller = decodeCashAddress(sellerAddress);
    if (typeof decodedSeller === 'string') {
      return NextResponse.json({ error: 'Invalid seller address' }, { status: 400 });
    }
    const decodedCreator = decodeCashAddress(creatorAddress || sellerAddress);
    if (typeof decodedCreator === 'string') {
      return NextResponse.json({ error: 'Invalid creator address' }, { status: 400 });
    }

    const now = Date.now();

    await upsertListing({
      id: txid,
      listingType,
      contractAddress,
      tokenCategory,
      commitment,
      sellerAddress,
      sellerPkh: Buffer.from(decodedSeller.payload).toString('hex'),
      creatorAddress: creatorAddress || sellerAddress,
      creatorPkh: Buffer.from(decodedCreator.payload).toString('hex'),
      royaltyBasisPoints: royaltyBasisPoints || 1000,
      price: price ? price.toString() : undefined,
      minBid: minBid ? minBid.toString() : undefined,
      minBidIncrement: minBidIncrement ? minBidIncrement.toString() : undefined,
      endTime: endTime || undefined,
      currentBid: '0',
      currentBidder: '',
      bidHistory: [],
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Create listing error:', error);
    return NextResponse.json(
      { error: 'Failed to create listing' },
      { status: 500 }
    );
  }
}
