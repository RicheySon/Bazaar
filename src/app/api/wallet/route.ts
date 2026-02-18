import { NextRequest, NextResponse } from 'next/server';
import { getElectrumProvider } from '@/lib/bch/electrum';

const NETWORK = (process.env.NEXT_PUBLIC_NETWORK as 'chipnet' | 'mainnet') || 'chipnet';
const WALLET_CACHE_MS = Math.max(0, parseInt(process.env.WALLET_CACHE_MS || '15000'));
const WALLET_TIMEOUT_BASE_MS = Math.max(3000, parseInt(process.env.WALLET_TIMEOUT_MS || '15000'));
const WALLET_MAX_RETRIES = Math.max(0, parseInt(process.env.WALLET_MAX_RETRIES || '1'));

type WalletSnapshot = {
  address: string;
  balance: string;
  utxoCount: number;
  nftCount: number;
  nfts: Array<{
    txid: string;
    vout: number;
    satoshis: string;
    tokenCategory: string;
    nftCommitment: string;
    nftCapability: string;
    tokenAmount: string;
  }>;
};

const walletCache = new Map<string, { data: WalletSnapshot; fetchedAt: number }>();

// GET /api/wallet?address=bchtest:...
// Returns balance and UTXOs for an address
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');

  if (!address) {
    return NextResponse.json({ error: 'Address is required' }, { status: 400 });
  }

  if (WALLET_CACHE_MS > 0) {
    const cached = walletCache.get(address);
    if (cached && Date.now() - cached.fetchedAt < WALLET_CACHE_MS) {
      return NextResponse.json({ ...cached.data, cached: true });
    }
  }

  try {
    console.log(`[Wallet API] Fetching data for address: ${address}`);
    const electrum = getElectrumProvider(NETWORK);

    // Retry logic with exponential backoff
    let lastError: Error | null = null;
    const maxRetries = WALLET_MAX_RETRIES;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const timeout = WALLET_TIMEOUT_BASE_MS + (attempt * 5000);
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

        const payload: WalletSnapshot = {
          address,
          balance: balance.toString(),
          utxoCount: utxos.length,
          nftCount: nfts.length,
          nfts,
        };

        if (WALLET_CACHE_MS > 0) {
          walletCache.set(address, { data: payload, fetchedAt: Date.now() });
        }

        return NextResponse.json(payload);
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

    const cached = walletCache.get(address);
    if (cached) {
      return NextResponse.json({
        ...cached.data,
        cached: true,
        warning: 'Electrum server unavailable. Returning cached wallet data.',
        electrumError: true,
      });
    }

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
