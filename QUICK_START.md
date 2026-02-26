# 🚀 BAZAAR Deployment - Quick Start Guide

## ✅ Current Status
All 7 smart contracts have been successfully instantiated on BCH Chipnet with generated addresses.

## 📋 Your Next Steps

### Step 1: Fund Contracts (5-10 minutes)
**Get test BCH**: https://tbch.googol.cash

Send minimum 1000 satoshis to each contract address:
```
FractionalClaims   → bchtest:pd540ypmpg4sl65pggpecmddfvcanuwveaydt0qqwvcmzl9fl6vl60cw42jsa
FractionalVault    → bchtest:p0hev5gg3vhq3zkn2jhhj8y8rq2gnlt0fz4f460vpkf56lhuvv9ly7mju5zfh
Marketplace        → bchtest:pwqhtec02e37qnfejja60pm72e6act2eh07xgxlwr2ls38l6ygakxghqwkz4d
Auction            → bchtest:pwhtpzcfvzpt0ydzqknrzwwnj7qd5sz4jsp4j4wh7tdlnh84fz59xypaw0zkh
AuctionState       → bchtest:pwvjmx9tjl5lyw7nws0f8587tkgfsh9h65m3yuju8aqk2hgttetn5qy5e7zkz
CollectionBid      → bchtest:pd44kq9rs2tlm7cy9ewcljajk6drpdatwdrlxmnlz87rm0wfv3y0x00dpj4qh
P2PKH              → bchtest:pdl35znqhy5tals7xxe9f6v7vtcarqfa322tnd3wfk89sss75n2eqjvllsscz
```

### Step 2: Update Configuration (2 minutes)
Create or update `.env.local` with deployed addresses:

```bash
NEXT_PUBLIC_CONTRACT_MARKETPLACE=bchtest:pwqhtec02e37qnfejja60pm72e6act2eh07xgxlwr2ls38l6ygakxghqwkz4d
NEXT_PUBLIC_CONTRACT_AUCTION=bchtest:pwhtpzcfvzpt0ydzqknrzwwnj7qd5sz4jsp4j4wh7tdlnh84fz59xypaw0zkh
NEXT_PUBLIC_CONTRACT_AUCTION_STATE=bchtest:pwvjmx9tjl5lyw7nws0f8587tkgfsh9h65m3yuju8aqk2hgttetn5qy5e7zkz
NEXT_PUBLIC_CONTRACT_COLLECTION_BID=bchtest:pd44kq9rs2tlm7cy9ewcljajk6drpdatwdrlxmnlz87rm0wfv3y0x00dpj4qh
NEXT_PUBLIC_CONTRACT_FRACTIONAL_VAULT=bchtest:p0hev5gg3vhq3zkn2jhhj8y8rq2gnlt0fz4f460vpkf56lhuvv9ly7mju5zfh
NEXT_PUBLIC_CONTRACT_FRACTIONAL_CLAIMS=bchtest:pd540ypmpg4sl65pggpecmddfvcanuwveaydt0qqwvcmzl9fl6vl60cw42jsa
NEXT_PUBLIC_CONTRACT_P2PKH=bchtest:pdl35znqhy5tals7xxe9f6v7vtcarqfa322tnd3wfk89sss75n2eqjvllsscz
```

### Step 3: Optional - Verify Contracts (2 minutes)
Check contracts on blockchain explorer: https://chipnet.chaingraph.cash

Search for any contract address above to verify it exists on chain.

### Step 4: Test Integration (5-15 minutes)
```bash
npm test
```

### Step 5: Start Development Server
```bash
npm run dev
```

## 📂 Reference Files

- **Deployment Tracker**: [DEPLOYMENT_TRACKER.md](DEPLOYMENT_TRACKER.md)
- **Full Guide**: [docs/CONTRACT_DEPLOYMENT.md](docs/CONTRACT_DEPLOYMENT.md)
- **Registry**: [docs/DEPLOYMENT.json](docs/DEPLOYMENT.json)
- **Configuration**: [src/lib/bch/config.ts](src/lib/bch/config.ts)
- **Helper Utilities**: [src/lib/bch/deployment-helper.ts](src/lib/bch/deployment-helper.ts)

## 🔍 Key Files Created

- `scripts/deploy-*.js` - Individual deployment scripts for each contract
- `scripts/deployment-*.json` - Contract metadata and locking bytecodes
- `DEPLOYMENT_TRACKER.md` - Complete deployment status and checklist

## ⚡ Total Time to Live

- **Funding contracts**: 5-10 min
- **Configuration**: 2 min
- **Verification**: 2 min (optional)
- **Total**: ~10-15 minutes

## 📝 Notes

All contracts are instantiated with example constructor arguments. These are suitable for testing but should be updated with actual values for production use (real seller PKHs, prices, timestamps, etc.).

---

**Status**: ✅ Contracts Deployed & Ready  
**Next Action**: Fund contracts via testnet faucet  
**Deployment Date**: February 26, 2026
