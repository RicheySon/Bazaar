#!/usr/bin/env node
// Manual deployment for FractionalClaims contract on BCH Chipnet
// This is Step 1 of 7 in the manual deployment process
// Usage: node scripts/deploy-fractional-claims.js

import { Contract } from 'cashscript';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load contract artifact
const ARTIFACT_PATH = path.join(__dirname, '..', 'src', 'lib', 'bch', 'artifacts', 'fractional-claims.json');
const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));

// Constructor arguments for FractionalClaims
// sharesCategory: bytes32 - token category of share FTs (placeholder example)
const sharesCategory = Buffer.from('cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', 'hex');

const args = [sharesCategory];

console.log('\n' + '='.repeat(70));
console.log('FRACTIONAL CLAIMS CONTRACT DEPLOYMENT - STEP 1 OF 7');
console.log('='.repeat(70));
console.log('\nContract: FractionalClaims');
console.log('Purpose: Manages fractional share token claims for fractionalized NFTs');
console.log('Dependencies: None (first in deployment order)\n');

console.log('Constructor Arguments:');
console.log(`  sharesCategory (bytes32): ${sharesCategory.toString('hex')}`);
console.log(`    └─ Length: ${sharesCategory.length} bytes\n`);

try {
  console.log('Instantiating contract...');
  // Instantiate without provider - SDK works fine this way
  const contract = new Contract(artifact, args);
  
  let address = contract.address;
  // Convert mainnet address to Chipnet address
  if (address.startsWith('bitcoincash:')) {
    // Extract the payload and convert to bchtest prefix
    const parts = address.split(':');
    address = 'bchtest:' + parts[1];
  }
  
  const lockingBytecode = contract.bytecode;
  const lockingBytecodeHex = Buffer.isBuffer(lockingBytecode)
    ? lockingBytecode.toString('hex')
    : Buffer.from(lockingBytecode).toString('hex');

  console.log('\n✅ SUCCESS: FractionalClaims contract instantiated\n');
  console.log('Generated Contract Address:');
  console.log(`  ${address}\n`);
  
  console.log('Locking Bytecode:');
  console.log(`  ${lockingBytecodeHex}\n`);

  // Write deployment info to file
  const deploymentInfo = {
    contract: 'FractionalClaims',
    address,
    lockingBytecode: lockingBytecodeHex,
    constructorArgs: {
      sharesCategory: sharesCategory.toString('hex')
    },
    timestamp: new Date().toISOString(),
    status: 'instantiated_not_funded',
    nextSteps: [
      '1. Get test BCH from faucet: https://tbch.googol.cash',
      '2. Send at least 1000 satoshis to the address above',
      '3. Include the mutable tracking NFT UTXO (if available)',
      '4. Record the funding transaction ID',
      '5. Update docs/DEPLOYMENT.json with address and txid',
      '6. Add to .env.local: NEXT_PUBLIC_CONTRACT_FRACTIONAL_CLAIMS=' + address
    ]
  };

  const outputPath = path.join(__dirname, 'deployment-fractional-claims.json');
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`Deployment info saved to: ${outputPath}\n`);

  console.log('NEXT STEPS:');
  console.log('─'.repeat(70));
  console.log('1. Get test BCH from faucet:');
  console.log('   URL: https://tbch.googol.cash');
  console.log(`   Send to: ${address}\n`);
  console.log('2. After funding, record the transaction ID');
  console.log('3. Update docs/DEPLOYMENT.json with:');
  console.log(`   - deployedAddress: "${address}"`);
  console.log('   - deploymentTxid: "<funding_txid_here>"\n');
  console.log('4. Continue with Step 2: Deploy FractionalVault');
  console.log('   Command: node scripts/deploy-fractional-vault.js\n');
  console.log('='.repeat(70) + '\n');

} catch (err) {
  console.error('\n❌ ERROR: Failed to instantiate FractionalClaims contract');
  console.error('Message:', err.message);
  console.error('\nDebug Info:');
  console.error('  Artifact:', ARTIFACT_PATH);
  console.error('  Args count:', args.length);
  args.forEach((arg, i) => {
    if (Buffer.isBuffer(arg)) {
      console.error(`  Arg[${i}] Buffer length: ${arg.length}`);
    } else if (typeof arg === 'bigint') {
      console.error(`  Arg[${i}] BigInt: ${arg}`);
    } else {
      console.error(`  Arg[${i}] Type: ${typeof arg}`);
    }
  });
  console.error('\nFull error trace:');
  console.error(err);
}
