import { NextRequest, NextResponse } from 'next/server';
import { fractionalizeNFT } from '@/lib/bch/fractional-contracts';
import { buildP2PKHContract } from '@/lib/bch/contracts';
import { saveVault } from '@/lib/server/vaults-store';

// POST /api/fractionalize
// Fractionalize an NFT into 1,000,000 FT shares locked in a vault covenant.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      privateKeyHex,
      ownerPkh,
      ownerAddress,
      ownerTokenAddress,
      nftUtxo,
      reserveSats,
    } = body;

    if (!privateKeyHex || !ownerPkh || !ownerAddress || !nftUtxo || !reserveSats) {
      return NextResponse.json(
        { error: 'Missing required fields: privateKeyHex, ownerPkh, ownerAddress, nftUtxo, reserveSats' },
        { status: 400 },
      );
    }

    const privateKey = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));

    // If no explicit token-capable address provided, derive the P2SH32 token address
    // for the user's generated wallet (P2PKH contract token address).
    const finalOwnerTokenAddress = ownerTokenAddress || (() => {
      try {
        if (!ownerPkh) return ownerAddress;
        const userContract = buildP2PKHContract(ownerPkh);
        return (userContract as any).tokenAddress || ownerAddress;
      } catch (e) {
        return ownerAddress;
      }
    })();

    const result = await fractionalizeNFT(
      privateKey,
      ownerPkh,
      ownerAddress,
      finalOwnerTokenAddress,
      nftUtxo,
      BigInt(reserveSats),
    );

    // Persist vault record so the vault page and Explore tab can discover it
    if (result.success && result.sharesCategory) {
      try {
        saveVault({
          sharesCategory: result.sharesCategory,
          nftCategory: nftUtxo.tokenCategory,
          nftCommitment: nftUtxo.nftCommitment || '',
          nftCapability: nftUtxo.nftCapability || 'none',
          reserveSats: reserveSats.toString(),
          ownerAddress,
          createdAt: Math.floor(Date.now() / 1000),
        });
      } catch (storeErr) {
        console.error('[/api/fractionalize] Failed to save vault record:', storeErr);
        // Non-fatal — transaction is already on-chain
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[/api/fractionalize] Error:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
