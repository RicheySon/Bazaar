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
    console.log(`[Wallet API] Fetching data for address: ${address}`);
    const electrum = getProvider();

    // Retry logic with exponential backoff
    let lastError: Error | null = null;
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const timeout = 20000 + (attempt * 5000); // 20s, 25s, 30s
        console.log(`[Wallet API] Attempt ${attempt + 1}/${maxRetries + 1} with ${timeout}ms timeout`);

        const utxos = await Promise.race([
          electrum.getUtxos(address),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Electrum timeout after ${timeout}ms`)), timeout)
          ),
        ]);

        console.log(`[Wallet API] Successfully fetched ${utxos.length} UTXOs`);
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
      } catch (err) {
        lastError = err as Error;
        console.error(`[Wallet API] Attempt ${attempt + 1} failed:`, err);

        if (attempt < maxRetries) {
          const waitMs = 1000 * (attempt + 1); // 1s, 2s
          console.log(`[Wallet API] Retrying in ${waitMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitMs));
        }
      }
    }

    throw lastError || new Error('All retry attempts failed');
  } catch (error) {
    console.error('[Wallet API] Final error:', error);

    // Fallback: Return zero balance instead of failing
    // This allows the UI to function even when Electrum is down
    console.warn('[Wallet API] Returning fallback response with zero balance');
    return NextResponse.json({
      address,
      balance: '0',
      utxoCount: 0,
      nftCount: 0,
      nfts: [],
      warning: 'Electrum server unavailable. Balance and NFTs cannot be fetched. Minting will fail until connection is restored.',
      electrumError: true,
    });
  }
}
