# Bazaar — Feature Documentation

> **Network:** Bitcoin Cash Chipnet (testnet) · **Protocol:** CashTokens (CHIP-2022-02)
> **Last updated:** Feb 24, 2026

---

## Table of Contents

1. [Nexus SDK](#1-nexus-sdk)
2. [BCMR Verified Badges](#2-bcmr-verified-badges)
3. [Floor Sweep](#3-floor-sweep)

---

## 1. Nexus SDK

### Overview

The **Nexus SDK** is a zero-dependency TypeScript client library that exposes Bazaar's
marketplace data through a clean, typed API. Any developer can embed real-time BCH NFT
floor prices, listings, and activity feeds into their own application — without touching
a blockchain node, cashscript, or Electrum directly.

### Installation

The SDK lives at `nexus-sdk/src/index.ts` and has no external dependencies.
Copy the file into your project or import it directly:

```ts
import { NexusClient } from './nexus-sdk/src';
```

For cross-origin access, pass your Bazaar deployment URL:

```ts
const nexus = new NexusClient('https://your-bazaar-deployment.vercel.app');
```

### Quick Start

```ts
import { NexusClient } from './nexus-sdk/src';

const nexus = new NexusClient();

// Get the floor price of a collection
const floor = await nexus.getFloorPrice('my-collection');
if (floor !== null) {
  console.log(`Floor: ${Number(floor) / 1e8} BCH`);
}

// Get all active fixed-price listings, cheapest first
const listings = await nexus.getListings('my-collection');
listings.forEach(l => {
  console.log(`${l.metadata?.name} — ${Number(BigInt(l.price)) / 1e8} BCH`);
});
```

### API Reference

#### `new NexusClient(baseUrl?)`

| Parameter | Type     | Default         | Description                          |
|-----------|----------|-----------------|--------------------------------------|
| `baseUrl` | `string` | `''` (same-origin) | Root URL of your Bazaar deployment |

---

#### `getCollections() → Promise<NexusCollection[]>`

Returns all NFT collections indexed by the marketplace, each with aggregate stats
(floor price, volume, supply, owner count).

```ts
const collections = await nexus.getCollections();
collections.forEach(c => {
  console.log(`${c.name}: floor ${c.floorPrice} sats, ${c.listedCount} listed`);
});
```

---

#### `getCollection(slug) → Promise<NexusCollection | null>`

Fetches a single collection by its URL slug. Returns `null` if not found.

```ts
const col = await nexus.getCollection('pixel-punks');
if (!col) throw new Error('Collection not found');
console.log(col.totalVolume); // satoshis as string
```

---

#### `getListings(slug) → Promise<NexusListing[]>`

Returns only **active fixed-price** listings for a collection, sorted cheapest first.
Auctions are excluded. Use this to build buy widgets or floor trackers.

```ts
const listings = await nexus.getListings('pixel-punks');
const cheapest = listings[0];
console.log(`Buy now: ${BigInt(cheapest.price)} sats`);
```

---

#### `getFloorPrice(slug) → Promise<bigint | null>`

Returns the current floor price in satoshis as a `bigint`. Returns `null` if the
collection has no active listings.

```ts
const floor = await nexus.getFloorPrice('pixel-punks');
// floor is bigint | null — safe for arithmetic
if (floor) {
  const bch = Number(floor) / 1e8;
  document.getElementById('floor').textContent = `${bch.toFixed(4)} BCH`;
}
```

---

#### `getListing(txid) → Promise<NexusListing | NexusAuction | null>`

Fetches a single listing or auction by its transaction ID. Returns `null` if not found
or already consumed.

```ts
const listing = await nexus.getListing('abc123...');
if (listing?.listingType === 'auction') {
  const auction = listing as NexusAuction;
  console.log(`Current bid: ${auction.currentBid} sats`);
}
```

---

#### `getActivity(slug?) → Promise<NexusActivity[]>`

Returns sold and cancelled items, sorted most-recent first.
If `slug` is omitted, returns activity across the entire marketplace.

```ts
// Collection-scoped activity feed
const activity = await nexus.getActivity('pixel-punks');

// Global activity feed
const globalActivity = await nexus.getActivity();
```

---

### Type Reference

```ts
interface NexusMetadata {
  name: string;
  description: string;
  image: string;               // ipfs:// URI
  creator?: string;
  attributes?: Array<{ trait_type: string; value: string }>;
  collection?: string;
  bcmrUrl?: string;            // BCMR registry URL for verification
  createdAt?: number;          // Unix ms
}

interface NexusListing {
  txid: string;
  tokenCategory: string;       // 32-byte hex (CashTokens category)
  price: string;               // satoshis — use BigInt(listing.price)
  seller: string;              // BCH address
  sellerPkh?: string;          // hex pubkey hash
  creator?: string;
  creatorPkh?: string;
  commitment: string;          // hex NFT commitment (decodes to IPFS CID)
  royaltyBasisPoints: number;  // 500 = 5%
  status: 'active' | 'sold' | 'cancelled';
  listingType: 'fixed' | 'auction';
  metadata?: NexusMetadata;
  createdAt?: number;
  updatedAt?: number;
}

interface NexusAuction extends NexusListing {
  listingType: 'auction';
  minBid: string;
  currentBid: string;
  endTime: number;             // Unix seconds
  minBidIncrement: string;
  currentBidder?: string;
  bidHistory: Array<{
    bidder: string;
    amount: string;
    txid: string;
    timestamp: number;
  }>;
}

interface NexusCollection {
  slug: string;
  name: string;
  image?: string;
  creatorAddress: string;
  tokenCategory?: string;
  floorPrice: string;          // satoshis
  totalVolume: string;         // satoshis
  listedCount: number;
  totalSupply: number;
  ownerCount: number;
  royaltyBasisPoints: number;
  items: Array<NexusListing | NexusAuction>;
}

interface NexusActivity {
  txid: string;
  tokenCategory: string;
  price: string;
  seller: string;
  status: 'sold' | 'cancelled';
  listingType: 'fixed' | 'auction';
  metadata?: NexusMetadata;
  updatedAt?: number;
}
```

> **Note on satoshi amounts:** All price fields are `string` to avoid JavaScript's
> `Number` precision limit at large satoshi values. Always convert with `BigInt(price)`.

### Example: Embeddable Buy Button

```ts
import { NexusClient, NexusListing } from './nexus-sdk/src';

const nexus = new NexusClient('https://bazaar-three-gamma.vercel.app');

async function renderBuyButton(slug: string, containerId: string) {
  const listings = await nexus.getListings(slug);
  if (listings.length === 0) return;

  const cheapest: NexusListing = listings[0];
  const priceInBCH = (Number(BigInt(cheapest.price)) / 1e8).toFixed(4);

  const btn = document.createElement('a');
  btn.href = `https://bazaar-three-gamma.vercel.app/nft/${cheapest.txid}`;
  btn.textContent = `Buy for ${priceInBCH} BCH`;
  btn.target = '_blank';
  document.getElementById(containerId)?.appendChild(btn);
}

renderBuyButton('pixel-punks', 'buy-widget');
```

---

## 2. BCMR Verified Badges

### Overview

**Bitcoin Cash Metadata Registry (BCMR)** is an open standard (CHIP-2022-02) that lets
token issuers publish authoritative metadata — name, icon, description, supply info —
for their CashTokens in a self-hosted or community-hosted JSON file.

Bazaar reads a collection's BCMR registry URL (stored in NFT metadata as `bcmrUrl`),
fetches the registry server-side, and displays a **Verified** badge if the collection's
`tokenCategory` appears in the registry's `identities` map.

### How It Works

```
NFT metadata.bcmrUrl
       │
       ▼
GET /api/bcmr?url=<registry_url>&category=<tokenCategory>
       │
       ├─ Validates URL is http/https (SSRF guard)
       ├─ Checks 5-minute server-side cache
       ├─ Fetches BCMR v2 JSON (8-second timeout)
       └─ Checks registry.identities[tokenCategory] (case-insensitive)
              │
              ▼
       { verified: true | false }
              │
              ▼
    <VerifiedBadge /> shown next to collection name
```

### API Endpoint

```
GET /api/bcmr?url=<registry_url>&category=<tokenCategory>
```

| Parameter  | Required | Description                                           |
|------------|----------|-------------------------------------------------------|
| `url`      | Yes      | Full URL to a BCMR v2 JSON file (`http`/`https` only) |
| `category` | No       | 32-byte hex tokenCategory to check in `identities`    |

**Response:**

```json
{
  "verified": true,
  "registry": { ... }
}
```

**Error response (HTTP 400/502):**

```json
{
  "verified": false,
  "error": "Registry fetch returned HTTP 404"
}
```

**Caching:** The server caches each registry URL for 5 minutes. Repeated calls within
that window return instantly without a network request.

### Adding BCMR to Your Collection

1. Create a BCMR v2 JSON file and host it publicly (e.g. on GitHub Pages, Cloudflare R2, or your own server):

```json
{
  "$schema": "https://cashtokens.org/bcmr-v2.schema.json",
  "version": { "major": 1, "minor": 0, "patch": 0 },
  "latestRevision": "2026-02-24T00:00:00.000Z",
  "registryIdentity": {
    "name": "My Collection Registry",
    "description": "Self-hosted registry for My Collection"
  },
  "identities": {
    "<your-32-byte-tokenCategory-hex>": {
      "2026-02-24T00:00:00.000Z": {
        "name": "My Collection",
        "description": "A BCH NFT collection.",
        "token": {
          "category": "<your-32-byte-tokenCategory-hex>",
          "symbol": "MYCOL",
          "nfts": {
            "description": "Individual NFTs in My Collection."
          }
        }
      }
    }
  }
}
```

2. When minting NFTs, include `bcmrUrl` in the metadata:

```json
{
  "name": "My NFT #1",
  "description": "...",
  "image": "ipfs://...",
  "bcmrUrl": "https://yourdomain.com/registry.json"
}
```

3. The Bazaar collection page will automatically fetch the registry and show the
   **Verified** badge next to the collection name if the tokenCategory matches.

### Badge Component

```tsx
import { VerifiedBadge } from '@/components/nft/VerifiedBadge';

// Small (default) — used in collection cards
<VerifiedBadge size="sm" />

// Medium — used on collection detail page header
<VerifiedBadge size="md" />
```

### Notes

- BCMR keys are 32-byte hex tokenCategory strings. Comparison is **case-insensitive**.
- Chipnet test tokens will not appear in mainnet public registries. Self-host your own
  BCMR file for testing.
- If the registry URL is unreachable or returns invalid JSON, the badge is simply hidden
  — no error is shown to the user.

---

## 3. Floor Sweep

### Overview

**Floor Sweep** lets collectors buy multiple NFTs from a collection in a single action.
Instead of navigating to each listing individually, users select the cheapest N items,
review a combined cost summary, and execute all purchases sequentially with live
per-item status feedback.

### User Flow

```
Collection page (active fixed-price listings exist + generated wallet connected)
        │
        ▼
  [ Sweep Mode ] button (Zap icon, above filter toolbar)
        │
        ▼
  Quick-select: [ 5 Cheapest ] [ 10 Cheapest ] [ 20 Cheapest ]
  — or —
  Click individual checkboxes on NFT cards (grid view)
  — or —
  Tick checkboxes in the table (list view)
        │
        ▼
  [ Sweep N — X.XXXX BCH ] action button appears
        │
        ▼
  ┌─────────────────────────────────┐
  │  SweepModal — Confirm phase     │
  │  ─────────────────────────────  │
  │  NFT #1  ........  0.0050 BCH   │
  │  NFT #2  ........  0.0075 BCH   │
  │  NFT #3  ........  0.0100 BCH   │
  │                                  │
  │  Total: 0.0225 BCH               │
  │  [ Sweep 3 NFTs ]               │
  └─────────────────────────────────┘
        │
        ▼
  ┌─────────────────────────────────┐
  │  SweepModal — Sweeping phase    │
  │  ─────────────────────────────  │
  │  ⟳ NFT #1  ........  0.0050 BCH │  ← currently buying
  │  ○ NFT #2  ........  0.0075 BCH │  ← pending
  │  ○ NFT #3  ........  0.0100 BCH │  ← pending
  └─────────────────────────────────┘
        │  (each completes in turn)
        ▼
  ┌─────────────────────────────────┐
  │  SweepModal — Done phase        │
  │  ─────────────────────────────  │
  │  ✓ NFT #1  ← purchased          │
  │  ✓ NFT #2  ← purchased          │
  │  ✗ NFT #3  ← Failed / Skipped   │
  │                                  │
  │  2 of 3 purchased (1 failed)    │
  │  [ Close ]                      │
  └─────────────────────────────────┘
```

### Constraints

| Constraint                 | Reason                                                      |
|----------------------------|-------------------------------------------------------------|
| Sequential purchases only  | Parallel calls would double-spend UTXOs from the same wallet |
| Fixed-price only           | Auctions require bidding logic; auction cards are dimmed    |
| Max 20 listings per sweep  | Prevents accidental large purchases                         |
| WalletConnect unsupported  | WC requires per-transaction signing UI — sweep button hidden |
| Generated wallet required  | Sweep reads the private key from localStorage at sweep start |

### API Endpoint

```
POST /api/sweep
Content-Type: application/json
```

**Request body:**

```json
{
  "listing": {
    "txid": "abc123...",
    "tokenCategory": "def456...",
    "price": "5000",
    "seller": "bchtest:qp...",
    "sellerPkh": "aabb...",
    "creator": "bchtest:qr...",
    "creatorPkh": "ccdd...",
    "commitment": "68656c6c6f",
    "royaltyBasisPoints": 500
  },
  "privateKeyHex": "0a1b2c...",
  "buyerAddress": "bchtest:qq..."
}
```

**Success response:**

```json
{
  "txid": "abc123...",
  "success": true,
  "purchaseTxid": "ff00aa..."
}
```

**Stale listing (skipped):**

```json
{
  "txid": "abc123...",
  "success": false,
  "skipped": true,
  "error": "Listing no longer active"
}
```

**Error response:**

```json
{
  "txid": "abc123...",
  "success": false,
  "error": "NFT not found in contract"
}
```

### Stale Listing Handling

Before executing a buy, the sweep route calls `getMarketplaceData()` (30-second
server-side cache) to verify the listing is still active. If a listing was sold or
cancelled between the user opening the sweep modal and clicking confirm, it is marked
as **Skipped** rather than attempted — preventing wasted transaction fees.

### SweepModal Props

```tsx
import { SweepModal } from '@/components/nft/SweepModal';

<SweepModal
  isOpen={boolean}
  onClose={() => void}           // called when user dismisses
  listings={NFTListing[]}        // pre-filtered to fixed+active
  buyerAddress={string}          // BCH address of the buyer
  onComplete={() => void}        // called after done phase closes
/>
```

The modal reads the wallet private key internally via `loadWallet()` at the moment
the user clicks "Sweep" — the key is never stored in component state or passed as a prop.

### Sweep Selection Controls

| Control              | Behaviour                                                       |
|----------------------|-----------------------------------------------------------------|
| **Sweep Mode** toggle | Enables checkboxes; clears selection on toggle off             |
| **N Cheapest**        | Selects the N lowest-price fixed listings. Only shown if at least N items exist |
| **Card overlay click** | Toggles individual selection in grid view                    |
| **Table checkbox**    | Toggles individual selection in list view                      |
| **Sweep N** button    | Opens SweepModal; only visible when ≥1 item selected           |

---

## REST API Summary

| Endpoint                          | Method | Description                                  |
|-----------------------------------|--------|----------------------------------------------|
| `/api/collections`                | GET    | All collections with stats                   |
| `/api/collections/[slug]`         | GET    | Single collection with all items             |
| `/api/marketplace`                | GET    | All listings and auctions                    |
| `/api/marketplace/[txid]`         | GET    | Single listing or auction                    |
| `/api/bcmr`                       | GET    | BCMR registry fetch + verification           |
| `/api/sweep`                      | POST   | Execute a single NFT purchase (sweep step)   |
| `/api/mint`                       | POST   | Mint a new CashToken NFT                     |
| `/api/list`                       | POST   | Create a fixed-price or auction listing      |

---

## Glossary

| Term                | Definition                                                                 |
|---------------------|----------------------------------------------------------------------------|
| **CashTokens**      | Bitcoin Cash native token protocol (CHIP-2022-02) active since May 2023   |
| **tokenCategory**   | 32-byte hex identifier for a token family; doubles as genesis UTXO txid   |
| **commitment**      | Up to 40 bytes of arbitrary data stored on-chain with an NFT UTXO         |
| **BCMR**            | Bitcoin Cash Metadata Registry — open standard for token metadata          |
| **Chipnet**         | BCH public testnet used by Bazaar                                          |
| **Floor price**     | Lowest ask price among all active fixed-price listings in a collection     |
| **Sweep**           | Buying multiple cheapest-available listings in one sequential action       |
| **royaltyBasisPoints** | Creator fee in basis points (100 = 1%, 500 = 5%) enforced by contract  |
