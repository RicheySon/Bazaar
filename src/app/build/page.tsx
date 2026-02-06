'use client';

import { useState } from 'react';
import {
  Code2, BookOpen, Terminal, Key, Copy, Check, ChevronRight,
  Zap, Shield, Package, ArrowUpRight, Play, FileCode
} from 'lucide-react';

const sdkExamples = {
  install: `npm install @bazaar/sdk`,
  init: `import { BazaarSDK } from '@bazaar/sdk';

const sdk = new BazaarSDK({
  network: 'chipnet',
  apiKey: 'your-api-key',
});`,
  listNFTs: `// Fetch all active listings
const listings = await sdk.marketplace.getListings({
  sort: 'price-low',
  limit: 50,
});

console.log(listings);
// [{ tokenCategory, price, seller, royalty, ... }]`,
  buyNFT: `// Buy an NFT via atomic swap
const tx = await sdk.marketplace.buy({
  listingId: 'abc123...',
  buyerAddress: 'bchtest:qz...',
});

console.log('TX:', tx.txid);
// Atomic swap: NFT + BCH in single tx`,
  mintNFT: `// Mint a new CashTokens NFT
const nft = await sdk.nft.mint({
  name: 'My NFT',
  image: 'ipfs://Qm...',
  royalty: 1000, // 10% in basis points
  address: 'bchtest:qz...',
});

console.log('Token:', nft.tokenCategory);`,
  createAuction: `// Create an English auction
const auction = await sdk.auction.create({
  tokenCategory: 'abc123...',
  minBid: 100000, // satoshis
  duration: 86400, // 24 hours
  royalty: 500, // 5%
});`,
};

const apiEndpoints = [
  { method: 'GET', path: '/api/wallet?address={addr}', desc: 'Get wallet balance & NFTs' },
  { method: 'GET', path: '/api/marketplace', desc: 'List all active marketplace listings' },
  { method: 'POST', path: '/api/marketplace', desc: 'Create a new listing' },
  { method: 'GET', path: '/api/nft?address={addr}', desc: 'Get NFTs owned by address' },
  { method: 'POST', path: '/api/nft', desc: 'Prepare NFT mint transaction' },
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
  const [activeTab, setActiveTab] = useState<'sdk' | 'api' | 'contracts'>('sdk');
  const [activeExample, setActiveExample] = useState<keyof typeof sdkExamples>('init');

  const tabs = [
    { id: 'sdk' as const, label: 'SDK', icon: Package },
    { id: 'api' as const, label: 'API Explorer', icon: Terminal },
    { id: 'contracts' as const, label: 'Contracts', icon: FileCode },
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
            Build on BAZAAR with our SDK, REST API, and CashScript smart contracts
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[
            { icon: Package, title: '@bazaar/sdk', desc: 'TypeScript SDK for marketplace integration', color: 'var(--accent)' },
            { icon: Terminal, title: 'REST API', desc: 'Direct HTTP access to all marketplace data', color: 'var(--accent-blue)' },
            { icon: Shield, title: 'CashScript', desc: 'Open-source smart contracts for atomic swaps', color: 'var(--accent-purple)' },
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

        {/* SDK Tab */}
        {activeTab === 'sdk' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="card p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1.5" style={{ color: 'var(--text-muted)' }}>
                  Examples
                </div>
                {([
                  ['install', 'Installation'],
                  ['init', 'Initialize SDK'],
                  ['listNFTs', 'List NFTs'],
                  ['buyNFT', 'Buy NFT'],
                  ['mintNFT', 'Mint NFT'],
                  ['createAuction', 'Create Auction'],
                ] as const).map(([key, label]) => (
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
                <div className="flex items-center gap-2 mb-2">
                  <Key className="h-3.5 w-3.5" style={{ color: 'var(--accent-orange)' }} />
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>API Key</span>
                </div>
                <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
                  Generate an API key to authenticate SDK requests
                </p>
                <button className="btn-secondary w-full text-xs py-2">Generate Key</button>
              </div>
            </div>

            {/* Code */}
            <div className="lg:col-span-3">
              <CodeBlock code={sdkExamples[activeExample]} />

              {activeExample === 'install' && (
                <div className="mt-4 card p-4">
                  <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Quick Start</h3>
                  <ol className="space-y-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <li className="flex gap-2"><span className="font-mono" style={{ color: 'var(--accent)' }}>1.</span> Install the SDK package</li>
                    <li className="flex gap-2"><span className="font-mono" style={{ color: 'var(--accent)' }}>2.</span> Initialize with your API key and network (chipnet/mainnet)</li>
                    <li className="flex gap-2"><span className="font-mono" style={{ color: 'var(--accent)' }}>3.</span> Use marketplace, nft, and auction modules</li>
                    <li className="flex gap-2"><span className="font-mono" style={{ color: 'var(--accent)' }}>4.</span> All transactions use CashScript atomic swaps</li>
                  </ol>
                </div>
              )}
            </div>
          </div>
        )}

        {/* API Explorer Tab */}
        {activeTab === 'api' && (
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
                        <button className="p-1.5 rounded-md transition-colors" style={{ color: 'var(--text-muted)' }}>
                          <Play className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Example Response</h3>
              <CodeBlock lang="json" code={`{
  "listings": [
    {
      "txid": "abc123...",
      "tokenCategory": "def456...",
      "price": "100000",
      "seller": "bchtest:qz...",
      "commitment": "...",
      "royaltyBasisPoints": 1000
    }
  ],
  "total": 1
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
                Fixed-price sale covenant with atomic swap and royalty enforcement
              </p>
              <CodeBlock lang="cashscript" code={`pragma cashscript ^0.10.0;

contract Marketplace(
  bytes20 sellerPkh,
  int price,
  bytes20 creatorPkh,
  int royaltyBasisPoints
) {
  function buy() {
    // Atomic swap: NFT to buyer,
    // BCH to seller, royalty to creator
    int royalty = price * royaltyBasisPoints / 10000;
    int sellerAmount = price - royalty;

    require(tx.outputs[1].value >= sellerAmount);
    require(tx.outputs[2].value >= royalty);
  }

  function cancel(sig s, pubkey pk) {
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
                English auction with automatic bid refunds and timelock
              </p>
              <CodeBlock lang="cashscript" code={`pragma cashscript ^0.10.0;

contract Auction(
  bytes20 sellerPkh,
  int minBid,
  int endTime,
  bytes20 creatorPkh,
  int royaltyBasisPoints,
  int minBidIncrement
) {
  function bid() {
    // Accept higher bid
    // Auto-refund previous bidder
    require(tx.time < endTime);
    // New bid must exceed current + increment
  }

  function claim() {
    // Winner claims NFT after timeout
    require(tx.time >= endTime);
    // Pay seller + royalty to creator
  }

  function reclaim(sig s, pubkey pk) {
    // Seller reclaims if no bids
    require(tx.time >= endTime);
    require(hash160(pk) == sellerPkh);
    require(checkSig(s, pk));
  }
}`} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
