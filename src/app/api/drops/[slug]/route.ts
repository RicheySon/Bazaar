import { NextRequest, NextResponse } from 'next/server';
import { getDropBySlug } from '@/lib/server/drops-store';

// GET /api/drops/[slug]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const drop = getDropBySlug(slug);
    if (!drop) {
      return NextResponse.json({ error: 'Drop not found' }, { status: 404 });
    }
    return NextResponse.json({ drop });
  } catch (err) {
    console.error('[GET /api/drops/[slug]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
