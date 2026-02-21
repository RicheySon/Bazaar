// Pinata IPFS Client for NFT metadata storage

const PINATA_JWT = process.env.PINATA_JWT || '';
const PINATA_GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY || 'https://gateway.pinata.cloud';
const PINATA_API = 'https://api.pinata.cloud';
const PINATA_UPLOAD_TIMEOUT_MS = Math.max(
  3000,
  parseInt(process.env.NEXT_PUBLIC_PINATA_UPLOAD_TIMEOUT_MS || '20000')
);

async function fetchWithTimeout(input: RequestInfo, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
const IS_BROWSER = typeof window !== 'undefined';

export interface PinataUploadResult {
  success: boolean;
  ipfsHash?: string;
  ipfsUri?: string;
  httpUrl?: string;
  error?: string;
}

// Upload a file (image/video) to IPFS via Pinata
export async function uploadFileToPinata(file: File): Promise<PinataUploadResult> {
  if (IS_BROWSER) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetchWithTimeout(
        '/api/ipfs/upload',
        { method: 'POST', body: formData },
        PINATA_UPLOAD_TIMEOUT_MS
      );
      if (!response.ok) {
        try {
          const json = await response.json();
          return { success: false, error: json.error || 'Pinata upload failed' };
        } catch {
          return { success: false, error: 'Pinata upload failed' };
        }
      }
      return await response.json();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: msg.includes('aborted') ? 'Upload timed out. Check your connection or try a smaller file.' : `Upload failed: ${msg}`,
      };
    }
  }

  try {
    if (!PINATA_JWT) {
      return { success: false, error: 'Pinata JWT is not configured on the server.' };
    }
    const formData = new FormData();
    formData.append('file', file);

    const metadata = JSON.stringify({
      name: file.name,
      keyvalues: {
        app: 'bazaar-nft',
        type: 'nft-asset',
      },
    });
    formData.append('pinataMetadata', metadata);

    const options = JSON.stringify({
      cidVersion: 1,
    });
    formData.append('pinataOptions', options);

    const response = await fetch(`${PINATA_API}/pinning/pinFileToIPFS`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Pinata upload failed: ${error}` };
    }

    const data = await response.json();
    const ipfsHash = data.IpfsHash;

    return {
      success: true,
      ipfsHash,
      ipfsUri: `ipfs://${ipfsHash}`,
      httpUrl: `${PINATA_GATEWAY}/ipfs/${ipfsHash}`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// Upload NFT metadata JSON to IPFS via Pinata
export async function uploadMetadataToPinata(metadata: {
  name: string;
  description: string;
  image: string;
  creator: string;
  royalty: number;
  collection?: string;
  attributes?: Array<{ trait_type: string; value: string }>;
}): Promise<PinataUploadResult> {
  if (IS_BROWSER) {
    try {
      const response = await fetchWithTimeout(
        '/api/ipfs/metadata',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(metadata),
        },
        PINATA_UPLOAD_TIMEOUT_MS
      );
      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: error || 'Metadata upload failed' };
      }
      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: `Metadata upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  try {
    if (!PINATA_JWT) {
      return { success: false, error: 'Pinata JWT is not configured on the server.' };
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
      return { success: false, error: `Metadata upload failed: ${error}` };
    }

    const data = await response.json();
    const ipfsHash = data.IpfsHash;

    return {
      success: true,
      ipfsHash,
      ipfsUri: `ipfs://${ipfsHash}`,
      httpUrl: `${PINATA_GATEWAY}/ipfs/${ipfsHash}`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Metadata upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// Fetch metadata from IPFS
export async function fetchMetadataFromIPFS(ipfsUri: string): Promise<Record<string, unknown> | null> {
  try {
    const cid = ipfsUri.replace('ipfs://', '');
    const url = `${PINATA_GATEWAY}/ipfs/${cid}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// Convert IPFS URI to HTTP gateway URL
export function ipfsToGatewayUrl(ipfsUri: string): string {
  if (!ipfsUri) return '';
  if (ipfsUri.startsWith('http')) return ipfsUri;
  const cid = ipfsUri.replace('ipfs://', '');
  return `${PINATA_GATEWAY}/ipfs/${cid}`;
}

// Check if Pinata is configured
export function isPinataConfigured(): boolean {
  if (IS_BROWSER) {
    return true;
  }
  return PINATA_JWT !== '' && PINATA_JWT !== 'your_pinata_jwt_here';
}
