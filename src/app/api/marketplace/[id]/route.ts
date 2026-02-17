import { NextRequest, NextResponse } from 'next/server';
import { getListingById } from '@/lib/server/marketplace-indexer';
import { updateListing, addBid } from '@/lib/server/marketplace-store';

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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { action } = body || {};

    if (action === 'status') {
      const { status } = body;
      const updated = await updateListing(id, { status });
      if (!updated) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
      return NextResponse.json({ success: true });
    }

    if (action === 'bid') {
      const { bidder, amount, txid } = body;
      if (!bidder || !amount || !txid) {
        return NextResponse.json({ error: 'Missing bid fields' }, { status: 400 });
      }
      const updated = await addBid(
        id,
        { bidder, amount: amount.toString(), txid, timestamp: Date.now() },
        amount.toString(),
        bidder
      );
      if (!updated) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Marketplace listing update error:', error);
    return NextResponse.json({ error: 'Failed to update listing' }, { status: 500 });
  }
}
