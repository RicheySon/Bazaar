'use client';

import { Web3ModalConnectorContextProvider } from '@bch-wc2/web3modal-connector';
import { useEffect, useRef, useState } from 'react';

// Clear WalletConnect cached session data to prevent auto-popup
async function clearWalletConnectCache() {
    if (typeof window === 'undefined') return;

    const wcDebug = process.env.NEXT_PUBLIC_WC_DEBUG === 'true';
    if (wcDebug) {
        console.log('[WalletProvider] Clearing WalletConnect cache...');
    }

    // Clear all WalletConnect related localStorage keys
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
            key.startsWith('wc@') ||
            key.startsWith('W3M') ||
            key.startsWith('wagmi') ||
            key.includes('walletconnect') ||
            key.includes('WalletConnect') ||
            key === 'Web3ModalConnector'
        )) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));

    // Clear IndexedDB for WalletConnect
    try {
        if (window.indexedDB && window.indexedDB.databases) {
            const dbs = await window.indexedDB.databases();
            for (const db of dbs) {
                if (db.name && (db.name.includes('walletconnect') || db.name.includes('wc@'))) {
                    if (wcDebug) {
                        console.log(`[WalletProvider] Deleting IndexedDB: ${db.name}`);
                    }
                    window.indexedDB.deleteDatabase(db.name);
                }
            }
        }
    } catch (e) {
        if (wcDebug) {
            console.error('[WalletProvider] Failed to clear IndexedDB:', e);
        }
    }
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
    const [mounted, setMounted] = useState(false);
    const clearedRef = useRef(false);

    useEffect(() => {
        // Clear cache only once on the client
        if (!clearedRef.current) {
            clearWalletConnectCache();
            clearedRef.current = true;
        }
        setMounted(true);
    }, []);

    // Prevent hydration issues and don't render provider until mounted
    if (!mounted) {
        return <div className="min-h-screen bg-black" aria-hidden="true">{children}</div>;
    }

    const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'b89a472ca74470463e1c16f3f6bfba4f';

    return (
        <Web3ModalConnectorContextProvider
            config={{
                projectId,
                metadata: {
                    name: 'Bazaar',
                    description: 'The Liquidity Layer of Bitcoin Cash — Instant Sell, Order Book, AMM Pools',
                    url: typeof window !== 'undefined' ? window.location.origin : 'https://bazaar.cash',
                    icons: [typeof window !== 'undefined' ? `${window.location.origin}/icon.svg` : 'https://bazaar.cash/icon.svg'],
                },
                // Explicitly set network to Chipnet (bchtest)
                useChipnet: true
            }}
        >
            {children}
        </Web3ModalConnectorContextProvider>
    );
}
