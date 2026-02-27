import { jest } from '@jest/globals';

// ─── Helpers ────────────────────────────────────────────────────────────────

const MOCK_RAW_HEX = 'deadbeef'.repeat(25);

function makeBuilder() {
  const b: Record<string, any> = {};
  for (const m of ['fromP2PKH', 'from', 'to', 'withTime', 'withHardcodedFee', 'withoutChange', 'withOpReturn']) {
    b[m] = jest.fn().mockReturnValue(b);
  }
  b.build = jest.fn().mockResolvedValue(MOCK_RAW_HEX);
  b.send  = jest.fn().mockResolvedValue({ txid: 'mock_txid_send' });
  return b;
}

const mockSendRawTransaction = jest.fn().mockResolvedValue('mock_txid_broadcast');

const mockProvider = {
  getUtxos: jest.fn().mockResolvedValue([
    { txid: 'a'.repeat(64), vout: 0, satoshis: 50_000n },
    { txid: 'b'.repeat(64), vout: 1, satoshis: 30_000n },
  ]),
  sendRawTransaction: mockSendRawTransaction,
  connectCluster: jest.fn().mockResolvedValue(undefined),
};

// ─── Module mocks ─────────────────────────────────────────────────────────

jest.unstable_mockModule('cashscript', () => ({
  ElectrumNetworkProvider: jest.fn().mockImplementation(() => mockProvider),
  TransactionBuilder: jest.fn().mockImplementation(() => {
    const builder: Record<string, any> = {};
    for (const m of ['addInput', 'addInputs', 'addOutput', 'setLocktime']) {
      builder[m] = jest.fn().mockReturnValue(builder);
    }
    builder.build = jest.fn().mockReturnValue(MOCK_RAW_HEX);
    return builder;
  }),
  Contract: jest.fn().mockImplementation(() => ({
    functions: {
      spend:  jest.fn().mockReturnValue(makeBuilder()),
      buy:    jest.fn().mockReturnValue(makeBuilder()),
      bid:    jest.fn().mockReturnValue(makeBuilder()),
      claim:  jest.fn().mockReturnValue(makeBuilder()),
      cancel: jest.fn().mockReturnValue(makeBuilder()),
    },
    address: 'bchtest:qmock_contract',
    getUtxos: jest.fn().mockResolvedValue([
      {
        txid: 'c'.repeat(64), vout: 0, satoshis: 1000n,
        token: { category: 'mock_category', amount: 0n, nft: { capability: 'none', commitment: '' } },
      },
    ]),
  })),
  SignatureTemplate: jest.fn().mockImplementation(() => ({
    getPublicKey: jest.fn().mockReturnValue(new Uint8Array(33).fill(2)),
  })),
  Artifact: {},
}));

jest.unstable_mockModule('@bitauth/libauth', () => ({
  cashAddressToLockingBytecode:     jest.fn().mockReturnValue({ bytecode: new Uint8Array(25) }),
  decodeCashAddress:                jest.fn().mockReturnValue({ payload: new Uint8Array(20), type: 0 }),
  lockingBytecodeToCashAddress:     jest.fn().mockReturnValue({ address: 'bchtest:qmock' }),
  addressContentsToLockingBytecode: jest.fn().mockReturnValue(new Uint8Array(25)),
  encodeTransaction:                jest.fn().mockReturnValue(new Uint8Array(200).fill(0xab)),
  decodeTransaction:                jest.fn().mockReturnValue({ inputs: [], outputs: [] }),
  binToHex:                         jest.fn().mockReturnValue('ab'.repeat(32)),
  hexToBin:                         jest.fn().mockReturnValue(new Uint8Array(32).fill(0xab)),
  LockingBytecodeType:              { P2PKH: 0 },
}));

jest.unstable_mockModule('@cashscript/utils', () => ({
  encodeNullDataScript: jest.fn().mockReturnValue(new Uint8Array(10)),
  bytecodeToScript:     jest.fn().mockReturnValue([]),
  Op:                   { OP_RETURN: 0x6a },
}));

jest.unstable_mockModule('@/lib/bch/electrum', () => ({
  getElectrumProvider:   jest.fn().mockReturnValue(mockProvider),
  resetElectrumProvider: jest.fn(),
}));

jest.unstable_mockModule('@/lib/utils', () => ({
  cidToCommitmentHex: jest.fn().mockReturnValue('ab'.repeat(36)),
  commitmentHexToCid: jest.fn().mockReturnValue('QmMockHash'),
  isHexString:        jest.fn().mockReturnValue(false),
  utf8ToHex:          jest.fn().mockReturnValue('ab'.repeat(10)),
  hexToBytes:         jest.fn().mockImplementation((h: unknown) => Buffer.from(h as string, 'hex')),
}));

jest.unstable_mockModule('@/lib/bch/listing-events', () => ({
  buildListingEventHex:             jest.fn().mockReturnValue('aabb'),
  buildBidEventHex:                 jest.fn().mockReturnValue('aabb'),
  buildStatusEventHex:              jest.fn().mockReturnValue('aabb'),
  buildCollectionBidEventHex:       jest.fn().mockReturnValue('aabb'),
  buildCollectionBidStatusEventHex: jest.fn().mockReturnValue('aabb'),
  buildPoolEventHex:                jest.fn().mockReturnValue('aabb'),
  buildPoolStatusEventHex:          jest.fn().mockReturnValue('aabb'),
  parseListingEventPayload:         jest.fn(),
  parseBidEventPayload:             jest.fn(),
  parseStatusEventPayload:          jest.fn(),
}));

jest.unstable_mockModule('@/lib/bch/server-config', () => ({
  getListingIndexAddress: jest.fn().mockReturnValue('bchtest:qmock_index'),
}));

jest.unstable_mockModule('@/lib/bch/artifacts/marketplace.json', () => ({
  default: { contractName: 'Marketplace', abi: [] },
}));
jest.unstable_mockModule('@/lib/bch/artifacts/auction.json', () => ({
  default: { contractName: 'Auction', abi: [] },
}));
jest.unstable_mockModule('@/lib/bch/artifacts/p2pkh.json', () => ({
  default: { contractName: 'P2PKH', abi: [] },
}));
jest.unstable_mockModule('@/lib/bch/artifacts/instant-sell.json', () => ({
  default: { contractName: 'InstantSellPool', abi: [] },
}));

// ─── Lazy imports (after mocks) ───────────────────────────────────────────

let mintNFT:            typeof import('../src/lib/bch/contracts').mintNFT;
let createFixedListing: typeof import('../src/lib/bch/contracts').createFixedListing;
let buyNFT:             typeof import('../src/lib/bch/contracts').buyNFT;

beforeAll(async () => {
  const mod = await import('../src/lib/bch/contracts');
  mintNFT            = mod.mintNFT;
  createFixedListing = mod.createFixedListing;
  buyNFT             = mod.buyNFT;
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe('Contracts Logic', () => {
  const mockPk      = new Uint8Array(32).fill(1);
  const mockPkh     = '00'.repeat(20);   // 20 bytes = 40 hex chars
  const mockAddress = 'bchtest:qmockaddress';

  beforeEach(() => {
    mockSendRawTransaction.mockResolvedValue('mock_txid_broadcast');
  });

  // mintNFT -----------------------------------------------------------------

  test('mintNFT: broadcasts genesis tx and returns txid + tokenCategory', async () => {
    const result = await mintNFT(
      mockPk,
      mockPkh,
      mockAddress,
      mockAddress,
      'QmMockCID',
      'none',
    );
    expect(result.success).toBe(true);
    expect(result.txid).toBe('mock_txid_broadcast');
    expect(result.tokenCategory).toBeDefined();
  });

  test('mintNFT: accepts optional drop payment output', async () => {
    const result = await mintNFT(
      mockPk,
      mockPkh,
      mockAddress,
      mockAddress,
      'QmMockCID',
      'none',
      { toAddress: 'bchtest:qcreator', amount: 10_000n },
    );
    expect(result.success).toBe(true);
    expect(result.txid).toBe('mock_txid_broadcast');
  });

  test('mintNFT: returns error when wallet has no UTXOs', async () => {
    mockProvider.getUtxos.mockResolvedValueOnce([]);
    const result = await mintNFT(mockPk, mockPkh, mockAddress, mockAddress, 'QmMock');
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  // createFixedListing ------------------------------------------------------

  test('createFixedListing: sends NFT into marketplace contract', async () => {
    const result = await createFixedListing(
      mockPk,
      'mock_category',
      { txid: 'a'.repeat(64), vout: 0, satoshis: 1000n, commitment: 'ab'.repeat(36) },
      5000n,
      mockPkh,
      500n,
      mockPkh,
      mockAddress,
    );
    expect(result.success).toBe(true);
    expect(result.txid).toBe('mock_txid_broadcast');
  });

  // buyNFT ------------------------------------------------------------------

  test('buyNFT: executes atomic swap against fixed-price listing', async () => {
    const listing: any = {
      listingType:        'fixed',
      txid:               'c'.repeat(64),
      vout:               0,
      satoshis:           1000,
      tokenCategory:      'mock_category',
      price:              5000n,
      sellerPkh:          mockPkh,
      creatorPkh:         mockPkh,
      royaltyBasisPoints: 500,
      commitment:         '',
      capability:         'none',
      sellerAddress:      'bchtest:qseller',
      creatorAddress:     'bchtest:qcreator',
    };
    const result = await buyNFT(mockPk, listing, mockAddress);
    expect(result.success).toBe(true);
    expect(result.txid).toBeDefined();
  });
});
