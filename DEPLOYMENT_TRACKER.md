# BAZAAR Contract Deployment Tracker

**Date**: February 26, 2026  
**Network**: BCH Chipnet (Testnet)  
**Status**: All Contracts Instantiated ✅

## Deployed Contract Addresses

| # | Contract | Address | Status |
|---|----------|---------|--------|
| 1 | FractionalClaims | `bchtest:pd540ypmpg4sl65pggpecmddfvcanuwveaydt0qqwvcmzl9fl6vl60cw42jsa` | Instantiated |
| 2 | FractionalVault | `bchtest:p0hev5gg3vhq3zkn2jhhj8y8rq2gnlt0fz4f460vpkf56lhuvv9ly7mju5zfh` | Instantiated |
| 3 | Marketplace | `bchtest:pwqhtec02e37qnfejja60pm72e6act2eh07xgxlwr2ls38l6ygakxghqwkz4d` | Instantiated |
| 4 | Auction | `bchtest:pwhtpzcfvzpt0ydzqknrzwwnj7qd5sz4jsp4j4wh7tdlnh84fz59xypaw0zkh` | Instantiated |
| 5 | AuctionState | `bchtest:pwvjmx9tjl5lyw7nws0f8587tkgfsh9h65m3yuju8aqk2hgttetn5qy5e7zkz` | Instantiated |
| 6 | CollectionBid | `bchtest:pd44kq9rs2tlm7cy9ewcljajk6drpdatwdrlxmnlz87rm0wfv3y0x00dpj4qh` | Instantiated |
| 7 | P2PKH | `bchtest:pdl35znqhy5tals7xxe9f6v7vtcarqfa322tnd3wfk89sss75n2eqjvllsscz` | Instantiated |

## Next Steps

### 1. Fund Contracts (Required)
Each contract needs to be funded with test BCH from the faucet before it can be used:

**Get test BCH from faucet**: https://tbch.googol.cash

Send minimum dust amounts (1000 satoshis) to each address above. Include the appropriate NFT or token UTXOs as specified in the deployment guide.

### 2. Update Configuration

Once contracts are funded, record transaction IDs and add addresses to `.env.local`:

```env
NEXT_PUBLIC_CONTRACT_MARKETPLACE=bchtest:pwqhtec02e37qnfejja60pm72e6act2eh07xgxlwr2ls38l6ygakxghqwkz4d
NEXT_PUBLIC_CONTRACT_AUCTION=bchtest:pwhtpzcfvzpt0ydzqknrzwwnj7qd5sz4jsp4j4wh7tdlnh84fz59xypaw0zkh
NEXT_PUBLIC_CONTRACT_AUCTION_STATE=bchtest:pwvjmx9tjl5lyw7nws0f8587tkgfsh9h65m3yuju8aqk2hgttetn5qy5e7zkz
NEXT_PUBLIC_CONTRACT_COLLECTION_BID=bchtest:pd44kq9rs2tlm7cy9ewcljajk6drpdatwdrlxmnlz87rm0wfv3y0x00dpj4qh
NEXT_PUBLIC_CONTRACT_FRACTIONAL_VAULT=bchtest:p0hev5gg3vhq3zkn2jhhj8y8rq2gnlt0fz4f460vpkf56lhuvv9ly7mju5zfh
NEXT_PUBLIC_CONTRACT_FRACTIONAL_CLAIMS=bchtest:pd540ypmpg4sl65pggpecmddfvcanuwveaydt0qqwvcmzl9fl6vl60cw42jsa
NEXT_PUBLIC_CONTRACT_P2PKH=bchtest:pdl35znqhy5tals7xxe9f6v7vtcarqfa322tnd3wfk89sss75n2eqjvllsscz
```

### 3. Verify Deployment

Once funded, verify contracts on the blockchain explorer:
- **Chipnet Explorer**: https://chipnet.chaingraph.cash

Search for contract addresses to confirm they exist and contain the correct locking bytecode.

### 4. Testing

After configuration:
1. Run test suite: `npm test`
2. Test marketplace functionality:
   - Create listings
   - Place bids
   - Execute purchases
3. Test fractionalization:
   - Fractionalize NFTs
   - Claim fractional shares
4. Test auctions and collection bids

## Deployment Files Reference

- **Individual deployment files**: `scripts/deployment-*.json`
- **Deployment guide**: `docs/CONTRACT_DEPLOYMENT.md`
- **Configuration**: `src/lib/bch/config.ts` (with `getDeployedContractAddress()` function)
- **Helper utilities**: `src/lib/bch/deployment-helper.ts`

## Constructor Arguments Used

All contracts were instantiated with example/placeholder arguments. In production, these should be updated with actual values:

- **Marketplace**: Seller PKH, Price, Creator PKH, Royalty %
- **Auction**: Seller PKH, Min Bid, End Time, Creator PKH, Royalty %, Bid Increment
- **AuctionState**: Seller PKH, Auction Locking Bytecode, Tracking Category
- **CollectionBid**: Bidder PKH, Token Category, Bid Salt, Price, Creator PKH, Royalty %
- **FractionalVault**: Shares Category, Total Shares, Reserve Sats, Claims Script Hash
- **FractionalClaims**: Shares Category
- **P2PKH**: Public Key Hash

## Important Notes

1. **Network**: All contracts are on BCH Chipnet (testnet). Migrating to mainnet requires redeployment.
2. **Funding**: Contracts must be funded to be used. Funding UTXOs determine contract state.
3. **Dependencies**: Some contracts can depend on locking bytecode of others (e.g., AuctionState needs Auction bytecode).
4. **Script Hashes**: Computed from locking bytecode for use in dependent contracts - found in respective deployment JSON files.

## Validation Checklist

- [x] All 7 contracts instantiated successfully
- [x] Contract addresses generated
- [x] Deployment scripts created and tested
- [x] Constructor arguments validated
- [ ] Contracts funded with test BCH
- [ ] Transaction IDs recorded
- [ ] Environment variables updated
- [ ] Configuration verified
- [ ] Tests passed
- [ ] Contracts verified on blockchain explorer

---

**Status**: Ready for funding and testing  
**Next Action**: Fund contracts using faucet (https://tbch.googol.cash)
