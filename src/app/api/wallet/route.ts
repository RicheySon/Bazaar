import { NextRequest, NextResponse } from 'next/server';
import { ElectrumNetworkProvider } from 'cashscript';

const NETWORK = (process.env.NEXT_PUBLIC_NETWORK as 'chipnet' | 'mainnet') || 'chipnet';

function getProvider(): ElectrumNetworkProvider {
  return new ElectrumNetworkProvider(NETWORK);
}

// GET /api/wallet?address=bchtest:...
// Returns balance and UTXOs for an address
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');

  if (!address) {
    return NextResponse.json({ error: 'Address is required' }, { status: 400 });
  }

  try {
    const electrum = getProvider();

    // Race against a timeout for serverless environments
    const utxos = await Promise.race([
      electrum.getUtxos(address),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Electrum connection timed out')), 15000)
      ),
    ]);

    const balance = utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0n);

    const tokenUtxos = utxos.filter((utxo) => utxo.token);

    const nfts = tokenUtxos.map((utxo) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      satoshis: utxo.satoshis.toString(),
      tokenCategory: utxo.token?.category || '',
      nftCommitment: utxo.token?.nft?.commitment || '',
      nftCapability: utxo.token?.nft?.capability || '',
      tokenAmount: utxo.token?.amount?.toString() || '0',
    }));

    return NextResponse.json({
      address,
      balance: balance.toString(),
      utxoCount: utxos.length,
      nftCount: nfts.length,
      nfts,
    });
  } catch (error) {
    console.error('Wallet API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch wallet data. Electrum connection may be unavailable.' },
      { status: 500 }
    );
  }
}
