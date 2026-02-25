import { NextResponse } from 'next/server';
import { getAllVaults } from '@/lib/server/vaults-store';

// GET /api/vaults
// Returns all registered fractional vault records (no live on-chain status).
export async function GET() {
  try {
    const vaults = getAllVaults();
    return NextResponse.json({ vaults });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[/api/vaults] Error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
