import { NextRequest, NextResponse } from 'next/server';
import { mintNFT } from '@/lib/bch/contracts';

// POST /api/mint
// Mints a new CashTokens NFT using the server-side Electrum connection.
// The private key is passed from the client (testnet/localhost only — no real funds).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { privateKeyHex, pkh, address, tokenAddress, commitment } = body;

    if (!privateKeyHex || !pkh || !address || !commitment) {
      return NextResponse.json({ error: 'Missing required fields: privateKeyHex, pkh, address, commitment' }, { status: 400 });
    }

    const privateKey = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));

    const result = await mintNFT(privateKey, pkh, address, tokenAddress || address, commitment);

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[/api/mint] Error:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
