import { NextRequest, NextResponse } from 'next/server';
import { getMarketplaceData } from '@/lib/server/marketplace-indexer';

// GET /api/marketplace - Fetch all active listings
export async function GET(request: NextRequest) {
  try {
    const data = await getMarketplaceData();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Marketplace API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch marketplace listings' },
      { status: 500 }
    );
  }
}

export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { error: 'Listings are derived from on-chain events only.' },
    { status: 405 }
  );
}
