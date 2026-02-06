'use client';

// Client-side API calls to server-side blockchain operations
// All cashscript/electrum operations run server-side via API routes

export interface WalletResponse {
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
}

export interface MarketplaceResponse {
  listings: Array<{
    txid: string;
    tokenCategory: string;
    price: string;
    seller: string;
    commitment: string;
    royaltyBasisPoints: number;
  }>;
  auctions: Array<{
    txid: string;
    tokenCategory: string;
    minBid: string;
    currentBid: string;
    endTime: number;
    seller: string;
  }>;
  total: number;
}

// Fetch wallet balance and NFTs from Chipnet
export async function fetchWalletData(address: string): Promise<WalletResponse | null> {
  try {
    const response = await fetch(`/api/wallet?address=${encodeURIComponent(address)}`);
    if (!response.ok) {
      const err = await response.json();
      console.error('Wallet fetch error:', err.error);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error('Network error fetching wallet:', error);
    return null;
  }
}

// Fetch all marketplace listings
export async function fetchMarketplaceListings(): Promise<MarketplaceResponse | null> {
  try {
    const response = await fetch('/api/marketplace');
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Network error fetching marketplace:', error);
    return null;
  }
}

// Fetch NFTs for an address
export async function fetchNFTs(address: string) {
  try {
    const response = await fetch(`/api/nft?address=${encodeURIComponent(address)}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Network error fetching NFTs:', error);
    return null;
  }
}

// Prepare NFT minting
export async function prepareMint(address: string, commitment: string, name: string) {
  try {
    const response = await fetch('/api/nft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, commitment, name }),
    });
    if (!response.ok) {
      const err = await response.json();
      return { success: false, error: err.error };
    }
    return await response.json();
  } catch (error) {
    return { success: false, error: 'Network error' };
  }
}

// Create a marketplace listing
export async function createListing(params: {
  sellerAddress: string;
  tokenCategory: string;
  price: string;
  royaltyBasisPoints: number;
  listingType: 'fixed' | 'auction';
}) {
  try {
    const response = await fetch('/api/marketplace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      const err = await response.json();
      return { success: false, error: err.error };
    }
    return await response.json();
  } catch (error) {
    return { success: false, error: 'Network error' };
  }
}
