import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const PINATA_JWT = process.env.PINATA_JWT || '';
const PINATA_GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY || 'https://gateway.pinata.cloud';
const PINATA_API = 'https://api.pinata.cloud';
const PINATA_TIMEOUT_MS = Math.max(3000, parseInt(process.env.PINATA_TIMEOUT_MS || '20000'));

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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PINATA_TIMEOUT_MS);
    console.log(`[IPFS Upload] Sending file to Pinata (timeout: ${PINATA_TIMEOUT_MS}ms)...`);
    const response = await fetch(`${PINATA_API}/pinning/pinFileToIPFS`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: pinataForm,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    console.log(`[IPFS Upload] Pinata response status: ${response.status}`);
    if (!response.ok) {
      const error = await response.text();
      console.error(`[IPFS Upload] Pinata error body: ${error}`);
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
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const isAbort = error instanceof Error && (error.name === 'AbortError' || msg.includes('aborted'));
    console.error(`[IPFS Upload] Error (isAbort=${isAbort}):`, error);
    return NextResponse.json(
      {
        success: false,
        error: isAbort
          ? `Pinata upload timed out after ${PINATA_TIMEOUT_MS}ms`
          : `Upload failed: ${msg}`,
      },
      { status: 500 }
    );
  }
}
