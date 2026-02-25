import { NextRequest, NextResponse } from 'next/server';
import { acceptCollectionBid } from '@/lib/bch/contracts';
import { getMarketplaceData } from '@/lib/server/marketplace-indexer';
import type { CollectionBid } from '@/lib/types';

// POST /api/instant-sell
// Accepts the best active collection bid for the provided NFT UTXO.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { privateKeyHex, sellerAddress, nftUtxo } = body;

    if (!privateKeyHex || !sellerAddress || !nftUtxo) {
      return NextResponse.json(
        { error: 'Missing required fields: privateKeyHex, sellerAddress, nftUtxo' },
        { status: 400 }
      );
    }

    const tokenCategory = nftUtxo.tokenCategory as string;
    if (!tokenCategory) {
      return NextResponse.json({ error: 'nftUtxo.tokenCategory required' }, { status: 400 });
    }

    const marketplace = await getMarketplaceData();
    const bids = (marketplace.bids || [])
      .filter((b: any) => b.status === 'active' && b.tokenCategory === tokenCategory && !!b.bidSalt)
      .sort((a: any, b: any) => BigInt(b.price) > BigInt(a.price) ? 1 : BigInt(b.price) < BigInt(a.price) ? -1 : 0);

    const best = bids[0];
    if (!best) {
      return NextResponse.json({ error: 'No active bids for this collection' }, { status: 404 });
    }

    const bid: CollectionBid = {
      txid: best.txid,
      tokenCategory: best.tokenCategory,
      bidSalt: best.bidSalt,
      price: best.price,
      bidder: best.bidder,
      bidderPkh: best.bidderPkh,
      creator: best.creator,
      creatorPkh: best.creatorPkh,
      royaltyBasisPoints: best.royaltyBasisPoints,
      status: best.status,
      contractAddress: best.contractAddress,
      createdAt: best.createdAt,
      updatedAt: best.updatedAt,
    };

    const privateKey = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));
    const result = await acceptCollectionBid(privateKey, bid, sellerAddress, {
      txid: nftUtxo.txid,
      vout: nftUtxo.vout,
      satoshis: BigInt(nftUtxo.satoshis),
      commitment: nftUtxo.commitment || '',
      capability: nftUtxo.capability || 'none',
    });

    return NextResponse.json({ ...result, bid });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[/api/instant-sell] Error:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
