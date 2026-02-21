import { NextRequest, NextResponse } from 'next/server';
import { createFixedListing, createAuctionListing } from '@/lib/bch/contracts';

// POST /api/list
// Creates a fixed-price or auction listing by moving the NFT into a CashScript contract.
// The private key is passed from the client (testnet/localhost only — no real funds).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      privateKeyHex,
      sellerPkh,
      sellerAddress,
      creatorPkh,
      tokenCategory,
      nftUtxo,
      listingType,
      price,
      minBid,
      endTime,
      royaltyBasisPoints,
      minBidIncrement,
    } = body;

    if (!privateKeyHex || !sellerPkh || !sellerAddress || !tokenCategory || !nftUtxo || !listingType) {
      return NextResponse.json(
        { error: 'Missing required fields: privateKeyHex, sellerPkh, sellerAddress, tokenCategory, nftUtxo, listingType' },
        { status: 400 }
      );
    }

    const privateKey = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));

    const tokenUtxo = {
      txid: nftUtxo.txid as string,
      vout: nftUtxo.vout as number,
      satoshis: BigInt(nftUtxo.satoshis as string),
      commitment: (nftUtxo.commitment as string) || '',
      capability: (nftUtxo.capability as 'none' | 'mutable' | 'minting') || 'none',
    };

    const creator = (creatorPkh as string) || sellerPkh;

    let result;
    if (listingType === 'fixed') {
      result = await createFixedListing(
        privateKey,
        tokenCategory,
        tokenUtxo,
        BigInt(price || '0'),
        creator,
        BigInt(royaltyBasisPoints || '0'),
        sellerPkh,
        sellerAddress,
      );
    } else {
      result = await createAuctionListing(
        privateKey,
        tokenCategory,
        tokenUtxo,
        BigInt(minBid || '0'),
        BigInt(endTime || '0'),
        creator,
        BigInt(royaltyBasisPoints || '0'),
        BigInt(minBidIncrement || '1000'),
        sellerPkh,
        sellerAddress,
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[/api/list] Error:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
