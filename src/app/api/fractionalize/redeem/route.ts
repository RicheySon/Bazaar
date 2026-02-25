import { NextRequest, NextResponse } from 'next/server';
import { redeemAllShares } from '@/lib/bch/fractional-contracts';
import { getVaultByCategory } from '@/lib/server/vaults-store';

// POST /api/fractionalize/redeem
// Burn 100% of share tokens to reclaim the original NFT from the vault.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { privateKeyHex, ownerAddress, sharesCategory } = body;

    if (!privateKeyHex || !ownerAddress || !sharesCategory) {
      return NextResponse.json(
        { error: 'Missing required fields: privateKeyHex, ownerAddress, sharesCategory' },
        { status: 400 },
      );
    }

    const vault = getVaultByCategory(sharesCategory);
    if (!vault) {
      return NextResponse.json({ error: 'Vault not found in registry' }, { status: 404 });
    }

    const privateKey = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));

    const result = await redeemAllShares(
      privateKey,
      ownerAddress,
      sharesCategory,
      BigInt(vault.reserveSats),
      vault.nftCategory,
    );

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[/api/fractionalize/redeem] Error:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
