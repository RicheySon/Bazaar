# Contract Address Compatibility Issue

## Problem Summary

Your contract addresses are **valid**, but Cashonize wallet is rejecting them as "Invalid BCH address provided". This is a **wallet compatibility issue**, not an address format problem.

## Why This Happens

The deployed contract addresses are **CashScript contract script addresses** (P2SH style):
- Generated from compiled smart contract bytecode
- Not traditional pay-to-public-key-hash (P2PKH) wallet addresses
- Some wallets (like Cashonize) only support P2PKH addresses and cannot send to script-based addresses

## Your Contract Addresses

All 7 contracts generated valid addresses in `bchtest:` format (Chipnet testnet):

```
1. FractionalClaims:  bchtest:pd540ypmpg4sl65pggpecmddfvcanuwveaydt0qqwvcmzl9fl6vl60cw42jsa
2. FractionalVault:   bchtest:p0hev5gg3vhq3zkn2jhhj8y8rq2gnlt0fz4f460vpkf56lhuvv9ly7mju5zfh
3. Marketplace:       bchtest:pwqhtec02e37qnfejja60pm72e6act2eh07xgxlwr2ls38l6ygakxghqwkz4d
4. Auction:           bchtest:pwhtpzcfvzpt0ydzqknrzwwnj7qd5sz4jsp4j4wh7tdlnh84fz59xypaw0zkh
5. AuctionState:      bchtest:pwvjmx9tjl5lyw7nws0f8587tkgfsh9h65m3yuju8aqk2hgttetn5qy5e7zkz
6. CollectionBid:     bchtest:pd44kq9rs2tlm7cy9ewcljajk6drpdatwdrlxmnlz87rm0wfv3y0x00dpj4qh
7. P2PKH:             bchtest:pdl35znqhy5tals7xxe9f6v7vtcarqfa322tnd3wfk89sss75n2eqjvllsscz
```

## Solutions

### Option 1: Use a Bitcoin Cash Command-Line Wallet (Recommended)

Use a CLI-based wallet that supports script addresses:

#### Using `cashc` + `bitcoin-cli` style tools:
```bash
# If you have access to Electrum CLI or similar BCH tools
# You can send directly to the script address
```

#### Using Electron Cash (Desktop Wallet - Recommended)
Electron Cash is a Bitcoin Cash desktop wallet that supports sending to script addresses:

1. Download Electron Cash from https://electroncash.org/
2. Connect to Chipnet testnet
3. Import your wallet: `bchtest:qqrlp7yke0afqctq9hkg8p7qt6dcz8n49qe4gnc4el`
4. Send ~1000 sats to each contract address using the "Send" tab
5. It will accept script-based addresses that Cashonize rejects

### Option 2: Use Bitcoin.com Wallet
The Bitcoin.com wallet (web and mobile) supports script addresses:

1. Go to https://wallet.bitcoin.com/
2. Ensure it's set to BCH Testnet (Chipnet)
3. Import your Chipnet wallet
4. Use "Send" to transfer to each contract address

### Option 3: Command-Line Funding (If Available)

If you have Node.js + CashScript available, we can create an automated funding script:

```bash
npm install cashscript @cashscript/utils
# Then use built-in transaction construction to fund contracts
```

## Current Status

✅ **Addresses Generated**: All 7 contract addresses valid  
✅ **Address Format**: Correct for Chipnet testnet  
❌ **Cashonize Wallet**: Cannot send to script-based addresses (limitation of simpler wallets)  

## Next Steps

1. **Recommended**: Use Electron Cash wallet instead of Cashonize
   - Download: https://electroncash.org/
   - Supports all address types including script addresses
   - Works with Chipnet testnet

2. **Alternative**: Use Bitcoin.com wallet
   - Web: https://wallet.bitcoin.com/
   - Mobile app available
   - Full script address support

3. **Testing**: Once funded with alternative wallet:
   - Fund FractionalClaims first (no dependencies)
   - Fund FractionalVault second (depends on FractionalClaims)
   - Fund remaining 5 contracts (can be any order)
   - Minimum funding: ~1000-5000 sats per contract

## Technical Note

The `p` prefix in addresses (`pd540ypm...`, `p0hev5g...`, `pwqhtec...`, etc.) indicates these are script-based addresses on the testnet, which is correct for CashScript contracts. Traditional wallet addresses start with `q` (e.g., `qqrlp7yke...` - your own wallet address).

Cashonize supports `q` prefix addresses but not `p` prefix script addresses. This is why it's rejecting them.

## Verification

Once you've funded the contracts using an alternative wallet, you can verify:

```bash
# Check contract balance on Chipnet explorer
# https://chipnet.imaginary.cash/
# Search for: bchtest:pd540ypmpg4sl65pggpecmddfvcanuwveaydt0qqwvcmzl9fl6vl60cw42jsa
```

---

**Issue**: Cashonize wallet incompatibility with P2SH script addresses  
**Solution**: Switch to Electron Cash or Bitcoin.com wallet  
**Impact**: No changes to contracts needed; just need alternative funding method  
