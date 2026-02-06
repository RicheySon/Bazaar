# BAZAAR - Non-Custodial NFT Marketplace

**Bitcoin Cash Chipnet | CashTokens | CashScript Covenants | Atomic Swaps**

A next-generation NFT marketplace built on Bitcoin Cash Chipnet featuring non-custodial trading via CashScript covenants, atomic swaps for fraud-proof transactions, on-chain English auctions with automatic bid refunds, and programmatically enforced creator royalties.

## Tech Stack

- **Blockchain**: Bitcoin Cash Chipnet (post-2026 upgrade)
- **Token Standard**: CashTokens (CHIP-2022-02) for native on-chain NFTs
- **Smart Contracts**: CashScript v0.10+ with covenants and introspection
- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS with cyberpunk glassmorphism theme
- **Animations**: Framer Motion
- **State**: Zustand
- **IPFS**: Pinata for NFT metadata storage
- **Wallet**: In-app HD wallet via @scure/bip39 + @scure/bip32
- **Network**: ElectrumNetworkProvider connecting to Chipnet

## Features

### Core Marketplace
- **Fixed-Price Listings**: Atomic swap - NFT and BCH payment in a single transaction
- **English Auctions**: Time-locked bidding with automatic refunds for outbid bidders
- **Creator Royalties**: Enforced on-chain via CashScript covenant (configurable 0-25%)
- **Non-Custodial**: User signs all transactions; keys never leave the browser

### Smart Contracts
- `contracts/marketplace.cash` - Fixed-price sale covenant with royalty enforcement
- `contracts/auction.cash` - English auction with bid refunding, timelock, and royalty splits

### UI/UX
- Cyberpunk glassmorphism design (#050505 bg, #00E545 neon green)
- Responsive mobile-first layout
- Framer Motion card animations
- Real-time polling for listing updates
- Wallet-optional view mode (browse without connecting)
- Loading skeletons and empty states

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Edit .env.local with your Pinata API key

# Start development server
npm run dev

# Open http://localhost:3000
```

## Setup Guide

### 1. Get Pinata API Key (for IPFS)
1. Create account at [pinata.cloud](https://www.pinata.cloud)
2. Generate API key (JWT)
3. Add to `.env.local` as `NEXT_PUBLIC_PINATA_JWT`

### 2. Get Chipnet tBCH (testnet coins)
1. Create wallet in the app (Connect Wallet > Create New)
2. Copy your address
3. Visit [tbch.googol.cash](https://tbch.googol.cash) to get free tBCH

### 3. Create Your First NFT
1. Go to `/create`
2. Upload artwork, set name, description, price, and royalty %
3. Click "Create & List NFT"

## Architecture

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Landing page
│   ├── explore/           # NFT marketplace gallery
│   ├── create/            # Mint & list NFTs
│   ├── nft/[id]/          # NFT detail + buy
│   ├── auction/[id]/      # Live auction + bidding
│   ├── profile/[address]/ # User profile + owned NFTs
│   └── api/               # Server-side API routes
│       ├── wallet/        # Balance & UTXO queries (Electrum)
│       ├── nft/           # NFT minting operations
│       ├── marketplace/   # Listing management
│       └── placeholder/   # Deterministic SVG generation
├── components/
│   ├── layout/            # Navbar, footer
│   ├── nft/               # NFTCard, NFTGrid
│   ├── wallet/            # WalletModal, WalletProvider
│   └── auction/           # AuctionCard, Countdown
├── lib/
│   ├── bch/               # Blockchain interaction layer
│   │   ├── api-client.ts  # Client-side API calls
│   │   ├── wallet.ts      # HD wallet (BIP39/BIP32)
│   │   ├── config.ts      # Chipnet configuration
│   │   ├── contracts.ts   # CashScript contract helpers
│   │   └── indexer.ts     # NFT indexing
│   ├── ipfs/              # Pinata IPFS integration
│   ├── store/             # Zustand state stores
│   ├── types.ts           # TypeScript interfaces
│   └── utils.ts           # Utility functions
contracts/
├── marketplace.cash       # Fixed-price sale covenant
└── auction.cash           # English auction covenant
```

## Smart Contract Design

### Marketplace (Fixed Price)
```
Marketplace(sellerPkh, price, creatorPkh, royaltyBasisPoints)
├── buy()    → Atomic swap: NFT to buyer, BCH to seller, royalty to creator
└── cancel() → Seller reclaims NFT (requires signature)
```

### Auction (English)
```
Auction(sellerPkh, minBid, endTime, creatorPkh, royaltyBasisPoints, minBidIncrement)
├── bid()     → Place higher bid, auto-refund previous bidder
├── claim()   → Winner claims NFT after timeout (pays seller + royalty)
└── reclaim() → Seller reclaims if no bids after timeout
```

## Network

- **Network**: Bitcoin Cash Chipnet
- **Electrum**: chipnet.imaginary.cash:50004
- **Explorer**: chipnet.chaingraph.cash
- **Faucet**: tbch.googol.cash
- **Address Format**: bchtest:q...

## Scripts

```bash
npm run dev    # Start development server
npm run build  # Production build
npm run start  # Start production server
```

## License

MIT
