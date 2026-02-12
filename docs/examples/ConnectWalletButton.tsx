'use client';

import { useWeb3ModalConnectorContext } from '@bch-wc2/web3modal-connector';
import { useState } from 'react';

export function ConnectWalletButton() {
    const { address, connect, disconnect, isConnected } = useWeb3ModalConnectorContext();
    const [loading, setLoading] = useState(false);

    const shortAddress = address && address.length > 12
        ? `${address.slice(0, 10)}...${address.slice(-8)}`
        : address;

    const handleConnect = async () => {
        try {
            setLoading(true);
            await connect();
        } catch (error) {
            console.error('Failed to connect wallet:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDisconnect = async () => {
        try {
            setLoading(true);
            await disconnect();
        } catch (error) {
            console.error('Failed to disconnect wallet:', error);
            // Force clear if error
            if (typeof window !== 'undefined') {
                Object.keys(localStorage)
                    .filter(key => key.includes('walletconnect') || key.startsWith('wc@'))
                    .forEach(key => localStorage.removeItem(key));
            }
        } finally {
            setLoading(false);
        }
    };

    if (isConnected && address) {
        return (
            <div className="flex items-center gap-3">
                <span className="text-sm font-mono text-gray-700">
                    {shortAddress}
                </span>
                <button
                    onClick={handleDisconnect}
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                    {loading ? 'Disconnecting...' : 'Disconnect'}
                </button>
            </div>
        );
    }

    return (
        <button
            onClick={handleConnect}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
            {loading ? 'Connecting...' : 'Connect Wallet'}
        </button>
    );
}
