#!/usr/bin/env node
/**
 * Compile CashScript contracts to JSON artifacts
 * Usage: node scripts/compile-contracts.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONTRACTS_DIR = path.join(__dirname, '..', 'contracts');
const ARTIFACTS_DIR = path.join(__dirname, '..', 'src', 'lib', 'bch', 'artifacts');

// Ensure artifacts directory exists
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

// Find all .cash files
const cashFiles = fs.readdirSync(CONTRACTS_DIR).filter(f => f.endsWith('.cash'));

console.log(`📜 Found ${cashFiles.length} CashScript contracts to compile...`);

cashFiles.forEach(file => {
  const contractPath = path.join(CONTRACTS_DIR, file);
  const artifactName = file.replace('.cash', '.json');
  const artifactPath = path.join(ARTIFACTS_DIR, artifactName);
  
  try {
    console.log(`  Compiling ${file}...`);
    
    // Use npx cashc to compile
    execSync(`npx cashc ${contractPath} --output ${artifactPath}`, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    console.log(`  ✅ Generated ${artifactName}`);
  } catch (error) {
    console.error(`  ❌ Failed to compile ${file}:`, error.message);
    process.exit(1);
  }
});

console.log(`\n✨ All contracts compiled successfully!`);
