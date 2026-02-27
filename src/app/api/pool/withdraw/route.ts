import { NextRequest, NextResponse } from 'next/server';
import { withdrawFromPool } from '@/lib/bch/contracts';
import { getPoolByTxid, updatePool } from '@/lib/server/pools-store';

// POST /api/pool/withdraw
// Operator closes the liquidity pool and reclaims BCH
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { privateKeyHex, operatorAddress, poolTxid } = body;

    if (!privateKeyHex || !operatorAddress || !poolTxid) {
      return NextResponse.json(
        { error: 'Missing required fields: privateKeyHex, operatorAddress, poolTxid' },
        { status: 400 }
      );
    }

    const pool = getPoolByTxid(poolTxid);
    if (!pool) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    }
    if (pool.operator !== operatorAddress) {
      return NextResponse.json({ error: 'Only the pool operator can withdraw' }, { status: 403 });
    }

    const privateKey = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));
    const result = await withdrawFromPool(privateKey, pool, operatorAddress);

    if (result.success) {
      updatePool(poolTxid, { status: 'withdrawn', availableSats: '0' });
    }

    return NextResponse.json({ ...result, pool });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[/api/pool/withdraw] Error:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
