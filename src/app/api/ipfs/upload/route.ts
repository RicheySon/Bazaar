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
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ success: false, error: 'File is required.' }, { status: 400 });
    }

    const metadata = JSON.stringify({
      name: (file as File).name || 'upload',
      keyvalues: {
        app: 'bazaar-nft',
        type: 'nft-asset',
      },
    });

    const pinataForm = new FormData();
    pinataForm.append('file', file);
    pinataForm.append('pinataMetadata', metadata);
    pinataForm.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

    const response = await fetch(`${PINATA_API}/pinning/pinFileToIPFS`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: pinataForm,
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ success: false, error: `Pinata upload failed: ${error}` }, { status: 500 });
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
        error: `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      { status: 500 }
    );
  }
}
