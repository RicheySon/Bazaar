#!/usr/bin/env node
// Manual deployment for P2PKH contract on BCH Chipnet
// This is Step 7 of 7 - Independent deployment (final contract)
// Usage: node scripts/deploy-p2pkh.js

import { Contract } from 'cashscript';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTIFACT_PATH = path.join(__dirname, '..', 'src', 'lib', 'bch', 'artifacts', 'p2pkh.json');
const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));

const sha256 = (data) => crypto.createHash('sha256').update(data).digest();

// P2PKH can have different constructor args, example with a single PKH
const args = [
  Buffer.from('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'hex') // pkh (bytes20)
];

console.log('\n' + '='.repeat(70));
console.log('P2PKH CONTRACT DEPLOYMENT - STEP 7 OF 7 (FINAL)');
console.log('='.repeat(70));
console.log('\nContract: P2PKH');
console.log('Purpose: Standard pay-to-public-key-hash utility contract');
console.log('Dependencies: None\n');

console.log('Constructor Arguments:');
console.log(`  pkh (bytes20): aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n`);

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

  console.log('\n✅ SUCCESS: P2PKH contract instantiated\n');
  console.log('Generated Contract Address:');
  console.log(`  ${address}\n`);

  const deploymentInfo = {
    contract: 'P2PKH',
    address,
    lockingBytecode: lockingBytecodeHex,
    scriptHash: sha256(sha256(lockingBytecode)).toString('hex'),
    constructorArgs: {
      pkh: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    },
    timestamp: new Date().toISOString(),
    status: 'instantiated_not_funded'
  };

  const outputPath = path.join(__dirname, 'deployment-p2pkh.json');
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));

  console.log(`Deployment info saved to: ${outputPath}\n`);
  console.log('NEXT STEPS:');
  console.log('─'.repeat(70));
  console.log('1. Get test BCH from faucet: https://tbch.googol.cash');
  console.log(`   Send to: ${address}\n`);
  console.log('2. Record the funding transaction ID');
  console.log('3. 🎉 ALL CONTRACTS DEPLOYED!\n');
  console.log('POST-DEPLOYMENT:');
  console.log('─'.repeat(70));
  console.log('1. Update docs/DEPLOYMENT.json with all contract addresses and txids');
  console.log('2. Update src/lib/bch/config.ts with deployed addresses');
  console.log('3. Add environment variables to .env.local:');
  console.log('   NEXT_PUBLIC_CONTRACT_MARKETPLACE=<address>');
  console.log('   NEXT_PUBLIC_CONTRACT_AUCTION=<address>');
  console.log('   NEXT_PUBLIC_CONTRACT_AUCTION_STATE=<address>');
  console.log('   NEXT_PUBLIC_CONTRACT_COLLECTION_BID=<address>');
  console.log('   NEXT_PUBLIC_CONTRACT_FRACTIONAL_VAULT=<address>');
  console.log('   NEXT_PUBLIC_CONTRACT_FRACTIONAL_CLAIMS=<address>');
  console.log('   NEXT_PUBLIC_CONTRACT_P2PKH=<address>\n');
  console.log('4. Run tests: npm test');
  console.log('5. Verify contracts on explorer: https://chipnet.chaingraph.cash\n');
  console.log('='.repeat(70) + '\n');

} catch (err) {
  console.error('\n❌ ERROR: Failed to instantiate P2PKH contract');
  console.error('Message:', err.message);
}
