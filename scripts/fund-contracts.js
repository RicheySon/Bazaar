#!/usr/bin/env node
/**
 * BAZAAR Contract Funding Script
 * Uses your wallet to fund deployed contracts
 * 
 * Usage: node scripts/fund-contracts.js <wallet-address>
 */

const walletAddress = process.argv[2] || 'bchtest:qqrlp7yke0afqctq9hkg8p7gt6dcz8n49qe4gnc4el';

const contractAddresses = {
  'FractionalClaims': 'bitcoincash:pd540ypmpg4sl65pggpecmddfvcanuwveaydt0qqwvcmzl9fl6vl60cw42jsa',
  'FractionalVault': 'bitcoincash:p0hev5gg3vhq3zkn2jhhj8y8rq2gnlt0fz4f460vpkf56lhuvv9ly7mju5zfh',
  'Marketplace': 'bitcoincash:pwqhtec02e37qnfejja60pm72e6act2eh07xgxlwr2ls38l6ygakxghqwkz4d',
  'Auction': 'bitcoincash:pwhtpzcfvzpt0ydzqknrzwwnj7qd5sz4jsp4j4wh7tdlnh84fz59xypaw0zkh',
  'AuctionState': 'bitcoincash:pwvjmx9tjl5lyw7nws0f8587tkgfsh9h65m3yuju8aqk2hgttetn5qy5e7zkz',
  'CollectionBid': 'bitcoincash:pd44kq9rs2tlm7cy9ewcljajk6drpdatwdrlxmnlz87rm0wfv3y0x00dpj4qh',
  'P2PKH': 'bitcoincash:pdl35znqhy5tals7xxe9f6v7vtcarqfa322tnd3wfk89sss75n2eqjvllsscz'
};

console.log('\n' + '='.repeat(80));
console.log('BAZAAR CONTRACT FUNDING GUIDE');
console.log('='.repeat(80));
console.log('\nYour Wallet Address:');
console.log(`  ${walletAddress}\n`);

console.log('Contracts to Fund (send 1000+ sats to each):\n');

let total = 0;
Object.entries(contractAddresses).forEach(([name, addr], i) => {
  console.log(`${i + 1}. ${name}`);
  console.log(`   ${addr}`);
  console.log(`   Required: 1000 satoshis\n`);
  total++;
});

console.log('='.repeat(80));
console.log(`TOTAL CONTRACTS: ${total}`);
console.log(`TOTAL FUNDING: ${total * 1000} satoshis (~${((total * 1000) / 100000000).toFixed(8)} BCH)`);
console.log('='.repeat(80));

console.log('\n📋 MANUAL FUNDING STEPS:\n');
console.log('1. Open your BCH wallet with access to: ' + walletAddress);
console.log('2. For each contract address below, create a transaction:');
console.log('   - Send 1000+ satoshis to the contract address');
console.log('   - Wait for confirmation in blockchain\n');

console.log('3. Once all contracts are funded, run:');
console.log('   npm run verify-contracts\n');

console.log('📝 CONTRACT ADDRESSES (Copy-Paste Ready):\n');
Object.entries(contractAddresses).forEach(([name, addr]) => {
  console.log(`${name}:`);
  console.log(`  ${addr}\n`);
});

console.log('🔍 VERIFY FUNDING:\n');
console.log('Check each address on the explorer:');
console.log('  https://chipnet.chaingraph.cash\n');

console.log('='.repeat(80));
console.log('Alternative: Wait for funding confirmation, then contracts are ready');
console.log('='.repeat(80) + '\n');

console.log('\n💡 TIP: Make sure you have sufficient test BCH in your wallet address.\n');
