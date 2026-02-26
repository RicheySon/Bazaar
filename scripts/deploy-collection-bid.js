#!/usr/bin/env node
// Manual deployment for CollectionBid contract on BCH Chipnet
// This is Step 6 of 7 - Independent deployment
// Usage: node scripts/deploy-collection-bid.js

import { Contract } from 'cashscript';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTIFACT_PATH = path.join(__dirname, '..', 'src', 'lib', 'bch', 'artifacts', 'collection-bid.json');
const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));

const sha256 = (data) => crypto.createHash('sha256').update(data).digest();

const args = [
  Buffer.from('5555555555555555555555555555555555555555', 'hex'), // bidderPkh (bytes20)
  Buffer.from('8888888888888888888888888888888888888888888888888888888888888888', 'hex'), // tokenCategory (bytes32)
  Buffer.from('9999999999999999999999999999999999999999999999999999999999999999', 'hex'), // bidSalt (bytes32)
  50000n, // price (int - satoshis)
  Buffer.from('7777777777777777777777777777777777777777', 'hex'), // creatorPkh (bytes20)
  1000n // royaltyBasisPoints (int - 10%)
];

console.log('\n' + '='.repeat(70));
console.log('COLLECTION BID CONTRACT DEPLOYMENT - STEP 6 OF 7');
console.log('='.repeat(70));
console.log('\nContract: CollectionBid');
console.log('Purpose: Collection-level bidding for NFT purchases');
console.log('Dependencies: None\n');

console.log('Constructor Arguments:');
console.log(`  bidderPkh (bytes20): 5555555555555555555555555555555555555555`);
console.log(`  tokenCategory (bytes32): 8888888888888888888888888888888888888888888888888888888888888888`);
console.log(`  bidSalt (bytes32): 9999999999999999999999999999999999999999999999999999999999999999`);
console.log(`  price (int): 50000 (satoshis)`);
console.log(`  creatorPkh (bytes20): 7777777777777777777777777777777777777777`);
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

  console.log('\n✅ SUCCESS: CollectionBid contract instantiated\n');
  console.log('Generated Contract Address:');
  console.log(`  ${address}\n`);

  const deploymentInfo = {
    contract: 'CollectionBid',
    address,
    lockingBytecode: lockingBytecodeHex,
    scriptHash: sha256(sha256(lockingBytecode)).toString('hex'),
    constructorArgs: {
      bidderPkh: '5555555555555555555555555555555555555555',
      sellerPkh: '6666666666666666666666666666666666666666',
      bidAmount: 50000,
      expiryTime: args[3].toString(),
      creatorPkh: '7777777777777777777777777777777777777777'
    },
    timestamp: new Date().toISOString(),
    status: 'instantiated_not_funded'
  };

  const outputPath = path.join(__dirname, 'deployment-collection-bid.json');
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));

  console.log(`Deployment info saved to: ${outputPath}\n`);
  console.log('NEXT STEPS:');
  console.log('─'.repeat(70));
  console.log('1. Get test BCH from faucet: https://tbch.googol.cash');
  console.log(`   Send to: ${address}\n`);
  console.log('2. Record the funding transaction ID');
  console.log('3. Continue with Step 7: Deploy P2PKH (final contract)');
  console.log('   Command: node scripts/deploy-p2pkh.js\n');
  console.log('='.repeat(70) + '\n');

} catch (err) {
  console.error('\n❌ ERROR: Failed to instantiate CollectionBid contract');
  console.error('Message:', err.message);
}
