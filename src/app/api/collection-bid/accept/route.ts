import { NextRequest, NextResponse } from 'next/server';
import { acceptCollectionBid } from '@/lib/bch/contracts';

// POST /api/collection-bid/accept
// Accepts a collection bid by providing an NFT from the target category.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { privateKeyHex, sellerAddress, bid, nftUtxo } = body;

    if (!privateKeyHex || !sellerAddress || !bid || !nftUtxo) {
      return NextResponse.json(
        { error: 'Missing required fields: privateKeyHex, sellerAddress, bid, nftUtxo' },
        { status: 400 }
      );
    }
    if (!bid.bidSalt) {
      return NextResponse.json(
        { error: 'Bid salt missing; refresh the order book and try again.' },
        { status: 400 }
      );
    }

    const privateKey = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));
    const result = await acceptCollectionBid(
      privateKey,
      bid,
      sellerAddress,
      {
        txid: nftUtxo.txid,
        vout: nftUtxo.vout,
        satoshis: BigInt(nftUtxo.satoshis),
        commitment: nftUtxo.commitment || '',
        capability: nftUtxo.capability || 'none',
      }
    );

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[/api/collection-bid/accept] Error:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
