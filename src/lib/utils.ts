import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortenAddress(address: string, chars = 8): string {
  if (!address) return '';
  const prefix = address.includes(':') ? address.split(':')[0] + ':' : '';
  const addr = address.includes(':') ? address.split(':')[1] : address;
  return `${prefix}${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

export function satoshisToBCH(satoshis: bigint | number): string {
  const sats = typeof satoshis === 'bigint' ? satoshis : BigInt(satoshis);
  const bch = Number(sats) / 1e8;
  return bch.toFixed(8).replace(/\.?0+$/, '') || '0';
}

export function bchToSatoshis(bch: number): bigint {
  return BigInt(Math.round(bch * 1e8));
}

export function formatBCH(satoshis: bigint | number): string {
  const bch = satoshisToBCH(satoshis);
  return `${bch} BCH`;
}

export function formatUSD(satoshis: bigint | number, pricePerBCH: number = 0): string {
  const bch = Number(typeof satoshis === 'bigint' ? satoshis : BigInt(satoshis)) / 1e8;
  return `$${(bch * pricePerBCH).toFixed(2)}`;
}

export function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function timeRemaining(endTimestamp: number): string {
  const seconds = Math.max(0, endTimestamp - Math.floor(Date.now() / 1000));
  if (seconds === 0) return 'Ended';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

export function ipfsToHttp(ipfsUri: string): string {
  if (!ipfsUri) return '/placeholder-nft.png';
  if (ipfsUri.startsWith('http')) return ipfsUri;
  const gateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY || 'https://gateway.pinata.cloud';
  const cid = ipfsUri.replace('ipfs://', '');
  return `${gateway}/ipfs/${cid}`;
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function isValidBCHAddress(address: string): boolean {
  const prefixes = ['bchtest:', 'bitcoincash:', 'bchreg:'];
  return prefixes.some((p) => address.startsWith(p)) && address.length > 20;
}
