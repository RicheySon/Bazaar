# Fractionalized NFTs — Implementation Plan

## Design decisions (confirmed)
- **Buyout model**: Fixed-price (pay ≥ reserve → get NFT, proceeds go on-chain to claims covenant)
- **Share supply**: 1,000,000 FT units per fractionalization (6 display decimals)

---

## On-chain architecture

### Token category (created at genesis)
One `sharesCategory` per fractionalized NFT, containing:
- **1,000,000 FT** (fungible shares) → go to owner for distribution/sale
- **1 mutable NFT** (state tracker, commitment = `bytes8(1_000_000)` = remainingShares) → sent directly to claims covenant

`sharesCategory` = txid of the **genesis input UTXO** (known pre-signing, no circularity)

### Two CashScript covenants

#### `FractionalVault` — holds the original NFT
Constructor: `bytes32 sharesCategory, int totalShares, int reserveSats, bytes32 claimsScriptHash`

| Path | Inputs | Outputs | Key checks |
|------|--------|---------|------------|
| `redeemAll(pubkey pk, sig s)` | [0] vault, [1] full FT supply | [0] NFT to redeemer | sig valid; input[1].tokenAmount == totalShares; output[0] has original NFT + P2PKH(pkh) |
| `buyout(bytes20 buyerPkh)` | [0] vault, [1] claims UTXO, [2+] buyer BCH | [0] new claims (≥ reserve), [1] NFT to buyer | output[0].lockingBytecode == P2SH32(claimsScriptHash); output[0].value ≥ reserveSats; output[1] has original NFT + P2PKH(buyerPkh) |

#### `FractionalClaims` — holds BCH proceeds + mutable tracking NFT
Constructor: `bytes32 sharesCategory`

| Path | Inputs | Outputs | Key checks |
|------|--------|---------|------------|
| `receiveProceeds()` | [0] claims UTXO | [0] same claims UTXO | same lockingBytecode, same tokenCategory (mutable NFT), same nftCommitment, value > input value |
| `claim(int burnAmount, bytes20 claimantPkh)` | [0] claims, [1] claimant FT | [0] updated claims (if shares remain), [1/0] payout | remainingShares from nftCommitment; payout = burnAmount * remainingSats / remainingShares; FT consumed; updated commitment = bytes8(newRemainingShares) |

### State encoding
- Claims mutable NFT commitment (8 bytes): `bytes8(remainingShares)` — `remainingSats` is read from `tx.inputs[this.activeInputIndex].value` (no encoding needed)

### Key atomic invariant (buyout tx)
Both vault `buyout()` and claims `receiveProceeds()` are inputs in the **same transaction**:
- Vault checks: output[0] is claims contract P2SH32 + value ≥ reserve
- Claims checks: mutable NFT preserved in output[0] + BCH increased
- Together: airtight — can't route proceeds elsewhere

---

## Transaction flows

### Fractionalize (1 genesis tx + pre-check for vout=0)
```
Input[0]:  genesis UTXO (vout=0, BCH only)  ← same self-send pattern as mintNFT
Input[1]:  original NFT UTXO (the NFT being fractionalized)
Input[2+]: fee BCH UTXOs

Output[0]: 1,000,000 FTs → owner tokenAddress
Output[1]: mutable NFT (commitment=bytes8(1_000_000)) → claims P2SH32
Output[2]: original NFT → vault P2SH32
Output[3]: change → owner address
```
Pre-steps (server-side, same as mintNFT):
1. Find genesis UTXO (vout=0, no token)
2. If none: prep self-send first (identical to existing prepGenesis pattern)
3. Compute claims contract → `claimsScriptHash`
4. Compute vault contract address → `vaultP2SH32`
5. Build and broadcast genesis tx

### Buyout
```
Input[0]:  vault UTXO (unlock: buyout(buyerPkh))
Input[1]:  claims UTXO (unlock: receiveProceeds())
Input[2+]: buyer BCH UTXOs

Output[0]: new claims UTXO — P2SH32, value ≥ reserveSats, mutable NFT preserved, same nftCommitment
Output[1]: original NFT → buyer P2PKH
Output[2]: change → buyer
```

### Claim
```
Input[0]:  claims UTXO (unlock: claim(burnAmount, claimantPkh))
Input[1]:  claimant FT UTXO (tokenAmount = burnAmount)
Input[2+]: claimant BCH for fees

Output[0]: updated claims UTXO (if shares remain: new nftCommitment, reduced BCH) OR payout (if last claim)
Output[1]: payout to claimantPkh (if shares remain)
```

---

## Files to create / modify

### New CashScript contracts
1. `contracts/fractional-vault.cash`
2. `contracts/fractional-claims.cash`

### Compiled artifacts (generated via `cashc`)
3. `src/lib/bch/artifacts/fractional-vault.json`
4. `src/lib/bch/artifacts/fractional-claims.json`

### New server-side logic
5. `src/lib/bch/fractional-contracts.ts`
   - `buildVaultContract(sharesCategory, totalShares, reserveSats, claimsScriptHash)` → Contract
   - `buildClaimsContract(sharesCategory)` → Contract
   - `fractionalizeNFT(privateKey, originalNftUtxo, ownerAddress, ownerPkh, reserveSats)` → TransactionResult + sharesCategory
   - `buyoutVault(privateKey, buyerAddress, buyerPkh, sharesCategory, totalShares, reserveSats, claimsScriptHash)` → TransactionResult
   - `claimProceeds(privateKey, claimantAddress, claimantPkh, sharesCategory, burnAmount)` → TransactionResult
   - `getVaultStatus(sharesCategory, totalShares, reserveSats, claimsScriptHash)` → VaultStatus

### New API routes
6. `src/app/api/fractionalize/route.ts` — POST
7. `src/app/api/fractionalize/buyout/route.ts` — POST
8. `src/app/api/fractionalize/claim/route.ts` — POST
9. `src/app/api/fractionalize/[category]/route.ts` — GET

### New UI
10. `src/components/nft/FractionalizeModal.tsx` — 3-phase modal (form → processing → done)
11. `src/app/fractionalized/[category]/page.tsx` — full page: vault status, shares owned, buyout button, claim button

### Type additions
12. `src/lib/types.ts` (modify) — add `FractionalVaultInfo`, `VaultStatus`

### Modify existing
13. `src/app/profile/[address]/page.tsx` — add "Fractionalize" button to own profile Owned tab (next to "List on Bazaar")

---

## CashScript contracts (exact code)

### fractional-vault.cash
```cashscript
pragma cashscript >=0.10.0;

contract FractionalVault(
    bytes32 sharesCategory,
    int totalShares,
    int reserveSats,
    bytes32 claimsScriptHash
) {
    // Burn 100% of shares → receive the original NFT back
    function redeemAll(pubkey pk, sig s) {
        require(checkSig(s, pk));
        bytes20 pkh = hash160(pk);

        // Input[1] must carry full shares supply of this category
        require(tx.inputs[1].tokenCategory.split(32)[0] == sharesCategory);
        require(tx.inputs[1].tokenAmount == totalShares);

        // Output[0] must deliver the original NFT to the redeemer
        bytes vaultNftCat = tx.inputs[this.activeInputIndex].tokenCategory;
        require(tx.outputs[0].tokenCategory == vaultNftCat);
        require(tx.outputs[0].lockingBytecode == new LockingBytecodeP2PKH(pkh));
    }

    // Pay ≥ reserve → get original NFT; proceeds locked into claims covenant
    function buyout(bytes20 buyerPkh) {
        // Output[0]: claims contract receives ≥ reserveSats
        bytes35 claimsLocking = new LockingBytecodeP2SH32(claimsScriptHash);
        require(tx.outputs[0].lockingBytecode == claimsLocking);
        require(tx.outputs[0].value >= reserveSats);

        // Output[1]: original NFT to buyer
        bytes vaultNftCat = tx.inputs[this.activeInputIndex].tokenCategory;
        require(tx.outputs[1].tokenCategory == vaultNftCat);
        require(tx.outputs[1].lockingBytecode == new LockingBytecodeP2PKH(buyerPkh));
    }
}
```

### fractional-claims.cash
```cashscript
pragma cashscript >=0.10.0;

contract FractionalClaims(
    bytes32 sharesCategory
) {
    // Receive buyout proceeds — BCH added, mutable NFT state unchanged
    function receiveProceeds() {
        require(tx.outputs[0].lockingBytecode == tx.inputs[this.activeInputIndex].lockingBytecode);
        require(tx.outputs[0].tokenCategory == tx.inputs[this.activeInputIndex].tokenCategory);
        require(tx.outputs[0].nftCommitment == tx.inputs[this.activeInputIndex].nftCommitment);
        require(tx.outputs[0].value > tx.inputs[this.activeInputIndex].value);
    }

    // Burn shares → receive pro-rata BCH payout
    function claim(int burnAmount, bytes20 claimantPkh) {
        // Read state from this UTXO's mutable NFT
        int remainingShares = int(tx.inputs[this.activeInputIndex].nftCommitment);
        int remainingSats = tx.inputs[this.activeInputIndex].value;

        // Input[1]: claimant's FT shares of this category
        require(tx.inputs[1].tokenCategory.split(32)[0] == sharesCategory);
        require(tx.inputs[1].tokenAmount == burnAmount);
        require(burnAmount > 0);
        require(burnAmount <= remainingShares);

        // Pro-rata payout (floor division — rounding dust stays in claims)
        int payout = burnAmount * remainingSats / remainingShares;
        int newRemainingShares = remainingShares - burnAmount;
        int newRemainingSats = remainingSats - payout;

        if (newRemainingShares > 0) {
            // Continue: recreate claims UTXO with updated state
            require(tx.outputs[0].lockingBytecode == tx.inputs[this.activeInputIndex].lockingBytecode);
            require(tx.outputs[0].tokenCategory == tx.inputs[this.activeInputIndex].tokenCategory);
            require(tx.outputs[0].nftCommitment == bytes8(newRemainingShares));
            require(tx.outputs[0].value >= newRemainingSats);
            // Claimant payout
            require(tx.outputs[1].lockingBytecode == new LockingBytecodeP2PKH(claimantPkh));
            require(tx.outputs[1].value >= payout);
        } else {
            // Last claim: all shares burned, claims UTXO consumed
            require(tx.outputs[0].lockingBytecode == new LockingBytecodeP2PKH(claimantPkh));
            require(tx.outputs[0].value >= payout);
        }
    }
}
```

---

## Notes / risks

- **`LockingBytecodeP2SH32`**: CashScript 0.10 / cashc 0.12 should have this. If not, fall back to manual bytecode: `0xaa20 ++ claimsScriptHash ++ 0x87` (35 bytes).
- **`tx.inputs[i].value`**: BCH introspection `OP_INPUTVALUE` — supported since May 2022. CashScript 0.10 exposes this as `tx.inputs[i].value`. Verify at compile time.
- **`bytes8(n)` / `int(bytes)`**: CashScript arithmetic casts — supported. `int(bytes)` reads little-endian.
- **Loop-free**: Both contracts use fixed input/output indices. The claim tx structure is: input[0]=claims, input[1]=shares FT, output[0]=updated claims (if any), output[1]=payout.
- **Rounding dust**: The last `payout` via floor division may leave 1–2 sats in the final claims UTXO when `newRemainingShares == 0`. This is lost as P2SH32 with no redeem path. Acceptable for Phase 1.
- **Shares consolidation for redeemAll**: User must consolidate all 1,000,000 FTs into one UTXO before calling redeemAll. Handled in frontend with a consolidation step.
- **vout=0 for genesis**: Same self-send prep pattern as existing `mintNFT`. Already in `contracts.ts`.
