import { NextRequest, NextResponse } from 'next/server';
import { fractionalizeNFT } from '@/lib/bch/fractional-contracts';

// POST /api/fractionalize
// Fractionalize an NFT into 1,000,000 FT shares locked in a vault covenant.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      privateKeyHex,
      ownerPkh,
      ownerAddress,
      ownerTokenAddress,
      nftUtxo,
      reserveSats,
    } = body;

    if (!privateKeyHex || !ownerPkh || !ownerAddress || !nftUtxo || !reserveSats) {
      return NextResponse.json(
        { error: 'Missing required fields: privateKeyHex, ownerPkh, ownerAddress, nftUtxo, reserveSats' },
        { status: 400 },
      );
    }

    const privateKey = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));

    const result = await fractionalizeNFT(
      privateKey,
      ownerPkh,
      ownerAddress,
      ownerTokenAddress || ownerAddress,
      nftUtxo,
      BigInt(reserveSats),
    );

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[/api/fractionalize] Error:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
