import { NextRequest, NextResponse } from 'next/server';
import { buyoutVault } from '@/lib/bch/fractional-contracts';

// POST /api/fractionalize/buyout
// Pay ≥ reserveSats → receive original NFT; proceeds go to claims covenant.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      privateKeyHex,
      buyerAddress,
      sharesCategory,
      reserveSats,
      nftCategory,
      nftCommitment,
      nftCapability,
    } = body;

    if (!privateKeyHex || !buyerAddress || !sharesCategory || !reserveSats || !nftCategory) {
      return NextResponse.json(
        { error: 'Missing required fields: privateKeyHex, buyerAddress, sharesCategory, reserveSats, nftCategory' },
        { status: 400 },
      );
    }

    const privateKey = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));

    const result = await buyoutVault(
      privateKey,
      buyerAddress,
      sharesCategory,
      BigInt(reserveSats),
      nftCategory,
      nftCommitment || '',
      nftCapability || 'none',
    );

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[/api/fractionalize/buyout] Error:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
