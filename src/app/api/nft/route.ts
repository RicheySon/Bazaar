import { NextRequest, NextResponse } from 'next/server';
import { ElectrumNetworkProvider } from 'cashscript';

const NETWORK = (process.env.NEXT_PUBLIC_NETWORK as 'chipnet' | 'mainnet') || 'chipnet';

function getProvider(): ElectrumNetworkProvider {
  return new ElectrumNetworkProvider(NETWORK);
}

// GET /api/nft?address=bchtest:...
// Returns all NFT token UTXOs for an address
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');

  if (!address) {
    return NextResponse.json({ error: 'Address is required' }, { status: 400 });
  }

  try {
    const electrum = getProvider();
    const utxos = await electrum.getUtxos(address);

    const nfts = utxos
      .filter((utxo) => utxo.token?.nft)
      .map((utxo) => ({
        txid: utxo.txid,
        vout: utxo.vout,
        satoshis: utxo.satoshis.toString(),
        tokenCategory: utxo.token?.category || '',
        commitment: utxo.token?.nft?.commitment || '',
        capability: utxo.token?.nft?.capability || 'none',
      }));

    return NextResponse.json({ address, nfts });
  } catch (error) {
    console.error('NFT API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch NFTs' },
      { status: 500 }
    );
  }
}

// POST /api/nft - Mint a new NFT (server-side transaction building)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, commitment, name } = body;

    if (!address || !commitment) {
      return NextResponse.json(
        { error: 'Address and commitment are required' },
        { status: 400 }
      );
    }

    const electrum = getProvider();
    const utxos = await electrum.getUtxos(address);

    if (utxos.length === 0) {
      return NextResponse.json(
        { error: 'No UTXOs available. Fund your wallet from the Chipnet faucet: https://tbch.googol.cash' },
        { status: 400 }
      );
    }

    // For CashTokens NFT genesis:
    // The token category is derived from the first input's outpoint
    // This requires raw transaction building which needs libauth
    // For the hackathon, we return the UTXO info needed for minting
    return NextResponse.json({
      success: true,
      message: 'Mint preparation complete',
      utxo: {
        txid: utxos[0].txid,
        vout: utxos[0].vout,
        satoshis: utxos[0].satoshis.toString(),
      },
      tokenCategory: utxos[0].txid,
      commitment,
      name,
    });
  } catch (error) {
    console.error('Mint API error:', error);
    return NextResponse.json(
      { error: 'Failed to prepare mint transaction' },
      { status: 500 }
    );
  }
}
