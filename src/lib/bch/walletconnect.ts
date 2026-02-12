'use client';

import SignClient from '@walletconnect/sign-client';
import { SessionTypes } from '@walletconnect/types';
import { WalletConnectModal } from '@walletconnect/modal';

const PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo-project-id';

// BCH Chipnet chain configuration
const BCH_CHIPNET = {
    chainId: 'bch:chipnet',
    name: 'Bitcoin Cash Chipnet',
    methods: [
        'bch_getAddress',
        'bch_signTransaction',
        'bch_sendTransaction',
    ],
    events: ['chainChanged', 'accountsChanged'],
};

export interface WalletConnectState {
    client: SignClient | null;
    session: SessionTypes.Struct | null;
    address: string | null;
    publicKey: string | null;
}

let wcClient: SignClient | null = null;
let wcSession: SessionTypes.Struct | null = null;
let wcModal: WalletConnectModal | null = null;

/**
 * Initialize WalletConnect Modal
 */
function getModal(): WalletConnectModal {
    if (!wcModal) {
        wcModal = new WalletConnectModal({
            projectId: PROJECT_ID,
            chains: ['bch:chipnet'],
        });
    }
    return wcModal;
}

/**
 * Initialize WalletConnect SignClient
 */
export async function initWalletConnect(): Promise<SignClient> {
    if (wcClient) return wcClient;

    wcClient = await SignClient.init({
        projectId: PROJECT_ID,
        metadata: {
            name: 'Bazaar NFT Marketplace',
            description: 'BCH CashTokens NFT Marketplace',
            url: typeof window !== 'undefined' ? window.location.origin : 'https://bazaar.example.com',
            icons: ['https://bazaar.example.com/icon.png'],
        },
    });

    return wcClient;
}

/**
 * Connect to BCH wallet via WalletConnect
 */
export async function connectWallet(): Promise<WalletConnectState> {
    const client = await initWalletConnect();
    const modal = getModal();

    try {
        const { uri, approval } = await client.connect({
            requiredNamespaces: {
                bch: {
                    chains: [BCH_CHIPNET.chainId],
                    methods: BCH_CHIPNET.methods,
                    events: BCH_CHIPNET.events,
                },
            },
        });

        // Show QR Code Modal for mobile scanning
        if (uri) {
            await modal.openModal({ uri });
        }

        // Wait for wallet approval
        const session = await approval();
        wcSession = session;

        // Close QR modal
        modal.closeModal();

        // Extract address from session
        const bchAccount = session.namespaces.bch?.accounts[0];
        const address = bchAccount ? bchAccount.split(':').pop() || null : null;

        console.log('WalletConnect session established:', { address, session });

        return {
            client,
            session,
            address,
            publicKey: null, // BCH wallets don't expose pubkey via WC by default
        };
    } catch (error) {
        modal.closeModal();
        console.error('WalletConnect connection failed:', error);
        throw error;
    }
}

/**
 * Disconnect WalletConnect session
 */
export async function disconnectWallet(): Promise<void> {
    if (!wcClient || !wcSession) {
        console.warn('No active WalletConnect session to disconnect');
        return;
    }

    try {
        await wcClient.disconnect({
            topic: wcSession.topic,
            reason: {
                code: 6000,
                message: 'User disconnected',
            },
        });

        wcSession = null;
        console.log('WalletConnect session disconnected');
    } catch (error) {
        console.error('Failed to disconnect WalletConnect:', error);
        throw error;
    }
}

/**
 * Get current WalletConnect session
 */
export function getSession(): SessionTypes.Struct | null {
    return wcSession;
}

/**
 * Get current SignClient
 */
export function getClient(): SignClient | null {
    return wcClient;
}

/**
 * Request transaction signing from connected wallet
 */
export async function signTransaction(unsignedTx: string): Promise<string> {
    if (!wcClient || !wcSession) {
        throw new Error('WalletConnect not connected');
    }

    try {
        const result = await wcClient.request({
            topic: wcSession.topic,
            chainId: BCH_CHIPNET.chainId,
            request: {
                method: 'bch_signTransaction',
                params: {
                    transaction: unsignedTx,
                },
            },
        });

        return result as string;
    } catch (error) {
        console.error('Transaction signing failed:', error);
        throw error;
    }
}

/**
 * Request address from connected wallet
 */
export async function getAddress(): Promise<string> {
    if (!wcClient || !wcSession) {
        throw new Error('WalletConnect not connected');
    }

    try {
        const result = await wcClient.request({
            topic: wcSession.topic,
            chainId: BCH_CHIPNET.chainId,
            request: {
                method: 'bch_getAddress',
                params: {},
            },
        });

        return result as string;
    } catch (error) {
        console.error('Failed to get address:', error);
        throw error;
    }
}
