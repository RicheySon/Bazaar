'use client';

import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import * as secp256k1 from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { CHIPNET_CONFIG } from './config';

const STORAGE_KEY = 'bazaar_wallet';
const DERIVATION_PATH = "m/44'/145'/0'/0/0";

export interface WalletData {
  mnemonic: string;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  pubkeyHash: Uint8Array;
  address: string;
  tokenAddress: string;
}

// Polymod for CashAddr encoding
function polymod(values: number[]): bigint {
  const GENERATORS: bigint[] = [
    0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n,
    0xae2eabe2a8n, 0x1e4f43e470n,
  ];
  let chk = 1n;
  for (const value of values) {
    const top = chk >> 35n;
    chk = ((chk & 0x07ffffffffn) << 5n) ^ BigInt(value);
    for (let i = 0; i < 5; i++) {
      if ((top >> BigInt(i)) & 1n) {
        chk ^= GENERATORS[i];
      }
    }
  }
  return chk ^ 1n;
}

function createChecksum(prefix: string, payload: number[]): number[] {
  const prefixData = [...prefix].map((c) => c.charCodeAt(0) & 0x1f);
  const values = [...prefixData, 0, ...payload, 0, 0, 0, 0, 0, 0, 0, 0];
  const mod = polymod(values);
  const checksum: number[] = [];
  for (let i = 0; i < 8; i++) {
    checksum.push(Number((mod >> BigInt(5 * (7 - i))) & 0x1fn));
  }
  return checksum;
}

function convertBits(data: Uint8Array, fromBits: number, toBits: number, pad: boolean): number[] {
  let acc = 0;
  let bits = 0;
  const result: number[] = [];
  const maxv = (1 << toBits) - 1;

  for (const value of data) {
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((acc >> bits) & maxv);
    }
  }

  if (pad) {
    if (bits > 0) {
      result.push((acc << (toBits - bits)) & maxv);
    }
  }

  return result;
}

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function encodeCashAddress(prefix: string, type: number, hash: Uint8Array): string {
  const versionByte = type << 3; // 0 for P2PKH (160-bit hash)
  const payload = new Uint8Array([versionByte, ...hash]);
  const payloadConverted = convertBits(payload, 8, 5, true);
  const checksum = createChecksum(prefix, payloadConverted);
  const combined = [...payloadConverted, ...checksum];
  return `${prefix}:${combined.map((c) => CHARSET[c]).join('')}`;
}

function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data));
}

export function generateWallet(): WalletData {
  const mnemonic = bip39.generateMnemonic(wordlist, 128);
  return restoreWallet(mnemonic);
}

export function restoreWallet(mnemonic: string): WalletData {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const master = HDKey.fromMasterSeed(seed);
  const child = master.derive(DERIVATION_PATH);

  if (!child.privateKey || !child.publicKey) {
    throw new Error('Failed to derive keys');
  }

  const privateKey = child.privateKey;
  const publicKey = child.publicKey;
  const pubkeyHash = hash160(publicKey);

  // Encode as CashAddr (bchtest: prefix for chipnet)
  const address = encodeCashAddress(CHIPNET_CONFIG.addressPrefix, 0, pubkeyHash);

  // Token-aware address (type 2 for token-aware P2PKH)
  const tokenAddress = encodeCashAddress(CHIPNET_CONFIG.addressPrefix, 2, pubkeyHash);

  return {
    mnemonic,
    privateKey,
    publicKey,
    pubkeyHash,
    address,
    tokenAddress,
  };
}

export function validateMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(mnemonic, wordlist);
}

// Save encrypted wallet to localStorage
export function saveWallet(mnemonic: string): void {
  if (typeof window === 'undefined') return;
  // In a production app, encrypt with a password
  // For hackathon, we store as-is (Chipnet only, no real value)
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ mnemonic }));
}

// Load wallet from localStorage
export function loadWallet(): WalletData | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const { mnemonic } = JSON.parse(stored);
    return restoreWallet(mnemonic);
  } catch {
    return null;
  }
}

// Clear wallet from localStorage
export function clearWallet(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

// Get public key hash as hex string (for contract params)
export function getPkhHex(wallet: WalletData): string {
  return Array.from(wallet.pubkeyHash)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
