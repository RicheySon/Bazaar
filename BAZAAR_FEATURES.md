# Bazaar — Feature Documentation
### Bitcoin Cash NFT Infrastructure for the Next Generation of Digital Ownership

---

## Overview

Bazaar is a full-stack NFT protocol and marketplace built natively on Bitcoin Cash, leveraging CashTokens (CHIP-2022-02) and CashScript covenants to deliver on-chain enforcement of every trade, auction, royalty distribution, and fractional ownership event. Unlike platforms that treat smart contracts as optional wrappers around off-chain logic, Bazaar encodes every economic rule directly into P2SH32 covenant scripts — meaning no intermediaries, no custodians, and no platform can alter the outcome of a transaction once it is signed.

Bazaar targets BCH's primary adoption gap: the absence of a credible, feature-complete NFT ecosystem that competes with EVM chains on UX while preserving everything that makes BCH compelling — sub-cent fees, instant finality, and genuine permissionlessness.

---

## Feature Suite

---

### 1. Fixed-Price Marketplace

**What it is**

A non-custodial NFT trading layer where sellers lock an NFT inside a CashScript covenant that encodes the sale price, seller address, creator royalty, and platform fee as bytecode constraints. The covenant script enforces all of these atomically: a buyer cannot acquire the NFT without simultaneously satisfying every output condition in the same transaction.

**How it differentiates**

On most EVM NFT markets, royalties are a social convention enforced by the marketplace UI — a secondary buyer can route around them by transacting directly with a contract. On Bazaar, royalties are a covenant constraint baked into the P2SH32 script. The sale transaction is invalid unless the creator receives their percentage. There is no UI bypass.

Listings are stored as on-chain UTXOs, not database rows. The marketplace indexer reads covenant state from Electrum — the database is a cache, not the source of truth. If Bazaar's servers go offline, every listing is still recoverable from the chain.

**BCH Adoption Impact**

Every trade that settles on Bazaar is a transaction on BCH mainnet (or Chipnet for testing) with real on-chain settlement in under 10 seconds and fees measured in fractions of a cent. This makes micro-value NFTs economically viable — a category that is structurally impossible on Ethereum L1 and requires accepting L2 tradeoffs elsewhere. Artists, collectors, and developers who have abandoned NFTs due to prohibitive gas costs have a direct migration path to Bazaar.

---

### 2. English Auction System

**What it is**

A time-locked English auction (ascending price) where each new bid, the NFT's custody, and the refund of the previous bidder all occur within a single atomic transaction enforced by the `auction.cash` covenant. The auction contract holds the NFT for the duration of the bidding window, automatically refunds the previous bidder the moment a higher bid is accepted, and distributes final proceeds to the seller, creator, and platform simultaneously upon settlement.

**How it differentiates**

On Ethereum-based auction platforms (OpenSea, Foundation), refunding an outbid participant is a separate transaction that the platform issues asynchronously. This creates exposure windows where funds are in limbo. On Bazaar, refund and new bid are the same transaction — the covenant script validates that the previous bidder's output is present before accepting the new bid. There is no "pending refund" state.

The auction contract stores current bid, bidder address, and end timestamp directly in the covenant's UTXO. No oracle, no off-chain scheduler, no cron job needed to close auctions. A winner claims the NFT by submitting a transaction after the end timestamp — the covenant verifies the time condition via BCH's nLockTime mechanism.

**BCH Adoption Impact**

English auctions are the dominant price-discovery mechanism for high-value digital art. BCH has lacked a credible auction venue. Bazaar fills this gap with a mechanism that is structurally superior to EVM implementations — no stuck refunds, no gas wars during the final seconds, and settlement fees that allow bidding to start at any price point, including sub-dollar NFTs.

---

### 3. NFT Minting & Collection Infrastructure

**What it is**

A first-class minting pipeline that takes a creator from artwork upload through IPFS pinning, CashTokens genesis transaction, and optional marketplace listing in a single guided workflow. Bazaar supports two minting modes:

- **Genesis mint**: Creates a new token category from a vout=0 UTXO (BCH protocol requirement for token genesis). Each genesis establishes a unique 32-byte category ID that becomes the permanent identifier for that NFT or collection.
- **Collection mint**: Mints child NFTs under an existing minting-capability token. A collection creator holds the minting token and can fan out individual NFTs without re-issuing the category, enabling numbered editions (e.g., "Collection #1", "#2"…) that share a provenance root.

**How it differentiates**

CashTokens NFTs store their metadata commitment (an IPFS CIDv0) directly in the on-chain NFT commitment field — no external registry, no DNS dependency, no domain that can expire. The commitment is immutable once minted. Royalties are encoded as basis points in the listing covenant at list time, not as a separate registry entry that a marketplace can choose to ignore.

Bazaar handles the vout=0 requirement (a BCH protocol constraint for genesis inputs) automatically: if the user's wallet lacks a suitable UTXO, Bazaar builds a preparatory self-send transaction, waits for its UTXO to appear on-chain, and then proceeds with the mint — seamlessly, without surfacing the protocol detail to the user.

**BCH Adoption Impact**

Lowering the technical barrier for creators to mint on BCH is a precondition for supply-side growth. Without NFT supply, there is no marketplace. Bazaar's minting pipeline abstracts every BCH-specific protocol requirement (vout=0 genesis, commitment encoding, P2SH token addresses) behind a consumer-grade UI. Creators who have only ever minted on Ethereum or Solana can onboard without reading a single protocol spec.

---

### 4. Drops — Scheduled Collection Releases

**What it is**

A full drop infrastructure for creators who want to release collections on a schedule with configurable supply caps, mint pricing, timing windows, and optional allowlist phases. A drop defines all parameters upfront — supply, price, start/end time, presale window, allowlist addresses — and Bazaar mints NFTs to buyers on demand during the live window, with proceeds flowing directly to the creator.

**How it differentiates**

Drop mechanics on most platforms are implemented as on-chain contracts with fixed bytecode. Bazaar's drop system is a hybrid: the economic enforcement (creator payment, supply cap) happens at the transaction layer, while the scheduling and allowlist logic runs server-side — enabling richer configuration (per-address mint limits, multiple pricing tiers, arbitrary windows) without bloating on-chain state.

Each minted NFT in a drop is numbered and attributed to its collection at mint time. The creator's royalty is wired into every downstream secondary listing automatically — a buyer who later lists a drop NFT on Bazaar's marketplace triggers the creator royalty covenant without any action from the creator.

**BCH Adoption Impact**

NFT drops are the most visible and traffic-generating events in the NFT ecosystem. A successful drop generates sustained secondary market activity for months. Bazaar's drop infrastructure gives BCH creators a first-class venue to coordinate community launches, which directly drives new user acquisition — each drop campaign brings the creator's audience into contact with BCH as a payment rail.

---

### 5. Fractionalized NFTs

**What it is**

A two-contract vault system that allows an NFT owner to lock their asset in an on-chain vault and receive 1,000,000 fungible share tokens (FTs) in return. These shares are standard CashTokens FTs — tradable on any compatible venue, divisible to any granularity, and redeemable against the vault's BCH pool.

The system comprises two covenants operating in concert:

- **FractionalVault**: Holds the original NFT. Accepts two unlock paths: (a) a full buyout payment at the reserve price, which releases the NFT to the buyer and routes BCH to the claims covenant; (b) a full redemption, where a holder presenting all 1,000,000 shares reclaims the original NFT.
- **FractionalClaims**: Holds the BCH proceeds from a buyout. Tracks remaining shares via a mutable NFT commitment (8-byte little-endian integer). Any shareholder can burn any quantity of shares to claim their proportional BCH from the pool.

**How it differentiates**

Fractional NFT platforms on EVM chains (Fractional.art, Tessera) use ERC-20 shares tracked by a separate registry contract, and the buyout mechanism typically requires a governance vote among shareholders. Bazaar's model is entirely covenant-driven: no governance, no vote, no DAO. The reserve price is set at fractionalization time and is immutable. Anyone with sufficient BCH can execute a buyout instantly — the covenant does not consult shareholders; it simply enforces the price and routes proceeds.

Partial claims are supported natively: a shareholder can burn any amount from 1 to their full balance and receive proportional BCH immediately. The covenant recalculates the pro-rata payout from `(burnAmount × remainingSats) / remainingShares` in-script, using BCH's native integer arithmetic. No off-chain oracle, no price feed.

The 100% redemption path allows a shareholder who accumulates the full supply to reclaim the original NFT without paying the buyout price — an exit mechanism that prevents permanent lockup of assets in vaults with no buyers.

**BCH Adoption Impact**

Fractionalization unlocks high-value NFTs for small-balance holders — a significant adoption lever in markets where premium digital art trades in the hundreds or thousands of dollars. It also introduces a new on-chain asset class (NFT-backed FTs) that is fully native to BCH and has no equivalent on competing chains at the same fee level. Every fractionalization event creates hundreds of thousands of new token UTXOs eligible for trading, which increases on-chain transaction volume and demonstrates BCH's throughput advantage.

---

### 6. Floor Sweep

**What it is**

A bulk-purchase mechanism that allows a buyer to acquire multiple fixed-price listings from the same collection in a single user action. Bazaar validates each listing's current status immediately before execution and skips listings that have already sold, protecting buyers from failed transactions.

**How it differentiates**

Floor sweep is a purely UX optimization on Bazaar — each sweep still results in individual on-chain transactions per NFT (the covenant structure requires one transaction per listing to unlock). However, Bazaar's server-side sweep route handles the sequencing, status checks, and error isolation automatically. A buyer who sweeps 10 listings and 2 have already sold receives the 8 remaining ones; no manual retry required.

On Ethereum, a multi-buy aggregator requires a wrapper contract that bundles the calls. On BCH, this is unnecessary — the latency per transaction is low enough that sequential execution with server-side orchestration achieves the same UX outcome without the contract complexity.

**BCH Adoption Impact**

Floor sweeps are a primary driver of collection-level volume spikes. When a collection's floor begins to compress, sweep activity generates rapid on-chain transaction sequences that demonstrate BCH's throughput and low-latency settlement to users who are observing it in real time. It is one of the most visible performance benchmarks for any blockchain used as an NFT settlement layer.

---

### 7. BCMR Verified Badges

**What it is**

Integration with the Bitcoin Cash Metadata Registry (BCMR) v2 standard, which allows token issuers to publish a signed JSON registry mapping their token categories to human-readable identity metadata. Bazaar fetches and caches BCMR registries server-side and displays a verification badge on collection cards and NFT detail pages when the token's category appears in a known registry.

**How it differentiates**

BCMR verification on Bazaar is not Bazaar-issued — it is protocol-level. Any creator who publishes a BCMR registry at any URL (or via DNS-record-linked registries) is automatically verifiable on Bazaar without whitelisting, application, or platform approval. The verification badge is a signal that the token category is linked to an independently maintained identity record, not that Bazaar has approved the collection.

This stands in contrast to "verified" badges on OpenSea or Rarible, which are platform-controlled and can be revoked by the marketplace operator.

**BCH Adoption Impact**

BCMR is a BCH-native standard with no equivalent on EVM chains. Supporting it on Bazaar creates an incentive for creators to publish BCMR records, which enriches the broader BCH token ecosystem beyond Bazaar itself. Every creator who publishes a BCMR record to get verified on Bazaar is also enriching every other BCH wallet, explorer, and tool that reads BCMR data.

---

### 8. Nexus SDK — Dual Wallet Architecture

**What it is**

Bazaar supports two wallet connection modes through a unified transaction-building layer:

- **Built-in wallet**: BIP39/BIP32 wallet generated in-browser, keys held in localStorage, transactions built and signed entirely client-side using CashScript and Electrum. Requires no external application.
- **WalletConnect v2**: Integration with the BCH WalletConnect stack (`@bch-wc2/web3modal-connector`), enabling users to sign transactions with any compatible BCH wallet application. Transaction parameters are constructed by Bazaar's server and handed to the wallet for signing; the wallet broadcasts the signed result.

**How it differentiates**

Most BCH NFT tools require the user to either paste a private key into a web form or use a specific wallet application. Bazaar's dual-mode architecture means a user can generate a fresh Chipnet wallet in under 10 seconds with no downloads, or connect their existing BCH wallet via WalletConnect and sign transactions without ever exposing their keys to Bazaar. Both modes produce identical on-chain outcomes.

The `buildWc*` transaction builders construct source outputs and unsigned transaction payloads that are fully compatible with the WalletConnect BCH signing protocol, including proper handling of P2SH32 covenant inputs alongside P2PKH user inputs in the same transaction.

**BCH Adoption Impact**

WalletConnect support removes the single largest friction point for existing BCH users: the requirement to manage keys in a web app. Users who hold BCH in Electron Cash, Flowee, or other WalletConnect-compatible wallets can interact with Bazaar without moving funds. This expands the accessible user base from "users willing to manage browser-held keys" to "all existing BCH users with a compatible wallet."

---

### 9. Explore — Universal NFT Discovery

**What it is**

A three-mode discovery interface that provides entry points into Bazaar's full content surface:

- **Collections**: All indexed collections with floor price, total volume, owner count, and sortable/searchable metadata.
- **Vaults**: All active fractionalized vaults with NFT image, reserve price, and share count.
- **By Wallet**: Lookup any BCH address to see all CashTokens NFTs it holds, enriched with IPFS metadata where available, with direct listing access for own-wallet NFTs.

**How it differentiates**

The By Wallet tab is a universal NFT viewer — it queries the Electrum indexer for any address, not just addresses that have interacted with Bazaar's contracts. An NFT minted with a different tool, transferred to a wallet, and never listed on Bazaar is still visible and listable from this interface. Bazaar does not gate discovery on its own marketplace activity.

The Vaults tab surfaces fractionalized assets as a distinct discovery category, recognizing that vault shares are a new asset type with different valuation mechanics than standard NFTs.

**BCH Adoption Impact**

A universal wallet viewer lowers the cost of recommending BCH NFTs to new users. Anyone can share their BCH address and direct a recipient to Bazaar's By Wallet tab to view their collection — no wallet app required, no account needed, no KYC gate. This makes Bazaar usable as a portfolio showcase, a gift verification tool, and a due-diligence interface for buyers evaluating a seller's holdings.

---

### 10. Activity Feed

**What it is**

A real-time transaction feed showing sales, listings, bids, and mints across all marketplace activity. Events are typed (Sale, Listed, Bid, Mint), time-stamped, and filterable by category.

**How it differentiates**

The activity feed derives its data entirely from on-chain covenant state and the marketplace indexer — there are no synthetic "view" events or off-chain engagement metrics. Every event in the feed corresponds to a real BCH transaction. Timestamps reflect actual block/mempool time, not server receipt time.

**BCH Adoption Impact**

Activity feeds create a social proof loop — visible transaction activity demonstrates that a marketplace is live and liquid. For a new chain entrant like BCH's NFT ecosystem, a populated activity feed is a credibility signal that reduces the "empty restaurant" problem that plagues new marketplaces.

---

### 11. Profile Pages

**What it is**

Per-address profile pages showing owned NFTs, active listings, and active auctions for any BCH address, with action capabilities (list, fractionalize) available to the address owner. Profiles are address-based — no account creation, no email, no username required.

**How it differentiates**

Profile pages on Bazaar are stateless from the server's perspective — they are assembled on demand from live Electrum queries and the marketplace index. There is no user database. Two people can open the same profile URL simultaneously and both see the same chain-derived data. Account recovery is identical to wallet recovery: restore the BIP39 mnemonic, and the full profile is instantly accessible.

**BCH Adoption Impact**

Address-based profiles mean that any BCH address — including those created years before Bazaar existed — has a Bazaar profile. This retroactively enfranchises the existing BCH holder base and creates a natural sharing surface (profile URLs) that drives organic inbound traffic from outside the BCH ecosystem.

---

## Architectural Differentiators

### On-Chain Enforcement, Not Platform Policy

Every economic rule on Bazaar — sale price, royalty percentage, auction reserve, vault reserve, claim ratio — is enforced by a CashScript covenant script compiled to BCH bytecode. Platform policy cannot override these rules. If Bazaar's servers are shut down, every active listing, auction, and vault remains claimable and enforceable by anyone who can read the chain.

### Sub-Cent Economics at Scale

A full NFT sale on Bazaar — including the marketplace covenant unlocking transaction — costs under 0.001 BCH (less than $0.0005 at current prices) in network fees. An auction with 20 bids costs under 0.02 BCH total in fees across all participants. This makes Bazaar viable for NFTs priced at any value, including sub-dollar micro-collectibles that are structurally uneconomical on every other major NFT chain.

### CashTokens-Native (No Wrapping)

Bazaar does not wrap, bridge, or abstract BCH NFTs. Every asset on the platform is a native CashTokens NFT or FT as defined by CHIP-2022-02. This means Bazaar-listed assets are visible and transferable in any CashTokens-compatible wallet without any Bazaar-specific plugin or wrapper contract.

### Developer-Extensible

The Nexus SDK exposes Bazaar's transaction-building primitives as callable functions with documented input/output shapes. Developers building BCH applications can integrate Bazaar's marketplace, minting, and auction logic without redeploying contracts — the covenant bytecode is deterministic from the input parameters, meaning any developer who calls the same builder functions gets the same contract addresses.

---

## BCH Network Adoption Case

If Bazaar is selected for continued development or grant support following the hackathon, it is positioned to address BCH's adoption gap at the asset layer — the layer where users first encounter a blockchain as more than a ledger of balance transfers.

**Supply growth**: Each creator who mints on Bazaar adds CashTokens NFTs to the BCH UTXO set, increasing on-chain token diversity and demonstrating CashTokens' production utility to developers evaluating the protocol.

**Transaction volume**: Active marketplaces, auctions, and fractionalized vault activity generate sustained on-chain transaction throughput that validates BCH's fee model and block capacity claims with real-world workloads.

**Wallet acquisition**: Bazaar's built-in wallet generator gives non-BCH users a zero-friction onramp. A creator who receives a share of Bazaar drop proceeds in their Bazaar-generated wallet has implicitly acquired a BCH address, balance, and reason to explore the broader ecosystem.

**Developer ecosystem**: The Nexus SDK and documented covenant patterns lower the cost of building BCH-native applications for developers coming from EVM environments. Every developer who forks or extends Bazaar's contracts is a developer who has learned CashScript and has working BCH contract code.

**Protocol credibility**: A production-quality NFT platform is a prerequisite for BCH to be taken seriously as a general-purpose smart contract platform. Bazaar demonstrates that CashScript covenants can implement complex multi-party financial instruments (fractionalized vaults, English auctions with auto-refund) with fees and settlement times that no competing chain can match at equivalent economic security.

---

*Built on Bitcoin Cash · Powered by CashTokens · Enforced by CashScript*
