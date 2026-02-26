#!/usr/bin/env node
// Manual deployment for Auction contract on BCH Chipnet
// This is Step 4 of 7 - Independent deployment
// Usage: node scripts/deploy-auction.js

import { Contract } from 'cashscript';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTIFACT_PATH = path.join(__dirname, '..', 'src', 'lib', 'bch', 'artifacts', 'auction.json');
const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));

const sha256 = (data) => crypto.createHash('sha256').update(data).digest();

// Example: auction ending 1 day from now
const endTime = BigInt(Math.floor(Date.now() / 1000) + 86400);

const args = [
  Buffer.from('2222222222222222222222222222222222222222', 'hex'), // sellerPkh (bytes20)
  10000n, // minBid (BigInt)
  endTime, // endTime (BigInt - unix timestamp)
  Buffer.from('3333333333333333333333333333333333333333', 'hex'), // creatorPkh (bytes20)
  1000n, // royaltyBasisPoints (BigInt - 10%)
  1000n // minBidIncrement (BigInt)
];

console.log('\n' + '='.repeat(70));
console.log('AUCTION CONTRACT DEPLOYMENT - STEP 4 OF 7');
console.log('='.repeat(70));
console.log('\nContract: Auction');
console.log('Purpose: Auction-based NFT sales with bid management');
console.log('Dependencies: None (provides auctionLockingBytecode for AuctionState)\n');

console.log('Constructor Arguments:');
console.log(`  sellerPkh (bytes20): 2222222222222222222222222222222222222222`);
console.log(`  minBid (int): 10000 (satoshis)`);
console.log(`  endTime (int): ${endTime} (unix timestamp)`);
console.log(`  creatorPkh (bytes20): 3333333333333333333333333333333333333333`);
console.log(`  royaltyBasisPoints (int): 1000 (10%)`);
console.log(`  minBidIncrement (int): 1000 (satoshis)\n`);

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

  const auctionScriptHash = sha256(sha256(lockingBytecode)).toString('hex');

  console.log('\n✅ SUCCESS: Auction contract instantiated\n');
  console.log('Generated Contract Address:');
  console.log(`  ${address}\n`);
  
  console.log('Script Hash (for AuctionState):');
  console.log(`  ${auctionScriptHash}\n`);

  const deploymentInfo = {
    contract: 'Auction',
    address,
    lockingBytecode: lockingBytecodeHex,
    scriptHash: auctionScriptHash,
    constructorArgs: {
      sellerPkh: '2222222222222222222222222222222222222222',
      minBid: 10000,
      endTime: endTime.toString(),
      creatorPkh: '3333333333333333333333333333333333333333',
      royaltyBasisPoints: 1000,
      minBidIncrement: 1000
    },
    timestamp: new Date().toISOString(),
    status: 'instantiated_not_funded'
  };

  const outputPath = path.join(__dirname, 'deployment-auction.json');
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));

  console.log(`Deployment info saved to: ${outputPath}\n`);
  console.log('NEXT STEPS:');
  console.log('─'.repeat(70));
  console.log('1. Get test BCH from faucet: https://tbch.googol.cash');
  console.log(`   Send to: ${address}\n`);
  console.log('2. Include NFT UTXO with the funding');
  console.log('3. Record the funding transaction ID');
  console.log(`4. IMPORTANT: Save auctionLockingBytecode for Step 5 (AuctionState):`);
  console.log(`   ${lockingBytecodeHex.substring(0, 50)}...\n`);
  console.log('5. Continue with Step 5: Deploy AuctionState');
  console.log('   Command: node scripts/deploy-auction-state.js\n');
  console.log('='.repeat(70) + '\n');

} catch (err) {
  console.error('\n❌ ERROR: Failed to instantiate Auction contract');
  console.error('Message:', err.message);
}
