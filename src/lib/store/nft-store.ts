'use client';

import { create } from 'zustand';
import type { NFTListing, AuctionListing, ListingFilter, SortOption } from '@/lib/types';

interface NFTState {
  listings: NFTListing[];
  auctions: AuctionListing[];
  userNFTs: NFTListing[];
  isLoading: boolean;
  filter: ListingFilter;
  sort: SortOption;
  searchQuery: string;

  setListings: (listings: NFTListing[]) => void;
  setAuctions: (auctions: AuctionListing[]) => void;
  setUserNFTs: (nfts: NFTListing[]) => void;
  setLoading: (loading: boolean) => void;
  setFilter: (filter: ListingFilter) => void;
  setSort: (sort: SortOption) => void;
  setSearchQuery: (query: string) => void;
  addListing: (listing: NFTListing) => void;
  removeListing: (txid: string) => void;
  updateListing: (txid: string, updates: Partial<NFTListing>) => void;
}

export const useNFTStore = create<NFTState>((set) => ({
  listings: [],
  auctions: [],
  userNFTs: [],
  isLoading: true,
  filter: 'all',
  sort: 'newest',
  searchQuery: '',

  setListings: (listings) => set({ listings }),
  setAuctions: (auctions) => set({ auctions }),
  setUserNFTs: (userNFTs) => set({ userNFTs }),
  setLoading: (isLoading) => set({ isLoading }),
  setFilter: (filter) => set({ filter }),
  setSort: (sort) => set({ sort }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  addListing: (listing) =>
    set((state) => ({
      listings: [listing, ...state.listings],
    })),

  removeListing: (txid) =>
    set((state) => ({
      listings: state.listings.filter((l) => l.txid !== txid),
    })),

  updateListing: (txid, updates) =>
    set((state) => ({
      listings: state.listings.map((l) =>
        l.txid === txid ? { ...l, ...updates } : l
      ),
    })),
}));
