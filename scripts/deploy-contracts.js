// Automated deployment script for all CashScript contracts on BCH Chipnet
// Usage: node scripts/deploy-contracts.js

import { Contract, ElectrumNetworkProvider } from 'cashscript';
import { hexToBin } from '@bitauth/libauth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTIFACTS_DIR = path.join(__dirname, '..', 'src', 'lib', 'bch', 'artifacts');
const CHIPNET_PROVIDER = new ElectrumNetworkProvider('chipnet');

// Example constructor args for each contract (replace with real values as needed)
const exampleArgs = {
  'marketplace.json': [
    Buffer.from('2222222222222222222222222222222222222222', 'hex'), // sellerPkh (bytes20)
    100000n, // price (BigInt)
    Buffer.from('3333333333333333333333333333333333333333', 'hex'), // creatorPkh (bytes20)
    1000n // royaltyBasisPoints (BigInt)
  ],
  'collection-bid.json': [
    Buffer.from('2222222222222222222222222222222222222222', 'hex'), // bidderPkh (bytes20)
    Buffer.from('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'hex'), // tokenCategory (bytes32)
    Buffer.from('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'hex'), // bidSalt (bytes32)
    100000n, // price (BigInt)
    Buffer.from('3333333333333333333333333333333333333333', 'hex'), // creatorPkh (bytes20)
    1000n // royaltyBasisPoints (BigInt)
  ],
  'fractional-claims.json': [
    Buffer.from('cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', 'hex') // sharesCategory (bytes32)
  ],
  'fractional-vault.json': [
    Buffer.from('cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', 'hex'), // sharesCategory (bytes32)
    1000000n, // totalShares (BigInt)
    1000000n, // reserveSats (BigInt)
    Buffer.from('dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd', 'hex') // claimsScriptHash (bytes32)
  ],
  'auction.json': [
    Buffer.from('2222222222222222222222222222222222222222', 'hex'), // sellerPkh (bytes20)
    10000n, // minBid (BigInt)
    BigInt(Math.floor(Date.now() / 1000) + 86400), // endTime (BigInt)
    Buffer.from('3333333333333333333333333333333333333333', 'hex'), // creatorPkh (bytes20)
    1000n, // royaltyBasisPoints (BigInt)
    1000n // minBidIncrement (BigInt)
  ],
  'auction-state.json': [
    Buffer.from('2222222222222222222222222222222222222222', 'hex'), // sellerPkh (bytes20)
    Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef012345', 'hex'), // auctionLockingBytecode (bytes35)
    Buffer.from('cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', 'hex') // trackingCategory (bytes32)
  ],
  'p2pkh.json': [
    Buffer.from('2222222222222222222222222222222222222222', 'hex') // pkh (bytes20)
  ]
};

const results = [];
for (const file of fs.readdirSync(ARTIFACTS_DIR)) {
  if (!file.endsWith('.json')) continue;
  const artifact = JSON.parse(fs.readFileSync(path.join(ARTIFACTS_DIR, file), 'utf8'));
  const args = exampleArgs[file];
  if (!args) {
    console.warn(`No example args for ${file}, skipping.`);
    continue;
  }
  console.log(`Deploying ${artifact.contractName}...`);
  // Debug: print argument types and lengths
  args.forEach((arg, i) => {
    if (Buffer.isBuffer(arg)) {
      console.log(`    Arg[${i}] Buffer length: ${arg.length} hex: ${arg.toString('hex')}`);
    } else if (typeof arg === 'bigint') {
      console.log(`    Arg[${i}] BigInt: ${arg}`);
    } else {
      console.log(`    Arg[${i}] Type: ${typeof arg} Value:`, arg);
    }
  });
  // Validate argument lengths for Buffer types
  let valid = true;
  artifact.constructorInputs.forEach((input, i) => {
    if (input.type.startsWith('bytes') && Buffer.isBuffer(args[i])) {
      const expected = parseInt(input.type.replace('bytes', ''));
      if (args[i].length !== expected) {
        console.error(`    Arg[${i}] for ${input.name} expected length ${expected}, got ${args[i].length}`);
        valid = false;
      }
    }
  });
  if (!valid) {
    console.error(`  Skipping ${artifact.contractName} due to invalid argument lengths.`);
    continue;
  }
  let contract, lockingBytecode, address, lockingBytecodeHex;
  try {
    contract = new Contract(artifact, args, CHIPNET_PROVIDER);
    lockingBytecode = contract.lockingBytecode;
    address = contract.address;
    lockingBytecodeHex = Buffer.isBuffer(lockingBytecode)
      ? lockingBytecode.toString('hex')
      : Buffer.from(lockingBytecode).toString('hex');
    results.push({ name: artifact.contractName, address, lockingBytecode: lockingBytecodeHex });
    console.log(`  Address: ${address}`);
    console.log(`  Locking Bytecode: ${lockingBytecodeHex}`);
  } catch (err) {
    console.error(`  Failed to deploy ${artifact.contractName}:`, err.message);
    continue;
  }
  // TODO: Fund contract address with BCH to complete deployment
}
fs.writeFileSync(path.join(__dirname, 'deployed-contracts.json'), JSON.stringify(results, null, 2));
console.log('Deployment info written to scripts/deployed-contracts.json');
