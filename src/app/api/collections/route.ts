import { NextResponse } from 'next/server';
import { getCollectionsData } from '@/lib/server/marketplace-indexer';

export async function GET() {
  try {
    const collections = await getCollectionsData();
    return NextResponse.json({ collections, total: collections.length });
  } catch (error) {
    console.error('[Collections API]', error);
    return NextResponse.json({ collections: [], total: 0 });
  }
}
