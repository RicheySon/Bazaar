import { NextResponse } from 'next/server';
import { getCollectionBySlug } from '@/lib/server/marketplace-indexer';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const collection = await getCollectionBySlug(slug);
    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }
    return NextResponse.json(collection);
  } catch (error) {
    console.error('[Collections API]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
