import { NextRequest, NextResponse } from 'next/server';
import { claimProceeds } from '@/lib/bch/fractional-contracts';

// POST /api/fractionalize/claim
// Burn share FTs → receive pro-rata BCH payout from claims covenant.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { privateKeyHex, claimantAddress, sharesCategory, burnAmount } = body;

    if (!privateKeyHex || !claimantAddress || !sharesCategory) {
      return NextResponse.json(
        { error: 'Missing required fields: privateKeyHex, claimantAddress, sharesCategory' },
        { status: 400 },
      );
    }

    const privateKey = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));
    const burnAmountBigInt = burnAmount ? BigInt(burnAmount) : undefined;

    const result = await claimProceeds(privateKey, claimantAddress, sharesCategory, burnAmountBigInt);

    // Convert bigint fields to strings for JSON serialization
    const response = {
      ...result,
      payout: result.payout !== undefined ? result.payout.toString() : undefined,
      burnedAmount: (result as any).burnedAmount !== undefined
        ? (result as any).burnedAmount.toString()
        : undefined,
    };

    return NextResponse.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[/api/fractionalize/claim] Error:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
