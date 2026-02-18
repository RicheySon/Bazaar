import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const PINATA_JWT = process.env.PINATA_JWT || '';
const PINATA_GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY || 'https://gateway.pinata.cloud';
const PINATA_API = 'https://api.pinata.cloud';

export async function POST(request: Request) {
  if (!PINATA_JWT) {
    return NextResponse.json({ success: false, error: 'Pinata JWT is not configured.' }, { status: 500 });
  }

  try {
    const metadata = await request.json();
    if (!metadata?.name || !metadata?.image) {
      return NextResponse.json({ success: false, error: 'Metadata requires name and image.' }, { status: 400 });
    }

    const response = await fetch(`${PINATA_API}/pinning/pinJSONToIPFS`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: JSON.stringify({
        pinataContent: {
          ...metadata,
          createdAt: Date.now(),
          platform: 'Bazaar NFT Marketplace',
          chain: 'Bitcoin Cash Chipnet',
        },
        pinataMetadata: {
          name: `${metadata.name}-metadata.json`,
          keyvalues: {
            app: 'bazaar-nft',
            type: 'nft-metadata',
          },
        },
        pinataOptions: {
          cidVersion: 1,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ success: false, error: `Metadata upload failed: ${error}` }, { status: 500 });
    }

    const data = await response.json();
    const ipfsHash = data.IpfsHash as string;

    return NextResponse.json({
      success: true,
      ipfsHash,
      ipfsUri: `ipfs://${ipfsHash}`,
      httpUrl: `${PINATA_GATEWAY}/ipfs/${ipfsHash}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: `Metadata upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      { status: 500 }
    );
  }
}
