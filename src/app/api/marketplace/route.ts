import { NextRequest, NextResponse } from 'next/server';
import { ElectrumNetworkProvider } from 'cashscript';

const NETWORK = (process.env.NEXT_PUBLIC_NETWORK as 'chipnet' | 'mainnet') || 'chipnet';

function getProvider(): ElectrumNetworkProvider {
  return new ElectrumNetworkProvider(NETWORK);
}

// GET /api/marketplace - Fetch all active listings
export async function GET(request: NextRequest) {
  try {
    // In full implementation:
    // 1. Maintain a list of known marketplace contract addresses
    // 2. Query each for UTXOs with CashTokens
    // 3. Parse the contract params from the locking bytecode
    // 4. Return structured listing data

    // For the hackathon, we return an empty array
    // Real listings would appear once contracts are deployed and NFTs listed
    return NextResponse.json({
      listings: [],
      auctions: [],
      total: 0,
      message: 'Connect wallet and create NFTs to see listings here',
    });
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
    const { sellerAddress, tokenCategory, price, royaltyBasisPoints, listingType } = body;

    if (!sellerAddress || !tokenCategory || !price) {
      return NextResponse.json(
        { error: 'Missing required fields: sellerAddress, tokenCategory, price' },
        { status: 400 }
      );
    }

    const electrum = getProvider();

    // Verify the seller owns the NFT
    const utxos = await electrum.getUtxos(sellerAddress);
    const nftUtxo = utxos.find(
      (u) => u.token?.category === tokenCategory && u.token?.nft
    );

    if (!nftUtxo) {
      return NextResponse.json(
        { error: 'NFT not found in seller wallet' },
        { status: 400 }
      );
    }

    // For the hackathon: return the listing data
    // Full implementation would build and broadcast the listing transaction
    return NextResponse.json({
      success: true,
      listing: {
        type: listingType || 'fixed',
        tokenCategory,
        price: price.toString(),
        royaltyBasisPoints: royaltyBasisPoints || 1000,
        seller: sellerAddress,
        nftUtxo: {
          txid: nftUtxo.txid,
          vout: nftUtxo.vout,
          commitment: nftUtxo.token?.nft?.commitment || '',
        },
      },
    });
  } catch (error) {
    console.error('Create listing error:', error);
    return NextResponse.json(
      { error: 'Failed to create listing' },
      { status: 500 }
    );
  }
}
