'use client';

import { create } from 'zustand';

interface PriceState {
  bchUsd: number;
  lastUpdated: number;
  isLoading: boolean;
  fetchPrice: () => Promise<void>;
}

export const usePriceStore = create<PriceState>((set, get) => ({
  bchUsd: 0,
  lastUpdated: 0,
  isLoading: false,

  fetchPrice: async () => {
    // Don't refetch if updated within the last 60 seconds
    const now = Date.now();
    if (now - get().lastUpdated < 60_000 && get().bchUsd > 0) return;

    set({ isLoading: true });
    try {
      const res = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin-cash&vs_currencies=usd',
        { next: { revalidate: 60 } }
      );
      if (res.ok) {
        const data = await res.json();
        const price = data?.['bitcoin-cash']?.usd;
        if (typeof price === 'number' && price > 0) {
          set({ bchUsd: price, lastUpdated: now });
        }
      }
    } catch {
      // Silently fail - USD price is a nice-to-have
    } finally {
      set({ isLoading: false });
    }
  },
}));
