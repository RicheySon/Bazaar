import { NextRequest, NextResponse } from 'next/server';
import { getVaultStatus } from '@/lib/bch/fractional-contracts';
import { getVaultByCategory } from '@/lib/server/vaults-store';

// GET /api/fractionalize/[category]
// Returns live vault status + stored vault metadata (no query params required).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ category: string }> },
) {
  try {
    const { category: sharesCategory } = await params;

    // Look up vault record from store
    const vault = getVaultByCategory(sharesCategory);
    if (!vault) {
      return NextResponse.json({ error: 'Vault not found' }, { status: 404 });
    }

    const status = await getVaultStatus(
      sharesCategory,
      BigInt(vault.reserveSats),
      vault.nftCategory,
    );

    // Serialize bigints to strings for JSON and merge with stored metadata
    return NextResponse.json({
      // Live on-chain status
      active: status.active,
      boughtOut: status.boughtOut,
      claimsHasBch: status.claimsHasBch,
      remainingShares: status.remainingShares.toString(),
      remainingSats: status.remainingSats.toString(),
      totalShares: status.totalShares.toString(),
      reserveSats: status.reserveSats.toString(),
      // Stored vault metadata
      nftCategory: vault.nftCategory,
      nftCommitment: vault.nftCommitment,
      nftCapability: vault.nftCapability,
      ownerAddress: vault.ownerAddress,
      createdAt: vault.createdAt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[/api/fractionalize/[category]] Error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
