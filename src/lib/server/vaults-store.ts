import fs from 'fs';
import path from 'path';

const VAULTS_FILE = path.join(process.cwd(), 'data', 'vaults.json');

export interface VaultRecord {
  sharesCategory: string;   // primary key (genesis input txid)
  nftCategory: string;      // original NFT token category
  nftCommitment: string;
  nftCapability: string;    // 'none' | 'mutable' | 'minting'
  reserveSats: string;      // satoshis as string
  ownerAddress: string;
  createdAt: number;        // unix timestamp seconds
}

function readVaults(): VaultRecord[] {
  try {
    if (!fs.existsSync(VAULTS_FILE)) return [];
    const raw = fs.readFileSync(VAULTS_FILE, 'utf8');
    return JSON.parse(raw) as VaultRecord[];
  } catch {
    return [];
  }
}

function writeVaults(vaults: VaultRecord[]): void {
  const dir = path.dirname(VAULTS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(VAULTS_FILE, JSON.stringify(vaults, null, 2), 'utf8');
}

export function getAllVaults(): VaultRecord[] {
  return readVaults();
}

export function getVaultByCategory(sharesCategory: string): VaultRecord | null {
  return readVaults().find((v) => v.sharesCategory === sharesCategory) ?? null;
}

/** Upsert by sharesCategory */
export function saveVault(record: VaultRecord): void {
  const vaults = readVaults();
  const idx = vaults.findIndex((v) => v.sharesCategory === record.sharesCategory);
  if (idx >= 0) {
    vaults[idx] = record;
  } else {
    vaults.push(record);
  }
  writeVaults(vaults);
}
