import { NextRequest, NextResponse } from 'next/server';
import { getVaultStatus } from '@/lib/bch/fractional-contracts';

// GET /api/fractionalize/[category]?reserveSats=...&nftCategory=...
// Returns live status of a fractional vault.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ category: string }> },
) {
  try {
    const { category: sharesCategory } = await params;
    const { searchParams } = new URL(request.url);
    const reserveSatsStr = searchParams.get('reserveSats');
    const nftCategory = searchParams.get('nftCategory');

    if (!sharesCategory || !reserveSatsStr || !nftCategory) {
      return NextResponse.json(
        { error: 'Missing required query params: reserveSats, nftCategory' },
        { status: 400 },
      );
    }

    const status = await getVaultStatus(sharesCategory, BigInt(reserveSatsStr), nftCategory);

    // Serialize bigints to strings for JSON
    return NextResponse.json({
      active: status.active,
      boughtOut: status.boughtOut,
      claimsHasBch: status.claimsHasBch,
      remainingShares: status.remainingShares.toString(),
      remainingSats: status.remainingSats.toString(),
      totalShares: status.totalShares.toString(),
      reserveSats: status.reserveSats.toString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[/api/fractionalize/[category]] Error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
