# Contract Deployment Guide for BAZAAR on BCH Chipnet

## Overview
This guide provides step-by-step instructions for deploying all BAZAAR smart contracts on BCH Chipnet. The contracts are written in CashScript and are compiled into JSON artifacts in `src/lib/bch/artifacts/`.

## Prerequisites

1. **BCH Wallet**: A BCH wallet with funds on Chipnet (get test BCH from the faucet: https://tbch.googol.cash)
2. **CashScript SDK**: Already installed via `npm install` (version 0.10+)
3. **Electrum Connection**: Access to a Chipnet Electrum server (default: chipnet.imaginary.cash:50004)
4. **Node.js**: v18+ with ESM support

## Deployment Strategy

There are two primary approaches:

### Option 1: Automated Deployment (If SDK Issues Are Resolved)
Use `scripts/deploy-contracts.js` to deploy all contracts at once:
```bash
node scripts/deploy-contracts.js
```
This script:
- Instantiates each contract with example constructor arguments
- Generates contract addresses (P2SH addresses from locking bytecodes)
- Records deployment information to `scripts/deployed-contracts.json`
- Does NOT fund the contracts (manual step required)

### Option 2: Manual Individual Deployment (Recommended)
Deploy each contract individually using the steps below. This gives you full control and visibility into each deployment.

## Deployment Step-by-Step

### Step 1: Deploy FractionalClaims (No Dependencies)

1. **Prepare Constructor Args**:
   - `sharesCategory`: bytes32 (token category of share FTs)
   - Example: `cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc`

2. **Instantiate Contract** (using CashScript SDK):
   ```javascript
   const artifact = require('./src/lib/bch/artifacts/fractional-claims.json');
   const contract = new Contract(artifact, [Buffer.from('cccccccccccc...', 'hex')], provider);
   const address = contract.address;
   ```

3. **Fund Contract**:
   - Transfer test BCH (dust amount, e.g., 1000 sats) to the contract address
   - Include the mutable tracking NFT UTXO (to be held for fraction claims)

4. **Record Deployment**:
   - Contract Address: (from step 2)
   - Deployment Txid: (from funding transaction)
   - Update `docs/DEPLOYMENT.json` with `deployedAddress` and `deploymentTxid`
   - Update `src/lib/bch/config.ts` with the contract address if needed

### Step 2: Deploy FractionalVault (Depends on FractionalClaims)

1. **Prepare Constructor Args**:
   - `sharesCategory`: bytes32 (token category of share FTs)
   - `totalShares`: int (e.g., 1000000)
   - `reserveSats`: int (buyout price in satoshis)
   - `claimsScriptHash`: bytes32 (script hash of FractionalClaims from step 1)

2. **Get Claims Script Hash**:
   ```bash
   # From the FractionalClaims artifact/contract
   claimsScriptHash = sha256(sha256(claimsLockingBytecode))
   ```

3. **Instantiate Contract** (using CashScript SDK):
   ```javascript
   const artifact = require('./src/lib/bch/artifacts/fractional-vault.json');
   const contract = new Contract(artifact, [
     Buffer.from('cccccccc...', 'hex'),  // sharesCategory
     1000000n,                             // totalShares
     1000000n,                             // reserveSats
     Buffer.from('dddddddd...', 'hex')   // claimsScriptHash
   ], provider);
   const address = contract.address;
   ```

4. **Fund Contract**:
   - Transfer test BCH (dust amount, e.g., 1000 sats) to the contract address
   - Include the original NFT UTXO (to be escrowed for fractional ownership)

5. **Record Deployment** (same as step 1)

### Step 3: Deploy Marketplace (Independent)

1. **Prepare Constructor Args**:
   - `sellerPkh`: bytes20 (seller's public key hash)
   - `price`: int (price in satoshis, e.g., 100000)
   - `creatorPkh`: bytes20 (creator's public key hash)
   - `royaltyBasisPoints`: int (royalty percentage, e.g., 1000 = 10%)

2. **Instantiate Contract**:
   ```javascript
   const artifact = require('./src/lib/bch/artifacts/marketplace.json');
   const contract = new Contract(artifact, [
     Buffer.from('2222222222...', 'hex'),  // sellerPkh
     100000n,                               // price
     Buffer.from('3333333333...', 'hex'),  // creatorPkh
     1000n                                  // royaltyBasisPoints
   ], provider);
   const address = contract.address;
   ```

3. **Fund Contract**:
   - Transfer test BCH to the contract address (at least `price` satoshis + fees)
   - Include the NFT UTXO to be sold

4. **Record Deployment** (same as step 1)

### Step 4: Deploy Auction (Independent)

1. **Prepare Constructor Args**:
   - `sellerPkh`: bytes20 (seller's public key hash)
   - `minBid`: int (minimum bid in satoshis)
   - `endTime`: int (unix timestamp for auction end)
   - `creatorPkh`: bytes20 (creator's public key hash)
   - `royaltyBasisPoints`: int (royalty percentage)
   - `minBidIncrement`: int (minimum bid increment)

2. **Instantiate Contract**:
   ```javascript
   const artifact = require('./src/lib/bch/artifacts/auction.json');
   const contract = new Contract(artifact, [
     Buffer.from('2222222222...', 'hex'),  // sellerPkh
     10000n,                                // minBid
     BigInt(Math.floor(Date.now() / 1000) + 86400), // endTime (1 day from now)
     Buffer.from('3333333333...', 'hex'),  // creatorPkh
     1000n,                                 // royaltyBasisPoints
     1000n                                  // minBidIncrement
   ], provider);
   const address = contract.address;
   ```

3. **Fund Contract**:
   - Transfer test BCH (dust amount, e.g., 1000 sats) to the contract address
   - Include the NFT UTXO to be auctioned

4. **Record Deployment** (same as step 1)

### Step 5: Deploy AuctionState (Depends on Auction)

1. **Prepare Constructor Args**:
   - `sellerPkh`: bytes20 (seller's public key hash)
   - `auctionLockingBytecode`: bytes35 (locking bytecode of Auction contract from step 4)
   - `trackingCategory`: bytes32 (token category for mutable tracking NFT)

2. **Get Auction Locking Bytecode**:
   ```bash
   # From the Auction contract instantiated in step 4
   auctionLockingBytecode = contract.lockingBytecode (35 bytes)
   ```

3. **Instantiate Contract**:
   ```javascript
   const artifact = require('./src/lib/bch/artifacts/auction-state.json');
   const contract = new Contract(artifact, [
     Buffer.from('2222222222...', 'hex'),  // sellerPkh
     auctionLockingBytecode,                // auctionLockingBytecode (35 bytes buffer)
     Buffer.from('cccccccc...', 'hex')     // trackingCategory
   ], provider);
   const address = contract.address;
   ```

4. **Fund Contract**:
   - Transfer test BCH (dust amount, e.g., 1000 sats) to the contract address
   - Include the mutable tracking NFT UTXO

5. **Record Deployment** (same as step 1)

### Step 6: Deploy CollectionBid (Independent)

1. **Prepare Constructor Args**:
   - `bidderPkh`: bytes20 (bidder's public key hash)
   - `tokenCategory`: bytes32 (token category of the collection)
   - `bidSalt`: bytes32 (salt to differentiate contract addresses)
   - `price`: int (bid price in satoshis)
   - `creatorPkh`: bytes20 (creator's public key hash)
   - `royaltyBasisPoints`: int (royalty percentage)

2. **Instantiate Contract**:
   ```javascript
   const artifact = require('./src/lib/bch/artifacts/collection-bid.json');
   const contract = new Contract(artifact, [
     Buffer.from('2222222222...', 'hex'),  // bidderPkh
     Buffer.from('aaaaaaa...', 'hex'),     // tokenCategory
     Buffer.from('bbbbbbb...', 'hex'),     // bidSalt
     100000n,                               // price
     Buffer.from('3333333333...', 'hex'),  // creatorPkh
     1000n                                  // royaltyBasisPoints
   ], provider);
   const address = contract.address;
   ```

3. **Fund Contract**:
   - Transfer test BCH to the contract address (at least `price` satoshis + fees)

4. **Record Deployment** (same as step 1)

### Step 7: Deploy P2PKH (Independent)

1. **Prepare Constructor Args**:
   - `pkh`: bytes20 (public key hash)

2. **Instantiate Contract**:
   ```javascript
   const artifact = require('./src/lib/bch/artifacts/p2pkh.json');
   const contract = new Contract(artifact, [
     Buffer.from('2222222222...', 'hex')   // pkh
   ], provider);
   const address = contract.address;
   ```

3. **Fund Contract**:
   - Transfer test BCH to the contract address as needed

4. **Record Deployment** (same as step 1)

## Post-Deployment Configuration

1. **Update `src/lib/bch/config.ts`**:
   - Add contract addresses as constants or environment variables
   - Example:
     ```typescript
     export const DEPLOYED_CONTRACTS = {
       marketplace: 'bchtest:pv...',
       auction: 'bchtest:pq...',
       fractionalVault: 'bchtest:pr...',
       // ... etc
     };
     ```

2. **Update `docs/DEPLOYMENT.json`**:
   - Add `deployedAddress` and `deploymentTxid` for each contract
   - Update `deploymentDate` with the date of deployment

3. **Test Deployment**:
   - Verify contract addresses are registered on Chipnet explorer: https://chipnet.chaingraph.cash
   - Test contract functions using the Nexus SDK or test suite

## Troubleshooting

### CashScript SDK Issues
- Ensure CashScript version is 0.10+
- Verify all constructor arguments match the contract ABI (types, lengths)
- Check that all Buffer arguments are exactly the specified byte length (bytes20 = 20 bytes, bytes32 = 32 bytes, etc.)
- If instantiation fails, inspect the artifact and error message carefully

### Funding Issues
- Ensure wallet has sufficient BCH balance on Chipnet
- Use the faucet to get test BCH: https://tbch.googol.cash
- Verify Electrum connection is working: `ping chipnet.imaginary.cash`

### Contract Not Found
- Verify contract address on Chipnet explorer
- Check transaction ID in explorer to confirm funding was successful
- Ensure contract address is correctly copied to config files

## References

- **CashScript Documentation**: https://cashscript.org/
- **BCH Chipnet Explorer**: https://chipnet.chaingraph.cash/
- **CashScript SDK**: https://github.com/cashscript/cashscript
- **BAZAAR Deployment Registry**: `docs/DEPLOYMENT.json`
- **Compiled Artifacts**: `src/lib/bch/artifacts/`

## Notes

- All contracts are deployed on **BCH Chipnet (testnet)**, not mainnet
- Constructor arguments in the examples are placeholders; use real addresses and parameters for production
- Each contract has a unique address derived from its locking bytecode and constructor arguments
- Contract addresses are deterministic: the same contract with the same arguments will always have the same address
