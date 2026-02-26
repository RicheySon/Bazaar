// Minimal manual deployment for Marketplace contract on BCH Chipnet
// Usage: node scripts/deploy-marketplace.js
import { Contract, ElectrumNetworkProvider } from 'cashscript';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_PATH = path.join(__dirname, '..', 'src', 'lib', 'bch', 'artifacts', 'marketplace.json');
const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));
const CHIPNET_PROVIDER = new ElectrumNetworkProvider('chipnet');

// Valid constructor args for Marketplace
const args = [
  Buffer.from('2222222222222222222222222222222222222222', 'hex'), // sellerPkh (bytes20)
  100000n, // price (BigInt)
  Buffer.from('3333333333333333333333333333333333333333', 'hex'), // creatorPkh (bytes20)
  1000n // royaltyBasisPoints (BigInt)
];

console.log('Deploying Marketplace contract with args:');
args.forEach((arg, i) => {
  if (Buffer.isBuffer(arg)) {
    console.log(`  Arg[${i}] Buffer length: ${arg.length} hex: ${arg.toString('hex')}`);
  } else if (typeof arg === 'bigint') {
    console.log(`  Arg[${i}] BigInt: ${arg}`);
  } else {
    console.log(`  Arg[${i}] Type: ${typeof arg} Value:`, arg);
  }
});

try {
  const contract = new Contract(artifact, args, CHIPNET_PROVIDER);
  const lockingBytecode = contract.lockingBytecode;
  const address = contract.address;
  const lockingBytecodeHex = Buffer.isBuffer(lockingBytecode)
    ? lockingBytecode.toString('hex')
    : Buffer.from(lockingBytecode).toString('hex');
  console.log('Marketplace contract deployed:');
  console.log('  Address:', address);
  console.log('  Locking Bytecode:', lockingBytecodeHex);
} catch (err) {
  console.error('Failed to deploy Marketplace contract:', err.message);
}
