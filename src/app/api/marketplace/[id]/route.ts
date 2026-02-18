import { NextRequest, NextResponse } from 'next/server';
import { getListingById } from '@/lib/server/marketplace-indexer';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const listing = await getListingById(id);
    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }
    return NextResponse.json(listing);
  } catch (error) {
    console.error('Marketplace listing fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch listing' }, { status: 500 });
  }
}

export async function POST(
  _request: NextRequest,
  _ctx: { params: Promise<{ id: string }> }
) {
  return NextResponse.json(
    { error: 'Listings are derived from on-chain events only.' },
    { status: 405 }
  );
}
