import { NextRequest, NextResponse } from 'next/server';
import { mintFromCollection } from '@/lib/bch/contracts';
import type { MintingTokenUtxo } from '@/lib/bch/contracts';

// POST /api/mint-from-collection
// Mints a new child NFT using an existing minting-capability token.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { privateKeyHex, pkh, address, tokenAddress, mintingToken, newCommitment, newCapability } = body;

    if (!privateKeyHex || !pkh || !address || !mintingToken || !newCommitment) {
      return NextResponse.json(
        { error: 'Missing required fields: privateKeyHex, pkh, address, mintingToken, newCommitment' },
        { status: 400 }
      );
    }

    const privateKey = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));
    const capability: 'none' | 'mutable' = newCapability === 'mutable' ? 'mutable' : 'none';

    const token: MintingTokenUtxo = {
      txid: mintingToken.txid,
      vout: Number(mintingToken.vout),
      satoshis: BigInt(mintingToken.satoshis),
      category: mintingToken.category,
      commitment: mintingToken.commitment,
    };

    const result = await mintFromCollection(
      privateKey, pkh, address, tokenAddress || address, token, newCommitment, capability
    );

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[/api/mint-from-collection] Error:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
