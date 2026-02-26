# Funding Contracts from Your Wallet

**Your Wallet**: `bchtest:qqrlp7yke0afqctq9hkg8p7gt6dcz8n49qe4gnc4el`

All 7 BAZAAR contracts are now deployed on BCH Chipnet and ready to receive funding from your wallet.

## Quick Summary

| Contract | Address | Amount |
|----------|---------|--------|
| FractionalClaims | `bitcoincash:pd540ypmpg4sl65pggpecmddfvcanuwveaydt0qqwvcmzl9fl6vl60cw42jsa` | 1000+ sats |
| FractionalVault | `bitcoincash:p0hev5gg3vhq3zkn2jhhj8y8rq2gnlt0fz4f460vpkf56lhuvv9ly7mju5zfh` | 1000+ sats |
| Marketplace | `bitcoincash:pwqhtec02e37qnfejja60pm72e6act2eh07xgxlwr2ls38l6ygakxghqwkz4d` | 1000+ sats |
| Auction | `bitcoincash:pwhtpzcfvzpt0ydzqknrzwwnj7qd5sz4jsp4j4wh7tdlnh84fz59xypaw0zkh` | 1000+ sats |
| AuctionState | `bitcoincash:pwvjmx9tjl5lyw7nws0f8587tkgfsh9h65m3yuju8aqk2hgttetn5qy5e7zkz` | 1000+ sats |
| CollectionBid | `bitcoincash:pd44kq9rs2tlm7cy9ewcljajk6drpdatwdrlxmnlz87rm0wfv3y0x00dpj4qh` | 1000+ sats |
| P2PKH | `bitcoincash:pdl35znqhy5tals7xxe9f6v7vtcarqfa322tnd3wfk89sss75n2eqjvllsscz` | 1000+ sats |

**Total Required**: 7000 satoshis (~0.00007000 BCH)

## Funding Steps

### Option 1: Using Your BCH Wallet (Recommended)

1. **Open your BCH Chipnet wallet** with `bchtest:qqrlp7yke0afqctq9hkg8p7gt6dcz8n49qe4gnc4el`

2. **For each contract address**, send a transaction:
   ```
   Amount: 1000+ satoshis
   To: [contract address from table above]
   ```

3. **Wait for confirmation** before proceeding (typically 5-10 seconds on testnet)

4. **Track funding progress**:
   - Check each address on explorer: https://chipnet.chaingraph.cash
   - Search for each contract address to confirm it has received funds

### Option 2: Verify Funding

After funding, run the verification script to check all contracts:

```bash
npm run verify-contracts
```

This will check the blockchain for UTXOs at each contract address.

## Wallet-Specific Instructions

### If using Bitcoin.com Wallet (Mobile/Desktop):
1. Open Bitcoin.com Wallet
2. Make sure you're on **Bitcoin Cash Testnet** (not Mainnet)
3. Tap "Send"
4. Paste contract address
5. Enter 1000+ satoshis
6. Confirm and send
7. Wait for confirmation

### If using Electron Cash (Desktop):
1. Open Electron Cash
2. Verify you're on **Testnet** (View → Show Testnet)
3. Click "Send"
4. Paste contract address in recipient field
5. Enter amount: 1000+ satoshis
6. Click "Send"
7. Review and confirm transaction

### If using Command Line / Manual:
If you have BCH CLI tools installed:

```bash
# Get current balance
bitcoin-cli -testnet getbalance

# Send to contract
bitcoin-cli -testnet sendtoaddress "bitcoincash:pd540ypmpg4sl65pggpecmddfvcanuwveaydt0qqwvcmzl9fl6vl60cw42jsa" 0.00001
```

## Troubleshooting

### "Address format error"
- Use `bitcoincash:` prefix (not `bchtest:`)
- Make sure you're on **Testnet** not Mainnet
- Double-check the address is copied correctly

### "Insufficient balance"
- Make sure you have test BCH in your wallet
- Remember: only 0.00007 BCH total is needed

### Transaction not confirming
- Testnet confirmations are instant/nearly instant
- If after 30 seconds no confirmation, check:
  - Explorer: https://chipnet.chaingraph.cash
  - Search your transaction ID
  - Verify amount is correct (1000+ sats)

## Verify Deployment

Once all contracts are funded, verify on the blockchain explorer:

**Explorer URL**: https://chipnet.chaingraph.cash

**Steps**:
1. Go to explorer
2. Search for each contract address
3. Verify it shows the incoming transaction
4. Confirm amount received (1000+ satoshis)

Example: Search for `pd540ypmpg4sl65pggpecmddfvcanuwveaydt0qqwvcmzl9fl6vl60cw42jsa`

## Next Steps After Funding

1. ✅ Fund all 7 contracts (you are here)
2. Verify funding on blockchain explorer
3. Run: `npm run dev` to start application
4. Test marketplace functionality:
   - Create listings
   - Place bids
   - Execute purchases
5. (Optional) Run test suite: `npm test`

## Important Notes

- **Test Network**: All funding is on BCH Chipnet (testnet)
- **Not Real Money**: Test BCH has no value
- **Contracts are Ready**: No redeployment needed
- **Configuration**: Already in `.env.local` with all contract addresses

## Support

If you encounter issues:
1. Check the explorer for transaction status
2. Verify address format (should have `bitcoincash:` prefix)
3. Ensure you're using Chipnet (testnet), not mainnet
4. Check your wallet has sufficient test BCH

---

**Funding Guide**: February 26, 2026  
**Network**: BCH Chipnet (Testnet)  
**Status**: Ready for Funding
