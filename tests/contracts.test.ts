import { jest } from '@jest/globals';

jest.unstable_mockModule('cashscript', () => {
    return {
        ElectrumNetworkProvider: jest.fn().mockImplementation(() => ({
            getUtxos: jest.fn().mockResolvedValue([
                {
                    txid: 'mock_txid_input',
                    vout: 0,
                    satoshis: 10000n,
                }
            ]),
        })),
        Contract: jest.fn().mockImplementation(() => ({
            getUtxos: jest.fn().mockResolvedValue([
                {
                    txid: 'mock_nft_utxo',
                    vout: 0,
                    satoshis: 1000n,
                    token: {
                        category: 'mock_category',
                        nft: { capability: 'none', commitment: '' }
                    }
                }
            ]),
            functions: {
                spend: jest.fn().mockReturnValue({
                    from: jest.fn().mockReturnThis(),
                    to: jest.fn().mockReturnThis(),
                    send: jest.fn().mockResolvedValue({ txid: 'mock_txid_spend' }),
                }),
                buy: jest.fn().mockReturnValue({
                    from: jest.fn().mockReturnThis(),
                    fromP2PKH: jest.fn().mockReturnThis(),
                    to: jest.fn().mockReturnThis(),
                    send: jest.fn().mockResolvedValue({ txid: 'mock_txid_buy' }),
                }),
                bid: jest.fn().mockReturnValue({
                    from: jest.fn().mockReturnThis(),
                    fromP2PKH: jest.fn().mockReturnThis(),
                    to: jest.fn().mockReturnThis(),
                    send: jest.fn().mockResolvedValue({ txid: 'mock_txid_bid' }),
                }),
                claim: jest.fn().mockReturnValue({
                    from: jest.fn().mockReturnThis(),
                    fromP2PKH: jest.fn().mockReturnThis(),
                    to: jest.fn().mockReturnThis(),
                    send: jest.fn().mockResolvedValue({ txid: 'mock_txid_claim' }),
                }),
                cancel: jest.fn().mockReturnValue({
                    from: jest.fn().mockReturnThis(),
                    to: jest.fn().mockReturnThis(),
                    send: jest.fn().mockResolvedValue({ txid: 'mock_txid_cancel' }),
                }),
            },
            address: 'mock_contract_address',
        })),
        SignatureTemplate: jest.fn().mockImplementation(() => ({
            getPublicKey: jest.fn().mockReturnValue(new Uint8Array(33)),
        })),
        Artifact: {}, // placeholder
    };
});

let mintNFT: typeof import('../src/lib/bch/contracts').mintNFT;
let createFixedListing: typeof import('../src/lib/bch/contracts').createFixedListing;
let buyNFT: typeof import('../src/lib/bch/contracts').buyNFT;

beforeAll(async () => {
    const contracts = await import('../src/lib/bch/contracts');
    mintNFT = contracts.mintNFT;
    createFixedListing = contracts.createFixedListing;
    buyNFT = contracts.buyNFT;
});

describe('Contracts Logic', () => {
    const mockPk = new Uint8Array(32).fill(1);
    const mockPkh = '00'.repeat(20);
    const mockAddress = 'bchtest:mockaddress';

    test('mintNFT sends genesis transaction', async () => {
        const result = await mintNFT(
            mockPk,
            mockPkh,
            mockAddress,
            'QmHash',
            { name: 'Test', description: 'Desc', image: 'ipfs://...' }
        );

        expect(result.success).toBe(true);
        expect(result.txid).toBe('mock_txid_spend');
        expect(result.tokenCategory).toBeDefined();
    });

    test('createFixedListing sends spend transaction to marketplace', async () => {
        const result = await createFixedListing(
            mockPk,
            'mock_category',
            { txid: 'tx1', vout: 0, satoshis: 1000n, commitment: '' },
            5000n,
            mockPkh,
            1000n,
            mockPkh
        );

        expect(result.success).toBe(true);
        expect(result.txid).toBe('mock_txid_spend');
    });

    test('buyNFT execute atomic swap', async () => {
        const listing = {
            listingType: 'fixed',
            tokenCategory: 'mock_category',
            price: 5000n,
            sellerPkh: mockPkh,
            creatorPkh: mockPkh,
            royaltyBasisPoints: 1000,
            commitment: '',
            sellerAddress: 'bchtest:seller',
            creatorAddress: 'bchtest:creator'
        } as any;

        const result = await buyNFT(mockPk, listing, mockAddress);

        expect(result.success).toBe(true);
        expect(result.txid).toBe('mock_txid_buy');
    });
});
