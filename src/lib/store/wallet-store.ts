'use client';

import { create } from 'zustand';
import type { WalletInfo } from '@/lib/types';
import type { SessionTypes } from '@walletconnect/types';
import SignClient from '@walletconnect/sign-client';

type ConnectionType = 'walletconnect' | 'generated' | null;

interface WalletState {
  wallet: WalletInfo | null;
  isConnecting: boolean;
  isModalOpen: boolean;
  mnemonic: string | null;
  showMnemonic: boolean;

  // WalletConnect state
  connectionType: ConnectionType;
  wcSession: SessionTypes.Struct | null;
  wcClient: SignClient | null;

  setWallet: (wallet: WalletInfo | null) => void;
  setConnecting: (connecting: boolean) => void;
  setModalOpen: (open: boolean) => void;
  setMnemonic: (mnemonic: string | null) => void;
  setShowMnemonic: (show: boolean) => void;
  setConnectionType: (type: ConnectionType) => void;
  setWCSession: (session: SessionTypes.Struct | null) => void;
  setWCClient: (client: SignClient | null) => void;
  disconnect: () => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  wallet: null,
  isConnecting: false,
  isModalOpen: false,
  mnemonic: null,
  showMnemonic: false,
  connectionType: null,
  wcSession: null,
  wcClient: null,

  setWallet: (wallet) => set({ wallet }),
  setConnecting: (isConnecting) => set({ isConnecting }),
  setModalOpen: (isModalOpen) => set({ isModalOpen }),
  setMnemonic: (mnemonic) => set({ mnemonic }),
  setShowMnemonic: (showMnemonic) => set({ showMnemonic }),
  setConnectionType: (connectionType) => set({ connectionType }),
  setWCSession: (wcSession) => set({ wcSession }),
  setWCClient: (wcClient) => set({ wcClient }),

  disconnect: () =>
    set({
      wallet: null,
      mnemonic: null,
      showMnemonic: false,
      connectionType: null,
      wcSession: null,
      wcClient: null,
    }),
}));
