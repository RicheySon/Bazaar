'use client';

import { create } from 'zustand';
import type { WalletInfo } from '@/lib/types';

interface WalletState {
  wallet: WalletInfo | null;
  isConnecting: boolean;
  isModalOpen: boolean;
  mnemonic: string | null;
  showMnemonic: boolean;

  setWallet: (wallet: WalletInfo | null) => void;
  setConnecting: (connecting: boolean) => void;
  setModalOpen: (open: boolean) => void;
  setMnemonic: (mnemonic: string | null) => void;
  setShowMnemonic: (show: boolean) => void;
  disconnect: () => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  wallet: null,
  isConnecting: false,
  isModalOpen: false,
  mnemonic: null,
  showMnemonic: false,

  setWallet: (wallet) => set({ wallet }),
  setConnecting: (isConnecting) => set({ isConnecting }),
  setModalOpen: (isModalOpen) => set({ isModalOpen }),
  setMnemonic: (mnemonic) => set({ mnemonic }),
  setShowMnemonic: (showMnemonic) => set({ showMnemonic }),
  disconnect: () =>
    set({
      wallet: null,
      mnemonic: null,
      showMnemonic: false,
    }),
}));
