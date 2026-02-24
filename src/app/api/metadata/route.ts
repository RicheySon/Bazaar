import { NextRequest, NextResponse } from 'next/server';
import { commitmentHexToCid } from '@/lib/utils';
import { fetchMetadataFromIPFS } from '@/lib/ipfs/pinata';

// 10-minute in-memory cache (same TTL as marketplace indexer metadata)
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { data: unknown; fetchedAt: number }>();

/**
 * GET /api/metadata?commitment=<hex>
 *
 * Resolves IPFS metadata from an NFT commitment hex string.
 * Converts the commitment to an IPFS CID using commitmentHexToCid,
 * then fetches the metadata JSON from the IPFS gateway.
 *
 * Returns the metadata object or 404 if not resolvable.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const commitment = searchParams.get('commitment');

  if (!commitment) {
    return NextResponse.json({ error: 'commitment param required' }, { status: 400 });
  }

  const cid = commitmentHexToCid(commitment);
  if (!cid || cid === commitment) {
    // commitmentHexToCid returned the input unchanged — not a valid IPFS CID
    return NextResponse.json({ error: 'Commitment does not encode an IPFS CID' }, { status: 404 });
  }

  // Serve from cache if fresh
  const cached = cache.get(cid);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  const data = await fetchMetadataFromIPFS(`ipfs://${cid}`);
  if (!data) {
    return NextResponse.json({ error: 'Metadata not found on IPFS' }, { status: 404 });
  }

  cache.set(cid, { data, fetchedAt: Date.now() });
  return NextResponse.json(data);
}
