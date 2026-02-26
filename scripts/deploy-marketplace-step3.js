#!/usr/bin/env node
// Manual deployment for Marketplace contract on BCH Chipnet
// This is Step 3 of 7 - Independent deployment
// Usage: node scripts/deploy-marketplace-step3.js

import { Contract } from 'cashscript';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTIFACT_PATH = path.join(__dirname, '..', 'src', 'lib', 'bch', 'artifacts', 'marketplace.json');
const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));

const sha256 = (data) => crypto.createHash('sha256').update(data).digest();

const args = [
  Buffer.from('2222222222222222222222222222222222222222', 'hex'), // sellerPkh (bytes20)
  100000n, // price (BigInt)
  Buffer.from('3333333333333333333333333333333333333333', 'hex'), // creatorPkh (bytes20)
  1000n // royaltyBasisPoints (BigInt - 10%)
];

console.log('\n' + '='.repeat(70));
console.log('MARKETPLACE CONTRACT DEPLOYMENT - STEP 3 OF 7');
console.log('='.repeat(70));
console.log('\nContract: Marketplace');
console.log('Purpose: Fixed-price NFT sales with royalty distribution');
console.log('Dependencies: None\n');

console.log('Constructor Arguments:');
console.log(`  sellerPkh (bytes20): 2222222222222222222222222222222222222222`);
console.log(`  price (int): 100000 (satoshis)`);
console.log(`  creatorPkh (bytes20): 3333333333333333333333333333333333333333`);
console.log(`  royaltyBasisPoints (int): 1000 (10%)\n`);

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

  console.log('\n✅ SUCCESS: Marketplace contract instantiated\n');
  console.log('Generated Contract Address:');
  console.log(`  ${address}\n`);

  const deploymentInfo = {
    contract: 'Marketplace',
    address,
    lockingBytecode: lockingBytecodeHex,
    scriptHash: sha256(sha256(lockingBytecode)).toString('hex'),
    constructorArgs: {
      sellerPkh: '2222222222222222222222222222222222222222',
      price: 100000,
      creatorPkh: '3333333333333333333333333333333333333333',
      royaltyBasisPoints: 1000
    },
    timestamp: new Date().toISOString(),
    status: 'instantiated_not_funded'
  };

  const outputPath = path.join(__dirname, 'deployment-marketplace.json');
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));

  console.log(`Deployment info saved to: ${outputPath}\n`);
  console.log('NEXT STEPS:');
  console.log('─'.repeat(70));
  console.log('1. Get test BCH from faucet: https://tbch.googol.cash');
  console.log(`   Send to: ${address}\n`);
  console.log('2. Include NFT UTXO with the funding');
  console.log('3. Record the funding transaction ID');
  console.log('4. Continue with Step 4: Deploy Auction');
  console.log('   Command: node scripts/deploy-auction.js\n');
  console.log('='.repeat(70) + '\n');

} catch (err) {
  console.error('\n❌ ERROR: Failed to instantiate Marketplace contract');
  console.error('Message:', err.message);
}
