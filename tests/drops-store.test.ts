import { jest } from '@jest/globals';
import type { NFTDrop } from '../src/lib/types';

// ─── In-memory DB (shared across mock & tests via closure) ──────────────────

const mockDropsDb: NFTDrop[] = [];

// Mock node:fs — must export `default` for ESM `import fs from 'fs'`
jest.unstable_mockModule('fs', () => {
  const fsMock = {
    existsSync:    jest.fn(() => true),
    readFileSync:  jest.fn(() => JSON.stringify(mockDropsDb)),
    writeFileSync: jest.fn((_path: unknown, data: unknown) => {
      const parsed = JSON.parse(data as string) as NFTDrop[];
      mockDropsDb.length = 0;
      parsed.forEach(d => mockDropsDb.push(d));
    }),
    mkdirSync: jest.fn(),
  };
  // `default` is required when the source uses `import fs from 'fs'` in ESM mode
  return { default: fsMock, ...fsMock };
});

// ─── Lazy imports ─────────────────────────────────────────────────────────────

let getDropStatus:           typeof import('../src/lib/server/drops-store').getDropStatus;
let makeDropSlug:            typeof import('../src/lib/server/drops-store').makeDropSlug;
let getAllDrops:              typeof import('../src/lib/server/drops-store').getAllDrops;
let createDrop:              typeof import('../src/lib/server/drops-store').createDrop;
let getDropBySlug:           typeof import('../src/lib/server/drops-store').getDropBySlug;
let validateMintEligibility: typeof import('../src/lib/server/drops-store').validateMintEligibility;
let recordMint:              typeof import('../src/lib/server/drops-store').recordMint;

beforeAll(async () => {
  const mod = await import('../src/lib/server/drops-store');
  getDropStatus           = mod.getDropStatus;
  makeDropSlug            = mod.makeDropSlug;
  getAllDrops              = mod.getAllDrops;
  createDrop              = mod.createDrop;
  getDropBySlug           = mod.getDropBySlug;
  validateMintEligibility = mod.validateMintEligibility;
  recordMint              = mod.recordMint;
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NOW = Math.floor(Date.now() / 1000);

function makeDrop(overrides: Partial<NFTDrop> = {}): NFTDrop {
  return {
    id:                    'test-id',
    slug:                  'test-drop',
    name:                  'Test Drop',
    description:           'A test NFT drop',
    bannerImage:           'ipfs://QmTest',
    creatorAddress:        'bchtest:qcreator',
    royaltyBasisPoints:    500,
    totalSupply:           100,
    mintedCount:           0,
    mintPrice:             '1000000',
    mintStartTime:         NOW - 60,   // started 1 min ago
    whitelistEnabled:      false,
    maxPerWallet:          5,
    collectionName:        'Test Collection',
    metadataDescription:   'Test NFT',
    attributes:            [],
    mintedBy:              {},
    mintedTokenCategories: [],
    createdAt:             NOW - 3600,
    ...overrides,
  };
}

// ─── getDropStatus ────────────────────────────────────────────────────────────

describe('getDropStatus', () => {
  test('live when past mintStartTime', () => {
    expect(getDropStatus(makeDrop())).toBe('live');
  });

  test('upcoming when mintStartTime is in the future', () => {
    expect(getDropStatus(makeDrop({ mintStartTime: NOW + 3600 }))).toBe('upcoming');
  });

  test('presale during whitelist window (before public mint)', () => {
    const drop = makeDrop({
      whitelistEnabled:   true,
      whitelistStartTime: NOW - 60,
      mintStartTime:      NOW + 3600,
    });
    expect(getDropStatus(drop)).toBe('presale');
  });

  test('sold-out when mintedCount >= totalSupply', () => {
    expect(getDropStatus(makeDrop({ mintedCount: 100, totalSupply: 100 }))).toBe('sold-out');
  });

  test('ended when past optional mintEndTime', () => {
    expect(getDropStatus(makeDrop({ mintEndTime: NOW - 60 }))).toBe('ended');
  });
});

// ─── makeDropSlug ─────────────────────────────────────────────────────────────

describe('makeDropSlug', () => {
  test('lowercases and kebab-cases the name', () => {
    expect(makeDropSlug('Bazaar Punks Gen 1')).toMatch(/^bazaar-punks-gen-1/);
  });

  test('strips special characters', () => {
    expect(makeDropSlug('My NFT! @Drop')).toMatch(/^my-nft-drop/);
  });

  test('returns unique slugs for the same name', async () => {
    const s1 = makeDropSlug('Same');
    await new Promise(r => setTimeout(r, 2));
    const s2 = makeDropSlug('Same');
    expect(s1).not.toBe(s2);
  });
});

// ─── createDrop / getAllDrops / getDropBySlug ─────────────────────────────────

describe('CRUD operations', () => {
  beforeEach(() => { mockDropsDb.length = 0; });

  test('createDrop stores the drop; getAllDrops returns it with status', () => {
    createDrop(makeDrop());
    const all = getAllDrops();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('test-id');
    expect(all[0].status).toBeDefined();
  });

  test('getDropBySlug finds the right drop', () => {
    createDrop(makeDrop());
    expect(getDropBySlug('test-drop')?.name).toBe('Test Drop');
  });

  test('getDropBySlug returns null for unknown slug', () => {
    expect(getDropBySlug('nope')).toBeNull();
  });
});

// ─── validateMintEligibility ──────────────────────────────────────────────────

describe('validateMintEligibility', () => {
  test('returns null (ok) when drop is live and within limits', () => {
    expect(validateMintEligibility(makeDrop(), 'bchtest:qbuyer', 1)).toBeNull();
  });

  test('error when drop is upcoming', () => {
    const drop = makeDrop({ mintStartTime: NOW + 3600 });
    expect(validateMintEligibility(drop, 'bchtest:qbuyer', 1)).toBeTruthy();
  });

  test('error when sold out', () => {
    const drop = makeDrop({ mintedCount: 100, totalSupply: 100 });
    expect(validateMintEligibility(drop, 'bchtest:qbuyer', 1)).toBeTruthy();
  });

  test('error when wallet hit maxPerWallet', () => {
    const drop = makeDrop({ mintedBy: { 'bchtest:qbuyer': 5 }, maxPerWallet: 5 });
    expect(validateMintEligibility(drop, 'bchtest:qbuyer', 1)).toBeTruthy();
  });

  test('error for non-allowlisted address during presale', () => {
    const drop = makeDrop({
      whitelistEnabled:   true,
      whitelistStartTime: NOW - 60,
      mintStartTime:      NOW + 3600,
      whitelistAddresses: ['bchtest:qwhitelisted'],
    });
    expect(validateMintEligibility(drop, 'bchtest:qstranger', 1)).toBeTruthy();
  });

  test('ok for allowlisted address during presale', () => {
    const drop = makeDrop({
      whitelistEnabled:   true,
      whitelistStartTime: NOW - 60,
      mintStartTime:      NOW + 3600,
      whitelistAddresses: ['bchtest:qwhitelisted'],
    });
    expect(validateMintEligibility(drop, 'bchtest:qwhitelisted', 1)).toBeNull();
  });

  test('error when quantity exceeds remaining supply', () => {
    const drop = makeDrop({ mintedCount: 99, totalSupply: 100 });
    expect(validateMintEligibility(drop, 'bchtest:qbuyer', 2)).toBeTruthy();
  });
});

// ─── recordMint ───────────────────────────────────────────────────────────────

describe('recordMint', () => {
  beforeEach(() => {
    mockDropsDb.length = 0;
    createDrop(makeDrop());
  });

  test('increments mintedCount and returns sequential nftNumber', () => {
    const res = recordMint('test-id', 'bchtest:qbuyer', 'cat1');
    expect(res).not.toBeNull();
    expect(res!.nftNumber).toBe(1);
    expect(res!.drop.mintedCount).toBe(1);
  });

  test('increments per-address count in mintedBy', () => {
    recordMint('test-id', 'bchtest:qbuyer', 'cat1');
    recordMint('test-id', 'bchtest:qbuyer', 'cat2');
    expect(getDropBySlug('test-drop')!.mintedBy['bchtest:qbuyer']).toBe(2);
  });

  test('records the tokenCategory in mintedTokenCategories', () => {
    recordMint('test-id', 'bchtest:qbuyer', 'mycategory');
    expect(getDropBySlug('test-drop')!.mintedTokenCategories).toContain('mycategory');
  });

  test('returns null for unknown dropId', () => {
    expect(recordMint('nonexistent', 'bchtest:qbuyer', 'cat')).toBeNull();
  });
});
