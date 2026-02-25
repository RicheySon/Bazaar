import { NextRequest, NextResponse } from 'next/server';
import { cancelCollectionBid } from '@/lib/bch/contracts';

// POST /api/collection-bid/cancel
// Cancels a collection bid and returns BCH to the bidder.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { privateKeyHex, bidderAddress, bid } = body;

    if (!privateKeyHex || !bidderAddress || !bid) {
      return NextResponse.json(
        { error: 'Missing required fields: privateKeyHex, bidderAddress, bid' },
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
    const result = await cancelCollectionBid(privateKey, bid, bidderAddress);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[/api/collection-bid/cancel] Error:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
