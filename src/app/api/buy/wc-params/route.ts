import { NextRequest, NextResponse } from 'next/server';
import { buildWcBuyParams } from '@/lib/bch/contracts';
import { binToHex } from '@bitauth/libauth';
import type { NFTListing } from '@/lib/types';

/** Serialize a Uint8Array → hex string for JSON transport. */
function u8hex(arr: Uint8Array | undefined): string {
  return arr ? binToHex(arr) : '';
}

/** Serialize the CashScript transaction object to a JSON-safe form. */
function serializeTransaction(tx: any) {
  return {
    version: tx.version,
    locktime: tx.locktime,
    inputs: (tx.inputs as any[]).map((inp) => ({
      outpointIndex: inp.outpointIndex,
      outpointTransactionHash: u8hex(inp.outpointTransactionHash),
      sequenceNumber: inp.sequenceNumber,
      unlockingBytecode: u8hex(inp.unlockingBytecode),
    })),
    outputs: (tx.outputs as any[]).map((out) => ({
      lockingBytecode: u8hex(out.lockingBytecode),
      valueSatoshis: out.valueSatoshis.toString(),
      ...(out.token && {
        token: {
          category: u8hex(out.token.category),
          amount: out.token.amount.toString(),
          ...(out.token.nft && {
            nft: {
              capability: out.token.nft.capability,
              commitment: u8hex(out.token.nft.commitment),
            },
          }),
        },
      }),
    })),
  };
}

/**
 * POST /api/buy/wc-params
 * Builds WalletConnect signing parameters for buying a fixed-price NFT listing.
 * Moved server-side to keep contracts.ts (which imports @bitauth/libauth with
 * topLevelAwait) out of the client bundle.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { listing: listingRaw, buyerAddress } = body as { listing: any; buyerAddress: string };

    if (!listingRaw || !buyerAddress) {
      return NextResponse.json(
        { error: 'listing and buyerAddress are required' },
        { status: 400 },
      );
    }

    // Reconstruct BigInt fields that are serialised as strings over JSON.
    const listing: NFTListing = {
      ...listingRaw,
      price: BigInt(listingRaw.price ?? '0'),
      royaltyBasisPoints: Number(listingRaw.royaltyBasisPoints ?? 0),
      satoshis: Number(listingRaw.satoshis ?? 0),
    };

    const result = await buildWcBuyParams({ listing, buyerAddress });

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      transactionHex: result.transactionHex,
      transactionJson: serializeTransaction(result.transaction),
      sourceOutputsJson: result.sourceOutputsJson,
      userPrompt: result.userPrompt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to build WC buy params';
    console.error('[/api/buy/wc-params]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
