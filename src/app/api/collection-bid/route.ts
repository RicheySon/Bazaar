import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createCollectionBid } from '@/lib/bch/contracts';

// POST /api/collection-bid
// Creates a collection bid by locking BCH in a CollectionBid covenant.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      privateKeyHex,
      bidderPkh,
      bidderAddress,
      tokenCategory,
      price,
      creatorPkh,
      royaltyBasisPoints,
      bidSalt,
    } = body;

    if (!privateKeyHex || !bidderPkh || !bidderAddress || !tokenCategory || !price || !creatorPkh) {
      return NextResponse.json(
        { error: 'Missing required fields: privateKeyHex, bidderPkh, bidderAddress, tokenCategory, price, creatorPkh' },
        { status: 400 }
      );
    }

    const privateKey = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));
    const saltHex = (typeof bidSalt === 'string' && bidSalt.length === 64)
      ? bidSalt
      : randomBytes(32).toString('hex');

    const result = await createCollectionBid(
      privateKey,
      tokenCategory,
      saltHex,
      BigInt(price),
      creatorPkh,
      BigInt(royaltyBasisPoints || 0),
      bidderPkh,
      bidderAddress
    );

    return NextResponse.json({ ...result, bidSalt: saltHex });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[/api/collection-bid] Error:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
