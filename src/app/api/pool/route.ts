import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { deployLiquidityPool } from '@/lib/bch/contracts';
import { getUtxos } from '@/lib/bch/contracts';
import { getAllPools, getPoolsByCategory, createPool } from '@/lib/server/pools-store';
import { decodeCashAddress } from '@bitauth/libauth';
import type { LiquidityPool } from '@/lib/types';

// GET /api/pool?category=<hex>
// Returns all active liquidity pools, optionally filtered by tokenCategory
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    let pools = category ? getPoolsByCategory(category) : getAllPools();

    // Enrich with live BCH balance from Electrum
    const enriched = await Promise.all(
      pools.map(async (pool) => {
        try {
          const utxos = await getUtxos(pool.contractAddress);
          const bchUtxo = utxos.find((u) => !u.token);
          const availableSats = bchUtxo ? bchUtxo.satoshis.toString() : '0';
          const status = bchUtxo && bchUtxo.satoshis >= BigInt(pool.price) ? 'active' : 'empty';
          return { ...pool, availableSats, status };
        } catch {
          return pool;
        }
      })
    );

    return NextResponse.json({ pools: enriched, total: enriched.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/pool
// Deploy a new liquidity pool (operator locks BCH)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      privateKeyHex,
      operatorPkh,
      operatorAddress,
      tokenCategory,
      creatorPkh,
      creatorAddress,
      royaltyBasisPoints,
      price,
      depositSats,
      poolSalt,
    } = body;

    if (!privateKeyHex || !operatorPkh || !operatorAddress || !tokenCategory || !price || !depositSats) {
      return NextResponse.json(
        { error: 'Missing required fields: privateKeyHex, operatorPkh, operatorAddress, tokenCategory, price, depositSats' },
        { status: 400 }
      );
    }

    const privateKey = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));
    const saltHex = typeof poolSalt === 'string' && poolSalt.length === 64
      ? poolSalt
      : randomBytes(32).toString('hex');

    const result = await deployLiquidityPool(
      privateKey,
      operatorPkh,
      operatorAddress,
      tokenCategory,
      saltHex,
      creatorPkh || '00'.repeat(20),
      BigInt(royaltyBasisPoints || 0),
      BigInt(price),
      BigInt(depositSats)
    );

    if (!result.success || !result.txid) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    const pool: LiquidityPool = {
      txid: result.txid,
      tokenCategory,
      poolSalt: saltHex,
      price: price.toString(),
      operator: operatorAddress,
      operatorPkh,
      creator: creatorAddress || operatorAddress,
      creatorPkh: creatorPkh || '00'.repeat(20),
      royaltyBasisPoints: royaltyBasisPoints || 0,
      contractAddress: result.contractAddress!,
      availableSats: depositSats.toString(),
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    createPool(pool);
    return NextResponse.json({ ...result, pool, poolSalt: saltHex });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[/api/pool] Error:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
