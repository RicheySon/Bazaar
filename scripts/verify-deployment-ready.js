#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONTRACTS = [
  { name: 'FractionalClaims', file: 'deployment-fractional-claims.json' },
  { name: 'FractionalVault', file: 'deployment-fractional-vault.json' },
  { name: 'Marketplace', file: 'deployment-marketplace.json' },
  { name: 'Auction', file: 'deployment-auction.json' },
  { name: 'AuctionState', file: 'deployment-auction-state.json' },
  { name: 'CollectionBid', file: 'deployment-collection-bid.json' },
  { name: 'P2PKH', file: 'deployment-p2pkh.json' }
];

console.log('\n' + '='.repeat(80));
console.log('DEPLOYMENT READINESS CHECK');
console.log('='.repeat(80) + '\n');

let deployed = 0;
const addresses = [];

for (const contract of CONTRACTS) {
  const filePath = path.join(__dirname, contract.file);
  
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      console.log(`✅ ${contract.name}`);
      console.log(`   Address: ${data.address}`);
      deployed++;
      addresses.push({ name: contract.name, address: data.address });
    } catch (error) {
      console.log(`❌ ${contract.name} - Invalid deployment file`);
    }
  } else {
    console.log(`❌ ${contract.name} - Not deployed`);
  }
}

console.log('\n' + '='.repeat(80));
console.log(`STATUS: ${deployed}/7 contracts deployed`);
console.log('='.repeat(80) + '\n');

if (deployed === 7) {
  console.log('✅ ALL CONTRACTS DEPLOYED\n');
  
  console.log('TO VERIFY FUNDING:');
  console.log('1. Open Chipnet block explorer: https://chipnet.imaginary.cash/');
  console.log('2. Search for each contract address below');
  console.log('3. Check that balance > 0 satoshis\n');
  
  console.log('CONTRACT ADDRESSES TO MONITOR:\n');
  addresses.forEach((contract, i) => {
    console.log(`${i + 1}. ${contract.name}`);
    console.log(`   ${contract.address}\n`);
  });
  
  console.log('='.repeat(80));
  console.log('NEXT STEPS:');
  console.log('1. Fund each contract with ~1000 satoshis minimum');
  console.log('2. Run: npm test  (to verify contracts work)');
  console.log('3. Run: npm run dev  (to start development server)');
  console.log('='.repeat(80) + '\n');
} else {
  console.log(`⚠️  ${7 - deployed} contracts not yet deployed\n`);
}
