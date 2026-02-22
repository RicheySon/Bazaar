import { NextRequest, NextResponse } from 'next/server';
import {
  getDropById,
  validateMintEligibility,
  recordMint,
} from '@/lib/server/drops-store';
import { uploadMetadataToPinata } from '@/lib/ipfs/pinata';
import { mintNFT } from '@/lib/bch/contracts';
import { cidToCommitmentHex } from '@/lib/utils';

/**
 * POST /api/drops/mint
 *
 * Body:
 *  dropId       string   — drop ID
 *  buyerAddress string   — buyer's P2PKH address (bchtest:q...)
 *  pkh          string   — buyer's public key hash (hex)
 *  tokenAddress string   — buyer's token-capable address (z... or same as address on chipnet)
 *  privateKeyHex string  — buyer's private key hex (testnet/hackathon only)
 *  quantity     number   — number of NFTs to mint (default 1)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      dropId,
      buyerAddress,
      pkh,
      tokenAddress,
      privateKeyHex,
      quantity = 1,
    } = body;

    if (!dropId || !buyerAddress || !pkh || !privateKeyHex) {
      return NextResponse.json(
        { error: 'Missing required fields: dropId, buyerAddress, pkh, privateKeyHex' },
        { status: 400 },
      );
    }

    const qty = Math.max(1, Math.min(Number(quantity), 10));
    const drop = getDropById(dropId);
    if (!drop) {
      return NextResponse.json({ error: 'Drop not found' }, { status: 404 });
    }

    const eligibilityError = validateMintEligibility(drop, buyerAddress, qty);
    if (eligibilityError) {
      return NextResponse.json({ error: eligibilityError }, { status: 403 });
    }

    const privateKey = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));
    const mintPrice = BigInt(drop.mintPrice || '0');
    const payment =
      mintPrice > 0n
        ? { toAddress: drop.creatorAddress, amount: mintPrice * BigInt(qty) }
        : undefined;

    const results: { txid: string; tokenCategory: string; nftNumber: number }[] = [];

    // Mint NFTs one at a time (each is a separate genesis transaction)
    for (let i = 0; i < qty; i++) {
      // Reserve the slot first to get the sequential number
      const mintRecord = recordMint(drop.id, buyerAddress, '__pending__');
      if (!mintRecord) {
        return NextResponse.json({ error: 'Failed to record mint' }, { status: 500 });
      }
      const { nftNumber } = mintRecord;

      // Upload metadata for this specific NFT
      const metadataResult = await uploadMetadataToPinata({
        name: `${drop.collectionName} #${nftNumber}`,
        description: drop.metadataDescription,
        image: drop.bannerImage,
        creator: drop.creatorAddress,
        royalty: drop.royaltyBasisPoints,
        collection: drop.collectionName,
        attributes: [
          ...(drop.attributes ?? []),
          { trait_type: 'Drop', value: drop.name },
          { trait_type: 'Edition', value: `${nftNumber} of ${drop.totalSupply}` },
        ],
      });

      if (!metadataResult.success || !metadataResult.ipfsHash) {
        // Roll back the reserved slot count on IPFS failure
        // (best-effort: decrement mintedCount)
        const current = getDropById(dropId);
        if (current) {
          const { updateDrop } = await import('@/lib/server/drops-store');
          updateDrop(drop.id, {
            mintedCount: current.mintedCount - 1,
            mintedBy: {
              ...current.mintedBy,
              [buyerAddress]: Math.max(0, (current.mintedBy[buyerAddress] ?? 1) - 1),
            },
          });
        }
        return NextResponse.json(
          { error: 'Failed to upload NFT metadata to IPFS. Please try again.' },
          { status: 500 },
        );
      }

      const commitment = metadataResult.ipfsHash; // CIDv1 string

      // Mint NFT with optional payment to drop creator
      const mintResult = await mintNFT(
        privateKey,
        pkh,
        buyerAddress,
        tokenAddress || buyerAddress,
        commitment,
        'none',
        // Only include payment on the first NFT in batch (full amount);
        // subsequent iterations are free-standing mints that reuse the same payment.
        // For simplicity (and because each genesis tx is separate), charge once.
        i === 0 ? payment : undefined,
      );

      if (!mintResult.success || !mintResult.txid) {
        return NextResponse.json(
          { error: mintResult.error || 'Mint transaction failed' },
          { status: 500 },
        );
      }

      // Update the token category placeholder with the real txid
      const currentDrop = getDropById(dropId);
      if (currentDrop) {
        const categories = [...(currentDrop.mintedTokenCategories ?? [])];
        const pendingIdx = categories.lastIndexOf('__pending__');
        if (pendingIdx !== -1) {
          categories[pendingIdx] = mintResult.tokenCategory!;
          const { updateDrop } = await import('@/lib/server/drops-store');
          updateDrop(drop.id, { mintedTokenCategories: categories });
        }
      }

      results.push({
        txid: mintResult.txid,
        tokenCategory: mintResult.tokenCategory!,
        nftNumber,
      });
    }

    return NextResponse.json({
      success: true,
      minted: results,
      dropSlug: drop.slug,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[POST /api/drops/mint]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
