import { NextRequest, NextResponse } from 'next/server';
import { ElectrumNetworkProvider } from 'cashscript';
import { decodeCashAddress, encodeTransaction, binToHex } from '@bitauth/libauth';

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

// POST /api/nft - Prepare an unsigned mint transaction (for client signing)
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

    const decoded = decodeCashAddress(address);
    if (typeof decoded === 'string') {
      return NextResponse.json({ error: 'Invalid address: ' + decoded }, { status: 400 });
    }
    const addrPkh = decoded.payload;
    const lockingBytecode = new Uint8Array([0x76, 0xa9, 0x14, ...addrPkh, 0x88, 0xac]);

    // Select non-token UTXOs for minting
    const sorted = utxos.filter((u) => !u.token).sort((a, b) => Number(b.satoshis - a.satoshis));
    let total = 0n;
    const fundingUtxos = [];
    for (const u of sorted) {
      fundingUtxos.push(u);
      total += u.satoshis;
      if (total >= 2000n) break;
    }
    if (total < 2000n) {
      return NextResponse.json(
        { error: 'Insufficient funds to mint. Please fund your wallet from the Chipnet faucet.' },
        { status: 400 }
      );
    }

    const genesisInput = fundingUtxos[0];
    const category = genesisInput.txid;
    const commitmentBytes = new Uint8Array(Buffer.from(commitment, 'utf8'));

    const sourceOutputs = fundingUtxos.map((utxo) => ({
      outpointIndex: utxo.vout,
      outpointTransactionHash: new Uint8Array(Buffer.from(utxo.txid, 'hex').reverse()),
      sequenceNumber: 0xffffffff,
      unlockingBytecode: new Uint8Array(),
      lockingBytecode: lockingBytecode,
      valueSatoshis: utxo.satoshis,
    }));

    const totalInput = fundingUtxos.reduce((sum, u) => sum + u.satoshis, 0n);
    const fee = 1000n;
    const nftDust = 1000n;
    const change = totalInput - nftDust - fee;

    const categoryBytes = new Uint8Array(Buffer.from(category, 'hex').reverse());

    const txOutputs: Array<{
      lockingBytecode: Uint8Array;
      valueSatoshis: bigint;
      token?: {
        category: Uint8Array;
        amount: bigint;
        nft?: { capability: 'none' | 'mutable' | 'minting'; commitment: Uint8Array };
      };
    }> = [
      {
        lockingBytecode: lockingBytecode,
        valueSatoshis: nftDust,
        token: {
          category: categoryBytes,
          amount: 0n,
          nft: {
            capability: 'none' as const,
            commitment: commitmentBytes,
          },
        },
      },
    ];

    if (change > 546n) {
      txOutputs.push({
        lockingBytecode: lockingBytecode,
        valueSatoshis: change,
      });
    }

    const transaction = {
      version: 2,
      inputs: sourceOutputs.map((so) => ({
        outpointIndex: so.outpointIndex,
        outpointTransactionHash: so.outpointTransactionHash,
        sequenceNumber: so.sequenceNumber,
        unlockingBytecode: so.unlockingBytecode,
      })),
      outputs: txOutputs,
      locktime: 0,
    };

    const txBytes = encodeTransaction(transaction);
    const transactionHex = binToHex(txBytes);

    const sourceOutputsForWC = sourceOutputs.map((so) => ({
      outpointIndex: so.outpointIndex,
      outpointTransactionHash: binToHex(so.outpointTransactionHash),
      sequenceNumber: so.sequenceNumber,
      unlockingBytecode: binToHex(so.unlockingBytecode),
      lockingBytecode: binToHex(so.lockingBytecode),
      valueSatoshis: Number(so.valueSatoshis),
    }));

    return NextResponse.json({
      success: true,
      message: 'Mint preparation complete',
      transactionHex,
      sourceOutputs: sourceOutputsForWC,
      tokenCategory: category,
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
