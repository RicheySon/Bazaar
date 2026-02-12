'use client';

import { Web3ModalConnectorContextProvider } from '@bch-wc2/web3modal-connector';
import { useEffect, useRef, useState } from 'react';

// Clear WalletConnect cached session data to prevent auto-popup
function clearWalletConnectCache() {
    if (typeof window === 'undefined') return;

    // Clear all WalletConnect related localStorage keys
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
            key.startsWith('wc@') ||
            key.startsWith('W3M') ||
            key.startsWith('wagmi') ||
            key.includes('walletconnect') ||
            key.includes('WalletConnect')
        )) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
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
        return <div className="min-h-screen" aria-hidden="true">{children}</div>;
    }

    const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

    return (
        <Web3ModalConnectorContextProvider
            config={{
                projectId,
                metadata: {
                    name: 'Your BCH App',
                    description: 'Bitcoin Cash Application',
                    url: typeof window !== 'undefined' ? window.location.origin : '',
                    icons: ['https://your-app.com/icon.png']
                }
            }}
        >
            {children}
        </Web3ModalConnectorContextProvider>
    );
}
