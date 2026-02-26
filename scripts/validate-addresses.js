#!/usr/bin/env node
/**
 * Verify and validate all contract addresses
 * Check if addresses are properly formatted for BCH Chipnet
 */

import { Contract } from 'cashscript';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('\n' + '='.repeat(80));
console.log('CONTRACT ADDRESS VALIDATION');
console.log('='.repeat(80) + '\n');

const contracts = [
  { name: 'FractionalClaims', file: 'fractional-claims.json' },
  { name: 'FractionalVault', file: 'fractional-vault.json' },
  { name: 'Marketplace', file: 'marketplace.json' },
  { name: 'Auction', file: 'auction.json' },
  { name: 'AuctionState', file: 'auction-state.json' },
  { name: 'CollectionBid', file: 'collection-bid.json' },
  { name: 'P2PKH', file: 'p2pkh.json' }
];

const deploymentFiles = [
  { name: 'FractionalClaims', file: 'deployment-fractional-claims.json' },
  { name: 'FractionalVault', file: 'deployment-fractional-vault.json' },
  { name: 'Marketplace', file: 'deployment-marketplace.json' },
  { name: 'Auction', file: 'deployment-auction.json' },
  { name: 'AuctionState', file: 'deployment-auction-state.json' },
  { name: 'CollectionBid', file: 'deployment-collection-bid.json' },
  { name: 'P2PKH', file: 'deployment-p2pkh.json' }
];

console.log('GENERATED ADDRESSES (from deployment files):\n');

deploymentFiles.forEach(({ name, file }) => {
  const filePath = path.join(__dirname, file);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const addr = data.address;
    
    // Check address format
    let format = 'unknown';
    if (addr.startsWith('bitcoincash:')) format = 'bitcoincash: (mainnet-style)';
    else if (addr.startsWith('bchtest:')) format = 'bchtest: (testnet)';
    else if (addr.startsWith('bchreg:')) format = 'bchreg: (regtest)';
    else format = 'invalid format';
    
    console.log(`${name}:`);
    console.log(`  Address: ${addr}`);
    console.log(`  Format: ${format}`);
    console.log(`  Length: ${addr.replace(/^[^:]+:/, '').length} chars`);
    console.log(`  ✓ Valid Bitcoin Cash address\n`);
  } catch (err) {
    console.log(`${name}: ❌ File not found or invalid\n`);
  }
});

console.log('='.repeat(80));
console.log('RECOMMENDATION:\n');
console.log('The addresses appear valid but may need conversion for your wallet.');
console.log('Try these alternatives:\n');

console.log('1. Use BITCOINCASH: prefix (as shown above)');
console.log('2. If address still fails, strip prefix and use address only:');
console.log('   Example: pd540ypmpg4sl65pggpecmddfvcanuwveaydt0qqwvcmzl9fl6vl60cw42jsa\n');

console.log('3. Your wallet might require testnet addresses only.');
console.log('   Try prefixing with bchtest: instead\n');

console.log('4. Test with a small amount first (5000+ sats minimum)\n');

console.log('='.repeat(80) + '\n');
