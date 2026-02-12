'use client';

import { useEffect } from 'react';
import { useWeb3ModalConnectorContext } from '@bch-wc2/web3modal-connector';
import { useWalletStore } from '@/lib/store/wallet-store';

/**
 * Hook to sync WalletConnect context state to your app's state management
 * 
 * Usage: Call this hook at the root of your app (e.g., in layout or navbar)
 * 
 * Example:
 * ```tsx
 * export function App() {
 *   useWalletSync(); // Add this line
 *   return <YourComponents />;
 * }
 * ```
 */
export function useWalletSync() {
    const { address, isConnected } = useWeb3ModalConnectorContext();
    const { setWallet, wallet } = useWalletStore();

    useEffect(() => {
        if (isConnected && address) {
            // Only update if address changed or wallet not connected
            if (wallet?.address !== address || !wallet?.isConnected) {
                setWallet({
                    address,
                    tokenAddress: address, // BCH uses same address
                    balance: wallet?.balance || 0n,
                    isConnected: true,
                });
            }
        } else if (!isConnected && wallet?.isConnected) {
            // Clear wallet if disconnected
            setWallet(null);
        }
    }, [address, isConnected, setWallet, wallet]);
}
