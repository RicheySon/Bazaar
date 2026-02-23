import { NextRequest, NextResponse } from 'next/server';
import { buyNFT } from '@/lib/bch/contracts';
import { getMarketplaceData } from '@/lib/server/marketplace-indexer';
import type { NFTListing } from '@/lib/types';

interface SweepListingInput {
  txid: string;
  tokenCategory: string;
  price: string; // satoshis as string
  seller: string;
  sellerPkh: string;
  creator: string;
  creatorPkh: string;
  commitment: string;
  royaltyBasisPoints: number;
}

/**
 * POST /api/sweep
 * Buys a single NFT listing server-side using the provided private key.
 * Client calls this once per listing in a sequential for-loop.
 *
 * Body: { listing: SweepListingInput, privateKeyHex: string, buyerAddress: string }
 * Returns: { txid, success, purchaseTxid?, error?, skipped? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { listing, privateKeyHex, buyerAddress } = body as {
      listing: SweepListingInput;
      privateKeyHex: string;
      buyerAddress: string;
    };

    if (!listing?.txid || !privateKeyHex || !buyerAddress) {
      return NextResponse.json({ error: 'listing, privateKeyHex, and buyerAddress are required' }, { status: 400 });
    }

    // Pre-check: verify listing is still active in marketplace data (30s cache)
    const marketData = await getMarketplaceData();
    const activeListing = marketData.listings.find(
      (l: any) => l.txid === listing.txid && l.status === 'active'
    );
    if (!activeListing) {
      return NextResponse.json({
        txid: listing.txid,
        success: false,
        skipped: true,
        error: 'Listing no longer active',
      });
    }

    // Convert hex private key to Uint8Array
    const privateKey = new Uint8Array(
      (privateKeyHex.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16))
    );

    // Build NFTListing for buyNFT
    const nftListing: NFTListing = {
      txid: listing.txid,
      vout: 0,
      tokenCategory: listing.tokenCategory,
      commitment: listing.commitment || '',
      satoshis: 0,
      price: BigInt(listing.price),
      sellerAddress: listing.seller,
      sellerPkh: listing.sellerPkh,
      creatorAddress: listing.creator || listing.seller,
      creatorPkh: listing.creatorPkh || listing.sellerPkh,
      royaltyBasisPoints: listing.royaltyBasisPoints,
      status: 'active',
      listingType: 'fixed',
    };

    const result = await buyNFT(privateKey, nftListing, buyerAddress);

    return NextResponse.json({
      txid: listing.txid,
      success: result.success,
      purchaseTxid: result.txid,
      error: result.error,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sweep error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
