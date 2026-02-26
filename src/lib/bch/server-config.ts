// Server-only BCH helpers that import @bitauth/libauth.
// Do NOT import this file from any 'use client' component — it will
// pull in the topLevelAwait module and crash the client bundle.

import {
    addressContentsToLockingBytecode,
    lockingBytecodeToCashAddress,
    LockingBytecodeType,
} from '@bitauth/libauth';
import { hexToBytes } from '@/lib/utils';
import { MARKETPLACE_CONFIG } from './config';

export function getListingIndexAddress(): string {
    const explicit = process.env.NEXT_PUBLIC_LISTING_INDEX_ADDRESS;
    if (explicit) return explicit;

    const network = (process.env.NEXT_PUBLIC_NETWORK as 'chipnet' | 'mainnet' | 'testnet') || 'chipnet';
    const prefix = network === 'mainnet' ? 'bitcoincash' : 'bchtest';

    const payload = hexToBytes(MARKETPLACE_CONFIG.listingIndexPkh);
    const lockingBytecode = addressContentsToLockingBytecode({
        payload,
        type: LockingBytecodeType.p2pkh,
    });

    const result = lockingBytecodeToCashAddress({
        bytecode: lockingBytecode,
        prefix,
        tokenSupport: false,
    });

    if (typeof result === 'string') return '';
    return result.address;
}
