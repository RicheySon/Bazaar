#!/usr/bin/env node
/**
 * BAZAAR Contract Funding Addresses Summary
 * BCH Chipnet - February 26, 2026
 * 
 * Use bitcoincash: format with testnet faucets
 */

const contracts = {
  'FractionalClaims': {
    address: 'bitcoincash:pd540ypmpg4sl65pggpecmddfvcanuwveaydt0qqwvcmzl9fl6vl60cw42jsa',
    description: 'Manages fractional share token claims',
    required: 1000,
    unit: 'sats'
  },
  'FractionalVault': {
    address: 'bitcoincash:p0hev5gg3vhq3zkn2jhhj8y8rq2gnlt0fz4f460vpkf56lhuvv9ly7mju5zfh',
    description: 'Holds fractionalized NFT and manages vault buyout',
    required: 1000,
    unit: 'sats'
  },
  'Marketplace': {
    address: 'bitcoincash:pwqhtec02e37qnfejja60pm72e6act2eh07xgxlwr2ls38l6ygakxghqwkz4d',
    description: 'Fixed-price NFT sales with royalties',
    required: 1000,
    unit: 'sats'
  },
  'Auction': {
    address: 'bitcoincash:pwhtpzcfvzpt0ydzqknrzwwnj7qd5sz4jsp4j4wh7tdlnh84fz59xypaw0zkh',
    description: 'Auction-based NFT sales',
    required: 1000,
    unit: 'sats'
  },
  'AuctionState': {
    address: 'bitcoincash:pwvjmx9tjl5lyw7nws0f8587tkgfsh9h65m3yuju8aqk2hgttetn5qy5e7zkz',
    description: 'Tracks auction state and bids',
    required: 1000,
    unit: 'sats'
  },
  'CollectionBid': {
    address: 'bitcoincash:pd44kq9rs2tlm7cy9ewcljajk6drpdatwdrlxmnlz87rm0wfv3y0x00dpj4qh',
    description: 'Collection-level bidding',
    required: 1000,
    unit: 'sats'
  },
  'P2PKH': {
    address: 'bitcoincash:pdl35znqhy5tals7xxe9f6v7vtcarqfa322tnd3wfk89sss75n2eqjvllsscz',
    description: 'Standard pay-to-public-key-hash',
    required: 1000,
    unit: 'sats'
  }
};

console.log('\n' + '='.repeat(80));
console.log('BAZAAR CONTRACT FUNDING ADDRESSES');
console.log('BCH Chipnet - Testnet Deployment');
console.log('='.repeat(80) + '\n');

let totalRequired = 0;

Object.entries(contracts).forEach(([name, info], index) => {
  console.log(`${index + 1}. ${name}`);
  console.log(`   Description: ${info.description}`);
  console.log(`   Address:     ${info.address}`);
  console.log(`   Required:    ${info.required} ${info.unit}\n`);
  totalRequired += info.required;
});

console.log('='.repeat(80));
console.log(`TOTAL REQUIRED: ${totalRequired} satoshis (~${(totalRequired / 100000000).toFixed(8)} BCH)`);
console.log('='.repeat(80));

console.log('\nFUNDING INSTRUCTIONS:');
console.log('1. Go to: https://tbch.googol.cash');
console.log('2. Copy each address above');
console.log('3. Paste into faucet form');
console.log('4. Request 1000+ satoshis');
console.log('5. Solve captcha if prompted');
console.log('6. Wait for confirmation (~5-10 seconds per transaction)\n');

console.log('ADDRESS FORMAT:');
console.log('✓ bitcoincash: (Recommended - try this first)');
console.log('⚠ bchtest:   (Alternative format)');
console.log('⚠ Just address (No prefix - if others fail)\n');

console.log('QUICK COPY-PASTE LIST (bitcoincash: format):');
console.log('-'.repeat(80));
Object.entries(contracts).forEach(([name, info]) => {
  console.log(info.address);
});
console.log('-'.repeat(80) + '\n');
