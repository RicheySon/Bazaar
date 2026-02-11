import { generateWallet, restoreWallet, getPkhHex } from '../src/lib/bch/wallet';

describe('Wallet Logic', () => {
    test('generateWallet creates a valid wallet', () => {
        const wallet = generateWallet();
        expect(typeof wallet.mnemonic).toBe('string');
        expect(wallet.mnemonic.split(' ').length).toBe(12);
        expect(wallet.address).toMatch(/^bchtest:q/);
    });

    test('restoreWallet recovers the same address', () => {
        const wallet1 = generateWallet();
        const wallet2 = restoreWallet(wallet1.mnemonic);

        expect(wallet1.address).toBe(wallet2.address);
        // compare private keys (Uint8Array)
        expect(Buffer.from(wallet1.privateKey).toString('hex'))
            .toBe(Buffer.from(wallet2.privateKey).toString('hex'));
    });

    test('getPkhHex returns 40-char hex string', () => {
        const wallet = generateWallet();
        const pkh = getPkhHex(wallet);

        expect(typeof pkh).toBe('string');
        expect(pkh.length).toBe(40); // 20 bytes * 2 hex chars
        expect(pkh).toMatch(/^[0-9a-f]{40}$/);
    });
});
