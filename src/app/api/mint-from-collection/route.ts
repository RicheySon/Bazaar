import { NextRequest, NextResponse } from 'next/server';
import { mintFromCollection } from '@/lib/bch/contracts';
import type { MintingTokenUtxo } from '@/lib/bch/contracts';
import { lockingBytecodeToCashAddress, cashAddressToLockingBytecode, decodeCashAddress } from '@bitauth/libauth';

// POST /api/mint-from-collection
// Mints a new child NFT using an existing minting-capability token.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { privateKeyHex, pkh, address, mintingToken, newCommitment, newCapability } = body;

    if (!privateKeyHex || !pkh || !address || !mintingToken || !newCommitment) {
      return NextResponse.json(
        { error: 'Missing required fields: privateKeyHex, pkh, address, mintingToken, newCommitment' },
        { status: 400 }
      );
    }

    const privateKey = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));
    const capability: 'none' | 'mutable' = newCapability === 'mutable' ? 'mutable' : 'none';

    const token: MintingTokenUtxo = {
      txid: mintingToken.txid,
      vout: Number(mintingToken.vout),
      satoshis: BigInt(mintingToken.satoshis),
      category: mintingToken.category,
      commitment: mintingToken.commitment,
    };

    // Derive the token-capable address server-side
    let tokenAddress = address;
    try {
      const decoded = decodeCashAddress(address);
      if (typeof decoded !== 'string') {
        const locking = cashAddressToLockingBytecode(address);
        if (typeof locking !== 'string') {
          const tokenAddrResult = lockingBytecodeToCashAddress({
            bytecode: locking.bytecode,
            prefix: decoded.prefix,
            tokenSupport: true,
          });
          if (typeof tokenAddrResult !== 'string') {
            tokenAddress = tokenAddrResult.address;
          }
        }
      }
    } catch {
      // fallback to original address
    }

    const result = await mintFromCollection(
      privateKey, pkh, tokenAddress, token, newCommitment, capability
    );

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[/api/mint-from-collection] Error:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
