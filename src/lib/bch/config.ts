// BCH Chipnet Network Configuration

import {
  addressContentsToLockingBytecode,
  lockingBytecodeToCashAddress,
  LockingBytecodeType,
} from '@bitauth/libauth';
import { hexToBytes } from '@/lib/utils';

export const CHIPNET_CONFIG = {
  network: 'chipnet' as const,
  electrumHost: process.env.NEXT_PUBLIC_ELECTRUM_HOST || 'chipnet.imaginary.cash',
  electrumPort: parseInt(process.env.NEXT_PUBLIC_ELECTRUM_PORT || '50004'),
  addressPrefix: 'bchtest',
  explorerUrl: 'https://chipnet.chaingraph.cash',
  faucetUrl: 'https://tbch.googol.cash',
  derivationPath: "m/44'/145'/0'/0/0",
  dustLimit: 546n,
  defaultFee: 500n,
} as const;

export const MARKETPLACE_CONFIG = {
  feePercent: parseInt(process.env.NEXT_PUBLIC_MARKETPLACE_FEE_PERCENT || '2'),
  defaultRoyaltyPercent: parseInt(process.env.NEXT_PUBLIC_DEFAULT_ROYALTY_PERCENT || '10'),
  minPrice: 1000n, // 1000 satoshis
  maxPrice: 100000000000n, // 1000 BCH
  minAuctionDuration: 3600, // 1 hour
  maxAuctionDuration: 604800, // 7 days
  minBidIncrement: 1000n, // 1000 satoshis
  listingIndexPkh:
    process.env.NEXT_PUBLIC_LISTING_INDEX_PKH || '2222222222222222222222222222222222222222',
} as const;

// Deployed contract addresses on BCH Chipnet
// These are set via environment variables or default to null (awaiting deployment)
// To deploy contracts, follow the guide in docs/CONTRACT_DEPLOYMENT.md
export const DEPLOYED_CONTRACTS = {
  marketplace: process.env.NEXT_PUBLIC_CONTRACT_MARKETPLACE || null,
  auction: process.env.NEXT_PUBLIC_CONTRACT_AUCTION || null,
  auctionState: process.env.NEXT_PUBLIC_CONTRACT_AUCTION_STATE || null,
  collectionBid: process.env.NEXT_PUBLIC_CONTRACT_COLLECTION_BID || null,
  fractionalVault: process.env.NEXT_PUBLIC_CONTRACT_FRACTIONAL_VAULT || null,
  fractionalClaims: process.env.NEXT_PUBLIC_CONTRACT_FRACTIONAL_CLAIMS || null,
  p2pkh: process.env.NEXT_PUBLIC_CONTRACT_P2PKH || null,
};

/**
 * Get a deployed contract address
 * @param contractName - Name of the contract (e.g., 'marketplace', 'auction')
 * @returns Contract address or null if not deployed
 */
export function getDeployedContractAddress(contractName: keyof typeof DEPLOYED_CONTRACTS): string | null {
  return DEPLOYED_CONTRACTS[contractName];
}

export function getListingIndexAddress(): string {
  const explicit = process.env.NEXT_PUBLIC_LISTING_INDEX_ADDRESS;
  if (explicit) return explicit;

  const network = (process.env.NEXT_PUBLIC_NETWORK as 'chipnet' | 'mainnet' | 'testnet') || 'chipnet';
  const prefix = network === 'mainnet' ? 'bitcoincash' : 'bchtest';

  const payload = hexToBytes(MARKETPLACE_CONFIG.listingIndexPkh);
  const lockingBytecode = addressContentsToLockingBytecode({
    payload,
    type: LockingBytecodeType.p2pkh,
  });

  const result = lockingBytecodeToCashAddress({
    bytecode: lockingBytecode,
    prefix,
    tokenSupport: false,
  });

  if (typeof result === 'string') return '';
  return result.address;
}

export function getExplorerTxUrl(txid: string): string {
  return `${CHIPNET_CONFIG.explorerUrl}/tx/${txid}`;
}

export function getExplorerAddressUrl(address: string): string {
  return `${CHIPNET_CONFIG.explorerUrl}/address/${address}`;
}
