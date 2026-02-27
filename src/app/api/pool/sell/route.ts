import { NextRequest, NextResponse } from 'next/server';
import { sellNFTToPool } from '@/lib/bch/contracts';
import { getPoolByTxid, updatePool } from '@/lib/server/pools-store';

// POST /api/pool/sell
// Seller instantly sells NFT to a liquidity pool
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { privateKeyHex, sellerAddress, nftUtxo, poolTxid } = body;

    if (!privateKeyHex || !sellerAddress || !nftUtxo || !poolTxid) {
      return NextResponse.json(
        { error: 'Missing required fields: privateKeyHex, sellerAddress, nftUtxo, poolTxid' },
        { status: 400 }
      );
    }

    const pool = getPoolByTxid(poolTxid);
    if (!pool) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    }
    if (pool.status !== 'active') {
      return NextResponse.json({ error: 'Pool is not active' }, { status: 400 });
    }

    const privateKey = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));

    const result = await sellNFTToPool(privateKey, pool, sellerAddress, {
      txid: nftUtxo.txid,
      vout: nftUtxo.vout,
      satoshis: BigInt(nftUtxo.satoshis),
      commitment: nftUtxo.commitment || '',
      capability: nftUtxo.capability || 'none',
    });

    if (result.success && result.txid) {
      // Update pool's available sats (decrement by price)
      const newSats = BigInt(pool.availableSats) - BigInt(pool.price);
      updatePool(poolTxid, {
        availableSats: newSats.toString(),
        status: newSats >= BigInt(pool.price) ? 'active' : 'empty',
      });
    }

    return NextResponse.json({ ...result, pool });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[/api/pool/sell] Error:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
