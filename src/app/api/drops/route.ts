import { NextRequest, NextResponse } from 'next/server';
import {
  getAllDrops,
  createDrop,
  makeDropSlug,
} from '@/lib/server/drops-store';
import type { NFTDrop } from '@/lib/types';

// GET /api/drops — list all drops with computed status
export async function GET() {
  try {
    const drops = getAllDrops();
    return NextResponse.json({ drops });
  } catch (err) {
    console.error('[GET /api/drops]', err);
    return NextResponse.json({ drops: [] });
  }
}

// POST /api/drops — create a new drop
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      description,
      bannerImage,
      thumbnailImage,
      creatorAddress,
      totalSupply,
      mintPrice,
      mintStartTime,
      mintEndTime,
      whitelistEnabled,
      whitelistStartTime,
      whitelistAddresses,
      maxPerWallet,
      royaltyBasisPoints,
      collectionName,
      metadataDescription,
      attributes,
    } = body;

    if (!name || !creatorAddress || !totalSupply || mintPrice === undefined || !mintStartTime) {
      return NextResponse.json(
        { error: 'Missing required fields: name, creatorAddress, totalSupply, mintPrice, mintStartTime' },
        { status: 400 },
      );
    }

    const slug = makeDropSlug(name);
    const drop: NFTDrop = {
      id: crypto.randomUUID(),
      slug,
      name: String(name).trim(),
      description: String(description ?? '').trim(),
      bannerImage: String(bannerImage ?? ''),
      thumbnailImage: thumbnailImage ? String(thumbnailImage) : undefined,
      creatorAddress: String(creatorAddress),
      royaltyBasisPoints: Number(royaltyBasisPoints ?? 0),
      totalSupply: Number(totalSupply),
      mintedCount: 0,
      mintPrice: String(mintPrice),
      mintStartTime: Number(mintStartTime),
      mintEndTime: mintEndTime ? Number(mintEndTime) : undefined,
      whitelistEnabled: Boolean(whitelistEnabled),
      whitelistStartTime: whitelistStartTime ? Number(whitelistStartTime) : undefined,
      whitelistAddresses: Array.isArray(whitelistAddresses) ? whitelistAddresses : [],
      maxPerWallet: Math.max(1, Number(maxPerWallet ?? 5)),
      collectionName: String(collectionName ?? name).trim(),
      metadataDescription: String(metadataDescription ?? description ?? '').trim(),
      attributes: Array.isArray(attributes) ? attributes : [],
      mintedBy: {},
      mintedTokenCategories: [],
      createdAt: Math.floor(Date.now() / 1000),
    };

    createDrop(drop);
    return NextResponse.json({ drop }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[POST /api/drops]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
