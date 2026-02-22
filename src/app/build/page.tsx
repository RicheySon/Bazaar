'use client';

import { useState } from 'react';
import {
  Code2, BookOpen, Terminal, Copy, Check, ChevronRight,
  Zap, Shield, Package, ArrowUpRight, Play, FileCode, Globe
} from 'lucide-react';

const apiExamples = {
  fetchListings: `// Fetch all active marketplace listings
const res = await fetch('/api/marketplace');
const { listings, auctions, total } = await res.json();

// listings: NFTListing[]
// [{ txid, tokenCategory, price, sellerAddress,
//    royaltyBasisPoints, creatorAddress, metadata, status }]

// auctions: AuctionListing[]
// [{ txid, tokenCategory, minBid, currentBid,
//    endTime, minBidIncrement, ... }]

console.log(\`\${total} active listings\`);`,

  fetchCollections: `// Get all NFT collections (grouped by token category)
const res = await fetch('/api/collections');
const { collections } = await res.json();

// [{ slug, name, image, creatorAddress,
//    floorPrice, totalVolume, listedCount,
//    totalSupply, ownerCount, items[] }]

const byVolume = collections
  .sort((a, b) => Number(BigInt(b.totalVolume) - BigInt(a.totalVolume)));`,

  fetchWallet: `// Get wallet balance, UTXOs, and owned NFTs
const address = 'bchtest:qz...';
const res = await fetch(\`/api/wallet?address=\${address}\`);
const { balance, utxos, nfts } = await res.json();

// balance: number (satoshis)
// utxos: { txid, vout, satoshis }[]
// nfts: { txid, vout, satoshis, token: { category, commitment, capability } }[]

console.log(\`Balance: \${balance} sats\`);`,

  uploadFile: `// Upload an image or video file to IPFS via Pinata
const form = new FormData();
form.append('file', imageFile); // File object from <input type="file">

const res = await fetch('/api/ipfs/upload', {
  method: 'POST',
  body: form,
});
const { ipfsUri, gatewayUrl } = await res.json();
// ipfsUri: 'ipfs://QmXXX...'
// gatewayUrl: 'https://gateway.pinata.cloud/ipfs/QmXXX...'`,

  uploadMetadata: `// Upload NFT metadata JSON to IPFS
const res = await fetch('/api/ipfs/metadata', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'My NFT',
    description: 'Created on BAZAAR',
    image: 'ipfs://QmXXX...',       // required
    creator: 'bchtest:qz...',
    royalty: 1000,                  // basis points (1000 = 10%)
    collection: 'My Collection',
    attributes: [
      { trait_type: 'Rarity', value: 'Rare' },
      { trait_type: 'Color',  value: 'Gold' },
    ],
    // For video NFTs:
    animation_url: 'ipfs://QmVID...',
    mimeType: 'video/mp4',
  }),
});
const { ipfsUri } = await res.json();
// ipfsUri: 'ipfs://QmMETA...'`,

  mintNFT: `// Mint a CashTokens NFT (server-side key signing)
const res = await fetch('/api/mint', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    privateKeyHex: 'your-wif-private-key-hex',
    metadataUri: 'ipfs://QmMETA...',   // from /api/ipfs/metadata
    commitment: '',                    // optional hex (0–40 bytes)
    royaltyBasisPoints: 1000,          // 10%
    creatorAddress: 'bchtest:qz...',
  }),
});
const { txid, tokenCategory } = await res.json();
// tokenCategory is the 32-byte NFT category (= genesis txid)`,

  listNFT: `// List an NFT for fixed price or auction
const res = await fetch('/api/list', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    privateKeyHex: 'your-wif-private-key-hex',
    sellerAddress: 'bchtest:qz...',
    tokenCategory: 'abc123...',        // 32-byte hex category
    listingType: 'fixed',              // 'fixed' | 'auction'
    price: '100000',                   // satoshis (fixed price only)

    // Auction-specific fields:
    // listingType: 'auction',
    // minBid: '50000',
    // endTime: Math.floor(Date.now() / 1000) + 86400,
    // minBidIncrement: '10000',

    royaltyBasisPoints: 1000,
    creatorAddress: 'bchtest:qz...',
  }),
});
const { txid } = await res.json();`,
};

type ExampleKey = keyof typeof apiExamples;

const apiEndpoints: { method: string; path: string; desc: string; tryUrl?: string }[] = [
  { method: 'GET',  path: '/api/marketplace',         desc: 'All active fixed-price listings and auctions', tryUrl: '/api/marketplace' },
  { method: 'GET',  path: '/api/marketplace/:id',     desc: 'Single listing by txid with collection floor' },
  { method: 'GET',  path: '/api/collections',         desc: 'All collections grouped by token category',    tryUrl: '/api/collections' },
  { method: 'GET',  path: '/api/collections/:slug',   desc: 'Collection detail with all listed items' },
  { method: 'GET',  path: '/api/wallet?address={addr}', desc: 'Wallet balance, UTXOs, and owned NFTs' },
  { method: 'GET',  path: '/api/nft?address={addr}',  desc: 'CashTokens NFT UTXOs for an address' },
  { method: 'GET',  path: '/api/utxos?address={addr}', desc: 'Raw UTXO list for an address' },
  { method: 'POST', path: '/api/ipfs/upload',         desc: 'Upload image/video file to Pinata IPFS' },
  { method: 'POST', path: '/api/ipfs/metadata',       desc: 'Upload NFT metadata JSON to Pinata IPFS' },
  { method: 'POST', path: '/api/mint',                desc: 'Mint a CashTokens NFT (requires private key)' },
  { method: 'POST', path: '/api/list',                desc: 'Create a fixed-price or auction listing' },
];

function CodeBlock({ code, lang = 'typescript' }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative rounded-lg overflow-hidden" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between px-3 py-1.5" style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{lang}</span>
        <button onClick={handleCopy} className="flex items-center gap-1 text-[10px] transition-colors" style={{ color: 'var(--text-muted)' }}>
          {copied ? <><Check className="h-3 w-3" style={{ color: 'var(--accent)' }} /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
        </button>
      </div>
      <pre className="p-3 text-xs font-mono overflow-x-auto" style={{ color: 'var(--text-secondary)' }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function BuildPage() {
  const [activeTab, setActiveTab] = useState<'api' | 'contracts' | 'explorer'>('api');
  const [activeExample, setActiveExample] = useState<ExampleKey>('fetchListings');

  const tabs = [
    { id: 'api' as const,       label: 'REST API',      icon: Terminal },
    { id: 'explorer' as const,  label: 'API Explorer',  icon: Globe },
    { id: 'contracts' as const, label: 'Contracts',     icon: FileCode },
  ];

  const exampleMenu: [ExampleKey, string][] = [
    ['fetchListings',   'Fetch Listings'],
    ['fetchCollections','Fetch Collections'],
    ['fetchWallet',     'Wallet Info'],
    ['uploadFile',      'Upload File (IPFS)'],
    ['uploadMetadata',  'Upload Metadata'],
    ['mintNFT',         'Mint NFT'],
    ['listNFT',         'List NFT'],
  ];

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="mx-auto max-w-[1400px]">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Code2 className="h-5 w-5" style={{ color: 'var(--accent)' }} />
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Developer Tools</h1>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Build on BAZAAR using the REST API and open-source CashScript smart contracts
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[
            { icon: Terminal,  title: 'REST API',    desc: 'HTTP endpoints for all marketplace data and actions', color: 'var(--accent)' },
            { icon: Globe,     title: 'No Auth',     desc: 'Public read endpoints — no API key required',         color: 'var(--accent-blue)' },
            { icon: Shield,    title: 'CashScript',  desc: 'Open-source contracts for atomic swaps and auctions', color: 'var(--accent-purple)' },
          ].map(({ icon: Icon, title, desc, color }) => (
            <div key={title} className="card p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg" style={{ background: `${color}10` }}>
                  <Icon className="h-4 w-4" style={{ color }} />
                </div>
                <div>
                  <div className="text-sm font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>{title}</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{desc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1.5 mb-6">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`tab flex items-center gap-1.5 ${activeTab === id ? 'tab-active' : ''}`}>
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* REST API Tab */}
        {activeTab === 'api' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="card p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1.5" style={{ color: 'var(--text-muted)' }}>
                  Examples
                </div>
                {exampleMenu.map(([key, label]) => (
                  <button key={key} onClick={() => setActiveExample(key)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                      activeExample === key ? 'font-medium' : ''
                    }`}
                    style={{
                      color: activeExample === key ? 'var(--text-primary)' : 'var(--text-secondary)',
                      background: activeExample === key ? 'var(--bg-hover)' : 'transparent',
                    }}>
                    {label}
                  </button>
                ))}
              </div>

              <div className="card p-4 mt-4">
                <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Network</div>
                <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
                  BCH Chipnet (testnet). Get free tBCH from the faucet.
                </p>
                <a
                  href="https://tbch.googol.cash/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary w-full text-xs py-2 flex items-center justify-center gap-1"
                >
                  Chipnet Faucet <ArrowUpRight className="h-3 w-3" />
                </a>
              </div>
            </div>

            {/* Code */}
            <div className="lg:col-span-3">
              <CodeBlock code={apiExamples[activeExample]} />

              {(activeExample === 'mintNFT' || activeExample === 'listNFT') && (
                <div className="mt-4 card p-4 text-xs" style={{ borderColor: 'var(--accent-orange)', background: 'rgba(255,165,0,0.05)' }}>
                  <span className="font-semibold" style={{ color: 'var(--accent-orange)' }}>Note: </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    POST /api/mint and /api/list require a <code className="font-mono">privateKeyHex</code> field (WIF hex).
                    The BAZAAR UI stores keys encrypted in <code className="font-mono">localStorage</code>. For external
                    integrations, consider the WalletConnect flow via <code className="font-mono">POST /api/nft</code> which returns
                    an unsigned transaction for the wallet to sign.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* API Explorer Tab */}
        {activeTab === 'explorer' && (
          <div>
            <div className="card overflow-hidden">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-20">Method</th>
                    <th>Endpoint</th>
                    <th>Description</th>
                    <th className="w-20">Try</th>
                  </tr>
                </thead>
                <tbody>
                  {apiEndpoints.map((ep) => (
                    <tr key={ep.path}>
                      <td>
                        <span className={`badge ${ep.method === 'GET' ? 'badge-green' : 'badge-blue'}`}>
                          {ep.method}
                        </span>
                      </td>
                      <td>
                        <code className="text-xs font-mono" style={{ color: 'var(--text-primary)' }}>{ep.path}</code>
                      </td>
                      <td>
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{ep.desc}</span>
                      </td>
                      <td>
                        {ep.tryUrl ? (
                          <a
                            href={ep.tryUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-md transition-colors hover:text-[var(--accent)] inline-flex"
                            style={{ color: 'var(--text-muted)' }}
                            title="Open in new tab"
                          >
                            <Play className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <span className="p-1.5 inline-flex" style={{ color: 'var(--border)' }} title="Requires parameters">
                            <Play className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                GET /api/marketplace — Example Response
              </h3>
              <CodeBlock lang="json" code={`{
  "listings": [
    {
      "txid": "a1b2c3...",
      "tokenCategory": "d4e5f6...",
      "price": "100000",
      "sellerAddress": "bchtest:qz...",
      "creatorAddress": "bchtest:qz...",
      "royaltyBasisPoints": 1000,
      "listingType": "fixed",
      "status": "active",
      "metadata": {
        "name": "My NFT",
        "description": "...",
        "image": "ipfs://Qm...",
        "collection": "My Collection"
      }
    }
  ],
  "auctions": [
    {
      "txid": "b2c3d4...",
      "tokenCategory": "e5f6a7...",
      "minBid": "50000",
      "currentBid": "75000",
      "endTime": 1740000000,
      "minBidIncrement": "10000",
      "listingType": "auction",
      "status": "active"
    }
  ],
  "total": 2
}`} />
            </div>
          </div>
        )}

        {/* Contracts Tab */}
        {activeTab === 'contracts' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileCode className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>marketplace.cash</h3>
              </div>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                Fixed-price sale covenant. Atomic swap: NFT to buyer, BCH to seller, royalty to creator — enforced on-chain.
              </p>
              <CodeBlock lang="cashscript" code={`// BAZAAR - Fixed Price NFT Marketplace Contract
// BCH Chipnet - CashScript v0.10+
// Atomic swap: NFT for BCH with enforced creator royalties

pragma cashscript >=0.10.0;

contract Marketplace(
    bytes20 sellerPkh,
    int price,
    bytes20 creatorPkh,
    int royaltyBasisPoints
) {
    // Anyone can buy the listed NFT by paying the correct price
    // Enforces: seller gets paid, creator gets royalty, NFT transfers to buyer
    function buy() {
        // Calculate royalty and seller proceeds
        int royaltyAmount = price * royaltyBasisPoints / 10000;
        int sellerAmount = price - royaltyAmount;

        // Output 0: Seller receives payment minus royalty
        bytes25 sellerLockingBytecode = new LockingBytecodeP2PKH(sellerPkh);
        require(tx.outputs[0].lockingBytecode == sellerLockingBytecode);
        require(tx.outputs[0].value >= sellerAmount);

        // Output 1: Creator receives royalty payment
        bytes25 creatorLockingBytecode = new LockingBytecodeP2PKH(creatorPkh);
        require(tx.outputs[1].lockingBytecode == creatorLockingBytecode);
        require(tx.outputs[1].value >= royaltyAmount);

        // Output 2: NFT goes to buyer (token category must be preserved)
        require(
            tx.outputs[2].tokenCategory
            == tx.inputs[this.activeInputIndex].tokenCategory
        );
    }

    // Seller can cancel the listing and reclaim their NFT
    function cancel(pubkey pk, sig s) {
        require(hash160(pk) == sellerPkh);
        require(checkSig(s, pk));
    }
}`} />
            </div>

            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileCode className="h-4 w-4" style={{ color: 'var(--accent-purple)' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>auction.cash</h3>
              </div>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                English auction with automatic bid refunds, timelock enforcement, and royalty payout on claim.
              </p>
              <CodeBlock lang="cashscript" code={`// BAZAAR - English Auction Contract
// BCH Chipnet - CashScript v0.10+
// NFT auction with automatic bid refunds, timelock, and royalties

pragma cashscript >=0.10.0;

contract Auction(
    bytes20 sellerPkh,
    int minBid,
    int endTime,
    bytes20 creatorPkh,
    int royaltyBasisPoints,
    int minBidIncrement
) {
    // Place a new bid — previous bidder is auto-refunded
    function bid(int currentBidAmount, bytes20 previousBidderPkh) {
        int newBidAmount = tx.outputs[0].value;
        if (currentBidAmount > 0) {
            require(newBidAmount >= currentBidAmount + minBidIncrement);
        } else {
            require(newBidAmount >= minBid);
        }
        // Contract UTXO is recreated with the new bid (NFT stays in contract)
        require(tx.outputs[0].lockingBytecode
            == tx.inputs[this.activeInputIndex].lockingBytecode);
        require(tx.outputs[0].tokenCategory
            == tx.inputs[this.activeInputIndex].tokenCategory);
        // Refund previous bidder
        if (currentBidAmount > 0) {
            bytes25 prevLock = new LockingBytecodeP2PKH(previousBidderPkh);
            require(tx.outputs[1].lockingBytecode == prevLock);
            require(tx.outputs[1].value >= currentBidAmount);
        }
    }

    // Winner claims NFT after auction ends
    function claim(int finalBidAmount) {
        require(tx.time >= endTime);
        require(finalBidAmount >= minBid);
        int royaltyAmount = finalBidAmount * royaltyBasisPoints / 10000;
        int sellerAmount  = finalBidAmount - royaltyAmount;
        bytes25 sellerLock  = new LockingBytecodeP2PKH(sellerPkh);
        bytes25 creatorLock = new LockingBytecodeP2PKH(creatorPkh);
        require(tx.outputs[0].lockingBytecode == sellerLock);
        require(tx.outputs[0].value >= sellerAmount);
        require(tx.outputs[1].lockingBytecode == creatorLock);
        require(tx.outputs[1].value >= royaltyAmount);
        require(tx.outputs[2].tokenCategory
            == tx.inputs[this.activeInputIndex].tokenCategory);
    }

    // Seller reclaims NFT if no bids after auction ends
    function reclaim(pubkey pk, sig s) {
        require(hash160(pk) == sellerPkh);
        require(checkSig(s, pk));
        require(tx.time >= endTime);
    }
}`} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
