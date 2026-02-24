import { NextResponse } from 'next/server';
import { commitmentHexToCid } from '@/lib/utils';
import { fetchMetadataFromIPFS } from '@/lib/ipfs/pinata';

const CHAINGRAPH_URL = process.env.CHAINGRAPH_URL;

// 2-minute cache for Chaingraph data
const CACHE_TTL_MS = 2 * 60 * 1000;
let cache: { data: unknown; fetchedAt: number } | null = null;

const ALL_NFTS_QUERY = `
  query AllNFTs {
    output(
      where: {
        nonfungible_token_capability: { _is_null: false }
        spent_by: { _is_null: true }
      }
      limit: 2000
      order_by: [{ block_inclusion_order: { block: { height: desc } } }]
    ) {
      transaction_hash
      output_index
      value_satoshis
      token_category
      nonfungible_token_capability
      nonfungible_token_commitment
      locking_bytecode
    }
  }
`;

/**
 * GET /api/chaingraph
 *
 * Queries a Chaingraph GraphQL node for ALL unspent NFT UTXOs on-chain.
 * Requires the CHAINGRAPH_URL environment variable to be set.
 *
 * Example: CHAINGRAPH_URL=http://localhost:8080/v1/graphql
 *
 * Groups results by tokenCategory, resolves IPFS metadata from commitments,
 * and returns a collections-compatible response.
 *
 * Phase 2: set CHAINGRAPH_URL to a running Chaingraph node to enable this.
 */
export async function GET() {
  if (!CHAINGRAPH_URL) {
    return NextResponse.json(
      {
        error: 'CHAINGRAPH_URL not configured',
        configured: false,
        hint: 'Set CHAINGRAPH_URL=http://localhost:8080/v1/graphql in your .env.local and run a local Chaingraph node to enable on-chain NFT discovery.',
        collections: [],
        total: 0,
      },
      { status: 503 }
    );
  }

  // Serve from cache if fresh
  if (cache && Date.now() - (cache.fetchedAt as number) < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  try {
    const res = await fetch(CHAINGRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: ALL_NFTS_QUERY }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Chaingraph returned HTTP ${res.status}`, collections: [], total: 0 },
        { status: 502 }
      );
    }

    const json = await res.json();
    const outputs: any[] = json?.data?.output ?? [];

    // Group outputs by tokenCategory
    const byCategory = new Map<string, any[]>();
    for (const out of outputs) {
      const cat = out.token_category as string;
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(out);
    }

    // Resolve metadata for each unique commitment (parallel, best-effort)
    const commitmentMeta = new Map<string, any>();
    const uniqueCommitments = [...new Set(outputs.map((o) => o.nonfungible_token_commitment as string).filter(Boolean))];
    await Promise.all(
      uniqueCommitments.map(async (commitment) => {
        const cid = commitmentHexToCid(commitment);
        if (!cid || cid === commitment) return;
        const data = await fetchMetadataFromIPFS(`ipfs://${cid}`).catch(() => null);
        if (data) commitmentMeta.set(commitment, data);
      })
    );

    // Build collections array
    const collections = Array.from(byCategory.entries()).map(([tokenCategory, items]) => {
      const firstMeta = commitmentMeta.get(items[0]?.nonfungible_token_commitment) ?? null;
      return {
        tokenCategory,
        name: (firstMeta as any)?.collection || (firstMeta as any)?.name || `Collection ${tokenCategory.slice(0, 8)}`,
        image: (firstMeta as any)?.collectionImage || (firstMeta as any)?.image || null,
        totalSupply: items.length,
        items: items.map((out) => ({
          txid: out.transaction_hash,
          vout: out.output_index,
          tokenCategory,
          commitment: out.nonfungible_token_commitment,
          capability: out.nonfungible_token_capability,
          satoshis: out.value_satoshis,
          lockingBytecode: out.locking_bytecode,
          metadata: commitmentMeta.get(out.nonfungible_token_commitment) ?? null,
          status: 'unlisted',
        })),
      };
    });

    const result = { collections, total: collections.length, configured: true };
    cache = { data: result, fetchedAt: Date.now() };
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Chaingraph fetch error';
    return NextResponse.json({ error: msg, collections: [], total: 0 }, { status: 502 });
  }
}
