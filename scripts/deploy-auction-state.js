#!/usr/bin/env node
// Manual deployment for AuctionState contract on BCH Chipnet
// This is Step 5 of 7 - Depends on Auction
// Usage: node scripts/deploy-auction-state.js <auctionLockingBytecodeHex>

import { Contract } from 'cashscript';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTIFACT_PATH = path.join(__dirname, '..', 'src', 'lib', 'bch', 'artifacts', 'auction-state.json');
const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));

const sha256 = (data) => crypto.createHash('sha256').update(data).digest();

// Get auctionLockingBytecode from deployment-auction.json
const auctionDeploymentPath = path.join(__dirname, 'deployment-auction.json');
let auctionLockingBytecodeHex = '';

try {
  const auctionDeployment = JSON.parse(fs.readFileSync(auctionDeploymentPath, 'utf8'));
  auctionLockingBytecodeHex = auctionDeployment.lockingBytecode;
} catch (err) {
  console.error('ERROR: Could not read auction locking bytecode from deployment-auction.json');
  console.error('Make sure you have deployed the Auction contract first (Step 4)');
  process.exit(1);
}

const auctionLockingBytecode = Buffer.from(auctionLockingBytecodeHex, 'hex');

// AuctionState expects only first 35 bytes of the auction locking bytecode
const auctionLockingBytecodeFor35 = auctionLockingBytecode.slice(0, 35);

const args = [
  Buffer.from('2222222222222222222222222222222222222222', 'hex'), // sellerPkh (bytes20)
  auctionLockingBytecodeFor35, // auctionLockingBytecode (bytes35)
  Buffer.from('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 'hex') // trackingCategory (bytes32) 
];

console.log('\n' + '='.repeat(70));
console.log('AUCTION STATE CONTRACT DEPLOYMENT - STEP 5 OF 7');
console.log('='.repeat(70));
console.log('\nContract: AuctionState');
console.log('Purpose: Tracks auction state and bid information');
console.log('Dependencies: Auction (provides auctionLockingBytecode)\n');

console.log('Constructor Arguments:');
console.log(`  sellerPkh (bytes20): 2222222222222222222222222222222222222222`);
console.log(`  auctionLockingBytecode (bytes35): ${auctionLockingBytecodeHex.substring(0, 50)}...`);
console.log(`  trackingCategory (bytes32): dddddddddddddddddddddddddddddddddddddddd\n`);

try {
  console.log('Instantiating contract...');
  const contract = new Contract(artifact, args);
  
  let address = contract.address;
  if (address.startsWith('bitcoincash:')) {
    const parts = address.split(':');
    address = 'bchtest:' + parts[1];
  }
  
  const lockingBytecode = contract.bytecode;
  const lockingBytecodeHex = Buffer.isBuffer(lockingBytecode)
    ? lockingBytecode.toString('hex')
    : Buffer.from(lockingBytecode).toString('hex');

  console.log('\n✅ SUCCESS: AuctionState contract instantiated\n');
  console.log('Generated Contract Address:');
  console.log(`  ${address}\n`);

  const deploymentInfo = {
    contract: 'AuctionState',
    address,
    lockingBytecode: lockingBytecodeHex,
    scriptHash: sha256(sha256(lockingBytecode)).toString('hex'),
    constructorArgs: {
      sellerPkh: '2222222222222222222222222222222222222222',
      auctionLockingBytecodeLength: auctionLockingBytecode.length,
      trackingCategory: 'dddddddddddddddddddddddddddddddddddddddd'
    },
    dependencies: {
      Auction: 'deployment-auction.json'
    },
    timestamp: new Date().toISOString(),
    status: 'instantiated_not_funded'
  };

  const outputPath = path.join(__dirname, 'deployment-auction-state.json');
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));

  console.log(`Deployment info saved to: ${outputPath}\n`);
  console.log('NEXT STEPS:');
  console.log('─'.repeat(70));
  console.log('1. Get test BCH from faucet: https://tbch.googol.cash');
  console.log(`   Send to: ${address}\n`);
  console.log('2. Include mutable tracking NFT UTXO with the funding');
  console.log('3. Record the funding transaction ID');
  console.log('4. Continue with Step 6: Deploy CollectionBid');
  console.log('   Command: node scripts/deploy-collection-bid.js\n');
  console.log('='.repeat(70) + '\n');

} catch (err) {
  console.error('\n❌ ERROR: Failed to instantiate AuctionState contract');
  console.error('Message:', err.message);
  console.error('\nDebug Info:');
  console.error('  auctionLockingBytecode length:', args[1].length);
}
