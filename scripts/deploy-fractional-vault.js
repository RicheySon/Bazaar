#!/usr/bin/env node
// Manual deployment for FractionalVault contract on BCH Chipnet
// This is Step 2 of 7 - Depends on FractionalClaims
// Usage: node scripts/deploy-fractional-vault.js <sharesCategory> <totalShares> <reserveSats> <claimsScriptHashHex>

import { Contract } from 'cashscript';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTIFACT_PATH = path.join(__dirname, '..', 'src', 'lib', 'bch', 'artifacts', 'fractional-vault.json');
const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));

// Example constructor arguments for FractionalVault
// Get claimsScriptHash from FractionalClaims locking bytecode: sha256(sha256(bytecode))
const claimsLockingBytecodeHex = '323063636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636337383030396336333030636463306337383830306431633063653838303064326330636638383030636363306336613037373737363737633531396463306366383163306336353163653031323037663735353337613838353164303533373939643532373930306130363935323739353237396131363935323739373839353532373939363732376339343762353237393934373830306130363330306364633063373838303064316330636538383030643235323739353838303830303063633738613236393531636430333736613931343535373937653032383861633765383835316363353337396132363936373030636430333736613931343535373937653032383861633765383830306363353337396132363936383664366435313638';
const claimsLockingBytecode = Buffer.from(claimsLockingBytecodeHex, 'hex');

// Compute script hash: sha256(sha256(locking bytecode))
const sha256 = (data) => crypto.createHash('sha256').update(data).digest();
const claimsScriptHash = sha256(sha256(claimsLockingBytecode));

const args = [
  Buffer.from('cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', 'hex'), // sharesCategory (bytes32)
  1000000n, // totalShares (BigInt)
  1000000n, // reserveSats (BigInt)
  claimsScriptHash // claimsScriptHash (bytes32)
];

console.log('\n' + '='.repeat(70));
console.log('FRACTIONAL VAULT CONTRACT DEPLOYMENT - STEP 2 OF 7');
console.log('='.repeat(70));
console.log('\nContract: FractionalVault');
console.log('Purpose: Holds fractionalized NFT and manages vault buyout');
console.log('Dependencies: FractionalClaims (provides script hash)\n');

console.log('Constructor Arguments:');
console.log(`  sharesCategory (bytes32): cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc`);
console.log(`  totalShares (int): 1000000`);
console.log(`  reserveSats (int): 1000000`);
console.log(`  claimsScriptHash (bytes32): ${claimsScriptHash.toString('hex')}`);
console.log('  (computed from FractionalClaims locking bytecode)\n');

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

  console.log('\n✅ SUCCESS: FractionalVault contract instantiated\n');
  console.log('Generated Contract Address:');
  console.log(`  ${address}\n`);
  
  console.log('Script Hash (for dependent contracts):');
  const vaultScriptHash = sha256(sha256(lockingBytecode));
  console.log(`  ${vaultScriptHash.toString('hex')}\n`);

  const deploymentInfo = {
    contract: 'FractionalVault',
    address,
    lockingBytecode: lockingBytecodeHex,
    scriptHash: vaultScriptHash.toString('hex'),
    constructorArgs: {
      sharesCategory: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      totalShares: 1000000,
      reserveSats: 1000000,
      claimsScriptHash: claimsScriptHash.toString('hex')
    },
    dependencies: {
      FractionalClaims: 'bchtest:pd540ypmpg4sl65pggpecmddfvcanuwveaydt0qqwvcmzl9fl6vl60cw42jsa'
    },
    timestamp: new Date().toISOString(),
    status: 'instantiated_not_funded',
    nextSteps: [
      '1. Get test BCH from faucet: https://tbch.googol.cash',
      '2. Send at least 1000 satoshis to the address above',
      '3. Include the NFT UTXO to be escrowed',
      '4. Record the funding transaction ID',
      '5. Update docs/DEPLOYMENT.json with address and txid'
    ]
  };

  const outputPath = path.join(__dirname, 'deployment-fractional-vault.json');
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
  console.log('4. Continue with Step 3: Deploy Marketplace');
  console.log('   Command: node scripts/deploy-marketplace.js\n');
  console.log('='.repeat(70) + '\n');

} catch (err) {
  console.error('\n❌ ERROR: Failed to instantiate FractionalVault contract');
  console.error('Message:', err.message);
  console.error('\nDebug Info:');
  console.error('  Args count:', args.length);
  args.forEach((arg, i) => {
    if (Buffer.isBuffer(arg)) {
      console.error(`  Arg[${i}] Buffer length: ${arg.length}`);
    } else if (typeof arg === 'bigint') {
      console.error(`  Arg[${i}] BigInt: ${arg}`);
    }
  });
  console.error('\nFull error trace:');
  console.error(err);
}
