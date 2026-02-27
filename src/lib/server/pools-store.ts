import fs from 'fs';
import path from 'path';
import type { LiquidityPool } from '@/lib/types';

const POOLS_FILE = path.join(process.cwd(), 'data', 'pools.json');

function readPools(): LiquidityPool[] {
  try {
    if (!fs.existsSync(POOLS_FILE)) return [];
    const raw = fs.readFileSync(POOLS_FILE, 'utf8');
    return JSON.parse(raw) as LiquidityPool[];
  } catch {
    return [];
  }
}

function writePools(pools: LiquidityPool[]): void {
  const dir = path.dirname(POOLS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(POOLS_FILE, JSON.stringify(pools, null, 2), 'utf8');
}

export function getAllPools(): LiquidityPool[] {
  return readPools();
}

export function getPoolsByCategory(tokenCategory: string): LiquidityPool[] {
  return readPools().filter((p) => p.tokenCategory === tokenCategory && p.status === 'active');
}

export function getPoolByTxid(txid: string): LiquidityPool | null {
  return readPools().find((p) => p.txid === txid) ?? null;
}

export function createPool(pool: LiquidityPool): LiquidityPool {
  const pools = readPools();
  pools.push(pool);
  writePools(pools);
  return pool;
}

export function updatePool(txid: string, updates: Partial<LiquidityPool>): LiquidityPool | null {
  const pools = readPools();
  const idx = pools.findIndex((p) => p.txid === txid);
  if (idx === -1) return null;
  pools[idx] = { ...pools[idx], ...updates, updatedAt: Date.now() };
  writePools(pools);
  return pools[idx];
}
