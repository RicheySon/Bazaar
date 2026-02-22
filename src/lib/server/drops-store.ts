import fs from 'fs';
import path from 'path';
import type { NFTDrop, DropStatus } from '@/lib/types';

const DROPS_FILE = path.join(process.cwd(), 'data', 'drops.json');

function readDrops(): NFTDrop[] {
  try {
    if (!fs.existsSync(DROPS_FILE)) return [];
    const raw = fs.readFileSync(DROPS_FILE, 'utf8');
    return JSON.parse(raw) as NFTDrop[];
  } catch {
    return [];
  }
}

function writeDrops(drops: NFTDrop[]): void {
  const dir = path.dirname(DROPS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DROPS_FILE, JSON.stringify(drops, null, 2), 'utf8');
}

export function getDropStatus(drop: NFTDrop): DropStatus {
  const now = Math.floor(Date.now() / 1000);
  if (drop.mintedCount >= drop.totalSupply) return 'sold-out';
  if (drop.mintEndTime && now >= drop.mintEndTime) return 'ended';
  if (now >= drop.mintStartTime) return 'live';
  if (
    drop.whitelistEnabled &&
    drop.whitelistStartTime &&
    now >= drop.whitelistStartTime
  )
    return 'presale';
  return 'upcoming';
}

export function makeDropSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .slice(0, 40);
  // append short timestamp suffix to guarantee uniqueness
  return `${base}-${Date.now().toString(36)}`;
}

export function getAllDrops(): (NFTDrop & { status: DropStatus })[] {
  return readDrops().map((d) => ({ ...d, status: getDropStatus(d) }));
}

export function getDropBySlug(slug: string): (NFTDrop & { status: DropStatus }) | null {
  const drop = readDrops().find((d) => d.slug === slug);
  if (!drop) return null;
  return { ...drop, status: getDropStatus(drop) };
}

export function getDropById(id: string): (NFTDrop & { status: DropStatus }) | null {
  const drop = readDrops().find((d) => d.id === id);
  if (!drop) return null;
  return { ...drop, status: getDropStatus(drop) };
}

export function createDrop(drop: NFTDrop): NFTDrop {
  const drops = readDrops();
  drops.push(drop);
  writeDrops(drops);
  return drop;
}

export function updateDrop(id: string, updates: Partial<NFTDrop>): NFTDrop | null {
  const drops = readDrops();
  const idx = drops.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  drops[idx] = { ...drops[idx], ...updates };
  writeDrops(drops);
  return drops[idx];
}

/**
 * Record a successful mint against the drop, returning the NFT's sequential number.
 * Atomically increments mintedCount and mintedBy[address].
 */
export function recordMint(
  dropId: string,
  buyerAddress: string,
  tokenCategory: string,
): { nftNumber: number; drop: NFTDrop } | null {
  const drops = readDrops();
  const idx = drops.findIndex((d) => d.id === dropId);
  if (idx === -1) return null;

  const drop = drops[idx];
  const nftNumber = drop.mintedCount + 1;

  drop.mintedCount = nftNumber;
  drop.mintedBy[buyerAddress] = (drop.mintedBy[buyerAddress] ?? 0) + 1;
  drop.mintedTokenCategories = [...(drop.mintedTokenCategories ?? []), tokenCategory];

  drops[idx] = drop;
  writeDrops(drops);
  return { nftNumber, drop };
}

/**
 * Validate whether a mint attempt is allowed.
 * Returns null on success, or an error string.
 */
export function validateMintEligibility(
  drop: NFTDrop,
  buyerAddress: string,
  quantity: number,
): string | null {
  const status = getDropStatus(drop);

  if (status === 'sold-out') return 'This drop is sold out.';
  if (status === 'ended') return 'This drop has ended.';
  if (status === 'upcoming') return 'The public mint has not opened yet.';

  if (status === 'presale') {
    const wl = drop.whitelistAddresses ?? [];
    if (!wl.includes(buyerAddress)) {
      return 'Pre-sale is for allowlist members only. Public mint opens later.';
    }
  }

  const alreadyMinted = drop.mintedBy[buyerAddress] ?? 0;
  if (alreadyMinted + quantity > drop.maxPerWallet) {
    return `Wallet limit reached. You can mint at most ${drop.maxPerWallet} NFT(s) per wallet (already minted: ${alreadyMinted}).`;
  }

  if (drop.mintedCount + quantity > drop.totalSupply) {
    return `Only ${drop.totalSupply - drop.mintedCount} NFT(s) remaining.`;
  }

  return null;
}
