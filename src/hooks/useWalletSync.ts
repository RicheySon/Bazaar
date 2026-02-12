'use client';

import { useEffect } from 'react';
import { useWeb3ModalConnectorContext } from '@bch-wc2/web3modal-connector';
import { useWalletStore } from '@/lib/store/wallet-store';

/**
 * Syncs WalletConnect context state to wallet store
 */
export function useWalletSync() {
    const { address, isConnected } = useWeb3ModalConnectorContext();
    const { setWallet, setConnectionType, wallet } = useWalletStore();

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
        } else if (!isConnected && wallet?.isConnected) {
            // Clear wallet if disconnected
            setWallet(null);
            setConnectionType(null);
        }
    }, [address, isConnected, setWallet, setConnectionType, wallet]);
}
