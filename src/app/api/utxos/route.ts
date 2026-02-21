import { NextRequest, NextResponse } from 'next/server';
import { getUtxos } from '@/lib/bch/contracts';

// Server-side proxy so the browser never opens its own WebSocket to Electrum.
// The server holds one persistent Electrum connection that all browser requests share.
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');
  if (!address) {
    return NextResponse.json({ error: 'address required' }, { status: 400 });
  }

  const utxos = await getUtxos(address);

  // BigInt can't be JSON.stringify'd directly — convert to decimal strings.
  const serialized = utxos.map((u) => ({
    txid: u.txid,
    vout: u.vout,
    satoshis: u.satoshis.toString(),
    token: u.token
      ? {
          amount: u.token.amount.toString(),
          category: u.token.category,
          nft: u.token.nft ?? undefined,
        }
      : undefined,
  }));

  return NextResponse.json({ utxos: serialized });
}
