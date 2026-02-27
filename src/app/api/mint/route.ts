import { NextRequest, NextResponse } from 'next/server';
import { mintNFT } from '@/lib/bch/contracts';

// POST /api/mint
// Mints a new CashTokens NFT using the server-side Electrum connection.
// The private key is passed from the client (testnet/localhost only — no real funds).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { privateKeyHex, pkh, address, tokenAddress, commitment, capability, payment } = body;

    if (!privateKeyHex || !pkh || !address || !commitment) {
      return NextResponse.json({ error: 'Missing required fields: privateKeyHex, pkh, address, commitment' }, { status: 400 });
    }

    const privateKey = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));
    const nftCapability: 'none' | 'mutable' | 'minting' =
      capability === 'minting' ? 'minting' : capability === 'mutable' ? 'mutable' : 'none';

    // Optional payment output (used by drop mints to pay the creator atomically)
    const paymentOutput = payment?.toAddress && payment?.amount
      ? { toAddress: payment.toAddress, amount: BigInt(payment.amount) }
      : undefined;

    // Always derive the token-capable address server-side
    const { lockingBytecodeToCashAddress, cashAddressToLockingBytecode, decodeCashAddress } = require('@bitauth/libauth');
    const decoded = decodeCashAddress(address);
    let finalTokenAddress = tokenAddress || address;
    if (typeof decoded !== 'string') {
      const tokenAddrResult = lockingBytecodeToCashAddress({ bytecode: cashAddressToLockingBytecode(address).bytecode, prefix: decoded.prefix, tokenSupport: true });
      if (typeof tokenAddrResult !== 'string') {
        finalTokenAddress = tokenAddrResult.address;
      }
    }
    console.log('[mint] Derived token-capable address:', finalTokenAddress);
    let result;
    try {
      result = await mintNFT(privateKey, pkh, address, finalTokenAddress, commitment, nftCapability, paymentOutput);
    } catch (err) {
      console.error('[/api/mint] Error in mintNFT:', err);
      throw err;
    }

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[/api/mint] Error:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
