'use client';

import { useEffect } from 'react';
import { useWeb3ModalConnectorContext } from '@bch-wc2/web3modal-connector';
import { useWalletStore } from '@/lib/store/wallet-store';
import { loadWallet } from '@/lib/bch/wallet';

/**
 * Syncs WalletConnect context state to wallet store and loads generated wallets from localStorage
 */
export function useWalletSync() {
    const { address, isConnected } = useWeb3ModalConnectorContext();
    const { setWallet, setConnectionType, wallet } = useWalletStore();

    // Load wallet from localStorage on app startup
    useEffect(() => {
        if (!wallet) {
            const savedWallet = loadWallet();
            if (savedWallet) {
                setWallet({
                    address: savedWallet.address,
                    tokenAddress: savedWallet.tokenAddress,
                    balance: 0n,
                    publicKey: Array.from(savedWallet.publicKey)
                        .map(b => b.toString(16).padStart(2, '0'))
                        .join(''),
                    isConnected: true,
                });
                setConnectionType('generated');
            }
        }
    }, []); // Only run once on mount

    // Sync WalletConnect external wallet connections
    useEffect(() => {
        if (isConnected && address) {
            // Only update if address changed or wallet not connected
            if (wallet?.address !== address || !wallet?.isConnected) {
                setWallet({
                    address,
                    tokenAddress: address, // BCH uses same address
                    balance: wallet?.balance || 0n,
                    publicKey: '', // WalletConnect doesn't expose public key
                    isConnected: true,
                });
                setConnectionType('walletconnect');
            }
        } else if (!isConnected && wallet?.isConnected && wallet?.address?.startsWith('bchtest:')) {
            // Only disconnect if it was a WalletConnect wallet
            if (useWalletStore.getState().connectionType === 'walletconnect') {
                setWallet(null);
                setConnectionType(null);
            }
        }
    }, [address, isConnected, setWallet, setConnectionType, wallet]);
}
