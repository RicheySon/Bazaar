// BCH Chipnet Network Configuration

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
} as const;

export function getExplorerTxUrl(txid: string): string {
  return `${CHIPNET_CONFIG.explorerUrl}/tx/${txid}`;
}

export function getExplorerAddressUrl(address: string): string {
  return `${CHIPNET_CONFIG.explorerUrl}/address/${address}`;
}
