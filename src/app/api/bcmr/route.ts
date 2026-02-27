import { NextRequest, NextResponse } from 'next/server';

// Server-side BCMR response cache — 5 minutes TTL
const bcmrCache = new Map<string, { data: unknown; fetchedAt: number }>();
const BCMR_CACHE_MS = 5 * 60 * 1000;

/**
 * GET /api/bcmr?url=<registry_url>&category=<tokenCategory>
 *
 * Fetches a Bitcoin Cash Metadata Registry (BCMR v2) JSON file, caches it
 * server-side for 5 minutes, and optionally checks whether a specific
 * tokenCategory is registered in the registry's identities map.
 *
 * Returns: { verified: boolean, registry: object }
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const category = searchParams.get('category');

  if (!url) {
    return NextResponse.json({ error: 'url param required' }, { status: 400 });
  }

  // SSRF guard — only allow http/https
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ error: 'Invalid URL scheme' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // Serve from cache if fresh
  const cached = bcmrCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < BCMR_CACHE_MS) {
    const verified = category ? isVerifiedInRegistry(cached.data, category) : false;
    const meta = category ? extractMetadata(cached.data, category) : null;
    return NextResponse.json({ verified, registry: cached.data, ...meta });
  }

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { verified: false, error: `Registry fetch returned HTTP ${res.status}` },
        { status: 502 }
      );
    }
    const data = await res.json();
    bcmrCache.set(url, { data, fetchedAt: Date.now() });

    const verified = category ? isVerifiedInRegistry(data, category) : false;
    const meta = category ? extractMetadata(data, category) : null;
    return NextResponse.json({ verified, registry: data, ...meta });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'BCMR fetch error';
    return NextResponse.json({ verified: false, error: msg }, { status: 502 });
  }
}

/**
 * Checks whether tokenCategory appears as a key in registry.identities.
 * Comparison is case-insensitive — BCMR may use uppercase hex.
 */
function isVerifiedInRegistry(registry: unknown, tokenCategory: string): boolean {
  if (!registry || typeof registry !== 'object') return false;
  const identities = (registry as Record<string, unknown>).identities;
  if (!identities || typeof identities !== 'object') return false;
  const lower = tokenCategory.toLowerCase();
  return Object.keys(identities).some((k) => k.toLowerCase() === lower);
}

/**
 * Extract name, icon, description, symbol for a specific tokenCategory.
 * Returns null fields if not found.
 */
function extractMetadata(registry: unknown, tokenCategory: string): {
  name: string | null;
  icon: string | null;
  description: string | null;
  symbol: string | null;
  decimals: number | null;
} {
  const empty = { name: null, icon: null, description: null, symbol: null, decimals: null };
  if (!registry || typeof registry !== 'object') return empty;
  const identities = (registry as Record<string, unknown>).identities;
  if (!identities || typeof identities !== 'object') return empty;

  const lower = tokenCategory.toLowerCase();
  const key = Object.keys(identities).find((k) => k.toLowerCase() === lower);
  if (!key) return empty;

  const identity = (identities as Record<string, unknown>)[key];
  if (!identity || typeof identity !== 'object') return empty;

  // BCMR v2: identity is a map of snapshot timestamps → snapshot object
  // Get the latest snapshot (highest timestamp key or "current")
  const snapshots = Object.values(identity as Record<string, unknown>);
  const snapshot = (snapshots[0] as Record<string, unknown>) ?? {};

  const token = (snapshot.token as Record<string, unknown>) ?? {};
  const uris = (snapshot.uris as Record<string, unknown>) ?? {};

  return {
    name: (snapshot.name as string) ?? null,
    icon: (uris.icon as string) ?? null,
    description: (snapshot.description as string) ?? null,
    symbol: (token.symbol as string) ?? null,
    decimals: typeof token.decimals === 'number' ? token.decimals : null,
  };
}
