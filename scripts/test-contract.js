#!/usr/bin/env node
// Test Contract instantiation without network provider
import { Contract } from 'cashscript';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTIFACT_PATH = path.join(__dirname, '..', 'src', 'lib', 'bch', 'artifacts', 'fractional-claims.json');
const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));

const sharesCategory = Buffer.from('cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', 'hex');
const args = [sharesCategory];

console.log('Testing contract instantiation without provider...');
console.log('Artifact:', artifact.contractName);
console.log('Args:', args.length);

try {
  // Try without provider
  const contract = new Contract(artifact, args);
  console.log('✅ Contract instantiated (no provider)');
  console.log('Address:', contract.address);
  console.log('Bytecode:', contract.bytecode?.toString('hex').substring(0, 50) + '...');
} catch (err) {
  console.error('❌ Error:', err.message);
}
