// Fractionalized NFT contract interactions
// Vault (holds original NFT) + Claims (holds BCH proceeds, mutable tracking NFT)
// Shares: 1,000,000 FTs per fractionalization (6 display decimals)

import { Contract, SignatureTemplate, Artifact, TransactionBuilder } from 'cashscript';
import { binToHex, decodeCashAddress } from '@bitauth/libauth';
import { sha256 } from '@noble/hashes/sha256';
import type { TransactionResult } from '@/lib/types';
import { getProvider, getUtxos, selectUtxos, buildP2PKHContract } from '@/lib/bch/contracts';
import { hexToBytes } from '@/lib/utils';
import type { Utxo } from 'cashscript';
import fractionalVaultArtifact from './artifacts/fractional-vault.json';
import fractionalClaimsArtifact from './artifacts/fractional-claims.json';

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

export const TOTAL_SHARES = 1_000_000n;

// bytes8(1_000_000) in little-endian: 40 42 0F 00 00 00 00 00
export const INITIAL_COMMITMENT_HEX = '40420f0000000000';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface FractionalVaultInfo {
  sharesCategory: string;   // 32-byte hex (genesis input txid)
  claimsScriptHash: string; // 32-byte hex (sha256d of claims redeem script)
  totalShares: bigint;      // 1_000_000n
  reserveSats: bigint;      // fixed buyout price
  vaultAddress: string;     // P2SH32 token-capable address
  claimsAddress: string;    // P2SH32 token-capable address
}

export interface VaultStatus {
  active: boolean;          // vault UTXO exists (NFT not yet bought out)
  boughtOut: boolean;       // vault gone, claims holds BCH proceeds
  claimsHasBch: boolean;    // claims UTXO found
  remainingShares: bigint;  // from mutable NFT commitment in claims UTXO
  remainingSats: bigint;    // BCH remaining in claims UTXO
  totalShares: bigint;
  reserveSats: bigint;
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

function buildVaultContract(
  sharesCategory: string,
  totalShares: bigint,
  reserveSats: bigint,
  claimsScriptHash: string,
): Contract {
  return new Contract(
    fractionalVaultArtifact as Artifact,
    [
      Uint8Array.from(hexToBytes(sharesCategory)),
      totalShares,
      reserveSats,
      Uint8Array.from(hexToBytes(claimsScriptHash)),
    ],
    { provider: getProvider() },
  );
}

function buildClaimsContract(sharesCategory: string): Contract {
  return new Contract(
    fractionalClaimsArtifact as Artifact,
    [Uint8Array.from(hexToBytes(sharesCategory))],
    { provider: getProvider() },
  );
}

/** sha256d of the claims redeem script — used as vault constructor param */
function computeClaimsScriptHash(claimsContract: Contract): string {
  const redeemScript = hexToBytes(claimsContract.bytecode);
  return binToHex(sha256(sha256(redeemScript)));
}

/** Decode 8-byte little-endian hex commitment → BigInt */
function decodeBigIntLE8(hex: string): bigint {
  const bytes = hexToBytes(hex);
  let result = 0n;
  for (let i = Math.min(bytes.length, 8) - 1; i >= 0; i--) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}

/** Encode BigInt → 8-byte little-endian hex */
function encodeBigIntLE8(n: bigint): string {
  const bytes = new Uint8Array(8);
  let temp = n;
  for (let i = 0; i < 8; i++) {
    bytes[i] = Number(temp & 0xffn);
    temp >>= 8n;
  }
  return binToHex(bytes);
}

/** Extract 20-byte PKH from a CashAddr string */
function pkhBytesFromAddress(address: string): Uint8Array {
  const decoded = decodeCashAddress(address);
  if (typeof decoded === 'string') throw new Error('Invalid address: ' + decoded);
  return new Uint8Array(decoded.payload);
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Pre-compute the vault and claims addresses for a given genesis input.
 * sharesCategory = txid of the genesis input UTXO (known before signing).
 */
export function buildVaultInfo(
  sharesCategory: string,
  reserveSats: bigint,
): FractionalVaultInfo {
  const claimsContract = buildClaimsContract(sharesCategory);
  const claimsScriptHash = computeClaimsScriptHash(claimsContract);
  const vaultContract = buildVaultContract(sharesCategory, TOTAL_SHARES, reserveSats, claimsScriptHash);
  return {
    sharesCategory,
    claimsScriptHash,
    totalShares: TOTAL_SHARES,
    reserveSats,
    vaultAddress: vaultContract.tokenAddress,
    claimsAddress: claimsContract.tokenAddress,
  };
}

/**
 * Fractionalize an NFT.
 *
 * One genesis transaction:
 *   Input[0]:  genesis UTXO (vout=0, BCH only)  → creates sharesCategory
 *   Input[1]:  original NFT UTXO
 *   Input[2+]: BCH fee UTXOs
 *
 *   Output[0]: 1,000,000 FT shares → ownerTokenAddress
 *   Output[1]: mutable tracking NFT (bytes8(1M) commitment) → claims P2SH32
 *   Output[2]: original NFT → vault P2SH32
 *   Output[3]: change → ownerAddress
 */
export async function fractionalizeNFT(
  privateKey: Uint8Array,
  ownerPkh: string,
  ownerAddress: string,
  ownerTokenAddress: string,
  nftUtxo: {
    txid: string;
    vout: number;
    satoshis: string;
    tokenCategory: string;
    nftCommitment: string;
    nftCapability: string;
  },
  reserveSats: bigint,
): Promise<TransactionResult & { sharesCategory?: string; vaultInfo?: FractionalVaultInfo }> {
  try {
    const userContract = buildP2PKHContract(ownerPkh);
    const signatureTemplate = new SignatureTemplate(privateKey);
    const pk = signatureTemplate.getPublicKey();

    const utxos = await getUtxos(ownerAddress);
    if (utxos.length === 0) {
      return { success: false, error: 'No UTXOs available. Please fund your wallet.' };
    }

    let nonTokenUtxos = utxos.filter(u => !u.token);
    let genesisInput: Utxo | undefined = nonTokenUtxos.find(u => u.vout === 0);

    // Auto-prep: create a self-send to produce a fresh vout=0 UTXO (same pattern as mintNFT)
    if (!genesisInput) {
      const sorted = [...nonTokenUtxos].sort((a, b) => Number(b.satoshis - a.satoshis));
      if (sorted.length === 0 || sorted[0].satoshis < 1200n) {
        return {
          success: false,
          error: 'No genesis-capable UTXO. Please fund your wallet from the Chipnet faucet.',
        };
      }
      const prepInput = sorted[0];
      const prepFee = 400n;
      const prepTx = userContract.functions.spend(pk, signatureTemplate)
        .fromP2PKH([prepInput], signatureTemplate)
        .to(ownerAddress, prepInput.satoshis - prepFee)
        .withTime(0)
        .withHardcodedFee(prepFee)
        .withoutChange();
      const prepHex = await prepTx.build();
      const prepTxid = await getProvider().sendRawTransaction(prepHex);

      let freshUtxos: Utxo[] = [];
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 1500));
        freshUtxos = await getUtxos(ownerAddress);
        genesisInput = freshUtxos.find(u => u.txid === prepTxid && u.vout === 0 && !u.token);
        if (genesisInput) break;
      }
      if (!genesisInput) {
        return { success: false, error: 'Prep transaction not confirmed. Please try again.' };
      }
      nonTokenUtxos = freshUtxos.filter(u => !u.token);
    }

    // sharesCategory = txid of genesis input (BCH protocol spec)
    const sharesCategory = genesisInput.txid;
    const vaultInfo = buildVaultInfo(sharesCategory, reserveSats);

    const nftInput: Utxo = {
      txid: nftUtxo.txid,
      vout: nftUtxo.vout,
      satoshis: BigInt(nftUtxo.satoshis),
      token: {
        category: nftUtxo.tokenCategory,
        amount: 0n,
        nft: {
          capability: (nftUtxo.nftCapability || 'none') as 'none' | 'mutable' | 'minting',
          commitment: nftUtxo.nftCommitment,
        },
      },
    };

    // Gather inputs: genesis first, then NFT, then fee UTXOs
    const otherBch = nonTokenUtxos
      .filter(u => !(u.txid === genesisInput!.txid && u.vout === genesisInput!.vout))
      .sort((a, b) => Number(b.satoshis - a.satoshis));

    const allInputs: Utxo[] = [genesisInput, nftInput];
    let totalIn = genesisInput.satoshis + nftInput.satoshis;
    const target = 5000n; // 3 × 1000n dust outputs + 2000n fee buffer
    for (const u of otherBch) {
      if (totalIn >= target) break;
      allInputs.push(u);
      totalIn += u.satoshis;
    }

    const fee = BigInt(Math.max(800, allInputs.length * 148 + 300));
    const outputsDust = 3000n; // 3 token outputs × 1000n each
    const change = totalIn - outputsDust - fee;
    if (change < -100n) {
      return {
        success: false,
        error: `Insufficient funds. Need at least ${outputsDust + fee} sats, have ${totalIn}.`,
      };
    }

    const capability = (nftUtxo.nftCapability || 'none') as 'none' | 'mutable' | 'minting';

    const tx = userContract.functions.spend(pk, signatureTemplate)
      .fromP2PKH(allInputs, signatureTemplate)
      // Output[0]: 1,000,000 FT shares to owner's token-capable address
      .to(ownerTokenAddress, 1000n, {
        category: sharesCategory,
        amount: TOTAL_SHARES,
      } as any)
      // Output[1]: mutable tracking NFT (initial commitment = bytes8(1_000_000)) to claims
      .to(vaultInfo.claimsAddress, 1000n, {
        category: sharesCategory,
        amount: 0n,
        nft: { capability: 'mutable', commitment: INITIAL_COMMITMENT_HEX },
      } as any)
      // Output[2]: original NFT to vault
      .to(vaultInfo.vaultAddress, 1000n, {
        category: nftUtxo.tokenCategory,
        amount: 0n,
        nft: { capability, commitment: nftUtxo.nftCommitment },
      } as any)
      .withTime(0)
      .withHardcodedFee(fee)
      .withoutChange();

    if (change > 546n) {
      tx.to(ownerAddress, change);
    }

    const rawHex = await tx.build();

    // Debug: if FRACTIONALIZE_DRY_RUN=true, don't broadcast — return and save raw hex for inspection
    if (process.env.FRACTIONALIZE_DRY_RUN === 'true' || process.env.DEBUG_FRACTIONALIZE_RAW === 'true') {
      try {
        // attempt to persist the raw hex for offline inspection
        // write to repository scripts/debug-output for easy retrieval
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require('fs');
        const path = require('path');
        const outDir = path.join(process.cwd(), 'scripts', 'debug-output');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        const fileName = `fractionalize-raw-${Date.now()}.txt`;
        fs.writeFileSync(path.join(outDir, fileName), rawHex, 'utf8');
        console.log('[fractionalizeNFT] Dry-run saved raw tx to', path.join('scripts', 'debug-output', fileName));
      } catch (e) {
        console.error('[fractionalizeNFT] Failed to write debug raw tx:', e);
      }

      return { success: true, rawHex, tokenCategory: sharesCategory, sharesCategory, vaultInfo } as any;
    }

    // Add timeout to broadcast
    const { withTimeout } = require('./contracts');
    const ELECTRUM_TIMEOUT_MS = 15000;
    const txid = await withTimeout(getProvider().sendRawTransaction(rawHex), ELECTRUM_TIMEOUT_MS, `Electrum timeout after ${ELECTRUM_TIMEOUT_MS}ms`);

    return { success: true, txid, tokenCategory: sharesCategory, sharesCategory, vaultInfo };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fractionalize NFT',
    };
  }
}

/**
 * Buyout: buyer pays ≥ reserveSats → receives original NFT; proceeds go to claims.
 *
 * Atomic two-contract transaction via TransactionBuilder:
 *   Input[0]: vault UTXO     (vault.buyout)
 *   Input[1]: claims UTXO    (claims.receiveProceeds)
 *   Input[2+]: buyer BCH UTXOs
 *
 *   Output[0]: new claims UTXO (≥ reserveSats BCH, mutable NFT preserved)
 *   Output[1]: original NFT to buyer
 *   Output[2]: change to buyer
 */
export async function buyoutVault(
  privateKey: Uint8Array,
  buyerAddress: string,
  sharesCategory: string,
  reserveSats: bigint,
  nftCategory: string,
  nftCommitment: string,
  nftCapability: string,
): Promise<TransactionResult> {
  try {
    const signatureTemplate = new SignatureTemplate(privateKey);
    const claimsContract = buildClaimsContract(sharesCategory);
    const claimsScriptHash = computeClaimsScriptHash(claimsContract);
    const vaultContract = buildVaultContract(sharesCategory, TOTAL_SHARES, reserveSats, claimsScriptHash);

    // Fetch vault UTXO (holds original NFT)
    const vaultUtxos = await vaultContract.getUtxos();
    const vaultUtxo = vaultUtxos.find(
      u => u.token?.category === nftCategory && u.token?.nft,
    );
    if (!vaultUtxo) throw new Error('Vault UTXO not found. NFT may already be bought out.');

    // Fetch claims UTXO (holds mutable tracking NFT + dust BCH)
    const claimsUtxos = await claimsContract.getUtxos();
    const claimsUtxo = claimsUtxos.find(
      u => u.token?.category === sharesCategory && u.token?.nft?.capability === 'mutable',
    );
    if (!claimsUtxo) throw new Error('Claims UTXO not found.');

    // Buyer BCH inputs
    const buyerUtxos = await getUtxos(buyerAddress);
    const fundingUtxos = selectUtxos(buyerUtxos, reserveSats + 4000n);

    const fee = 2000n;
    const totalIn =
      fundingUtxos.reduce((s, u) => s + u.satoshis, 0n) +
      vaultUtxo.satoshis +
      claimsUtxo.satoshis;
    // Outputs: claims(reserveSats) + NFT(1000) + change
    const change = totalIn - reserveSats - 1000n - fee;

    const buyerPkhBytes = pkhBytesFromAddress(buyerAddress);
    const cap = (nftCapability || 'none') as 'none' | 'mutable' | 'minting';

    const builder = new TransactionBuilder({ provider: getProvider() });

    // Input[0]: vault — unlocked by vault.buyout(buyerPkh)
    builder.addInput(vaultUtxo, vaultContract.unlock.buyout(buyerPkhBytes));
    // Input[1]: claims — unlocked by claims.receiveProceeds()
    builder.addInput(claimsUtxo, claimsContract.unlock.receiveProceeds());
    // Input[2+]: buyer BCH (P2PKH)
    builder.addInputs(fundingUtxos, signatureTemplate.unlockP2PKH());

    // Output[0]: new claims UTXO — same P2SH32, same mutable NFT commitment, ≥ reserveSats BCH
    builder.addOutput({
      to: claimsContract.tokenAddress,
      amount: reserveSats,
      token: {
        category: sharesCategory,
        amount: 0n,
        nft: { capability: 'mutable', commitment: claimsUtxo.token!.nft!.commitment },
      },
    });
    // Output[1]: original NFT to buyer
    builder.addOutput({
      to: buyerAddress,
      amount: 1000n,
      token: {
        category: nftCategory,
        amount: 0n,
        nft: { capability: cap, commitment: nftCommitment },
      },
    });
    if (change > 546n) {
      builder.addOutput({ to: buyerAddress, amount: change });
    }
    builder.setLocktime(0);

    const rawHex = builder.build();
    const txid = await getProvider().sendRawTransaction(rawHex);
    return { success: true, txid };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to buyout vault',
    };
  }
}

/**
 * Redeem all shares: burn 100% of FT supply → receive original NFT back.
 *
 *   Input[0]: vault UTXO (vault.redeemAll(pk, sig))
 *   Input[1]: owner's FT UTXO — exactly 1,000,000 shares
 *   Input[2+]: BCH fee UTXOs
 *
 *   Output[0]: original NFT to owner P2PKH
 *   Output[1]: change to owner
 */
export async function redeemAllShares(
  privateKey: Uint8Array,
  ownerAddress: string,
  sharesCategory: string,
  reserveSats: bigint,
  nftCategory: string,
): Promise<TransactionResult> {
  try {
    const signatureTemplate = new SignatureTemplate(privateKey);
    const claimsContract = buildClaimsContract(sharesCategory);
    const claimsScriptHash = computeClaimsScriptHash(claimsContract);
    const vaultContract = buildVaultContract(sharesCategory, TOTAL_SHARES, reserveSats, claimsScriptHash);

    // Fetch vault UTXO (holds original NFT)
    const vaultUtxos = await vaultContract.getUtxos();
    const vaultUtxo = vaultUtxos.find(u => u.token?.category === nftCategory && u.token?.nft);
    if (!vaultUtxo) throw new Error('Vault UTXO not found. The NFT may already have been redeemed or bought out.');

    // Find owner's FT UTXO(s) of sharesCategory
    const ownerAllUtxos = await getUtxos(ownerAddress);
    const ftUtxos = ownerAllUtxos.filter(
      u => u.token?.category === sharesCategory && !u.token?.nft && u.token!.amount > 0n,
    );
    const totalOwned = ftUtxos.reduce((s, u) => s + u.token!.amount, 0n);

    if (totalOwned < TOTAL_SHARES) {
      throw new Error(
        `You only own ${totalOwned.toLocaleString()} of ${TOTAL_SHARES.toLocaleString()} required shares.`,
      );
    }
    if (ftUtxos.length > 1) {
      throw new Error(
        'Your shares are split across multiple UTXOs. Consolidate them into one UTXO first by sending them all to yourself.',
      );
    }

    const ftUtxo = ftUtxos[0];
    const feeUtxos = selectUtxos(ownerAllUtxos.filter(u => !u.token), 3000n);
    const fee = 2000n;
    const feeIn = feeUtxos.reduce((s, u) => s + u.satoshis, 0n) + vaultUtxo.satoshis + ftUtxo.satoshis;
    const change = feeIn - 1000n - fee;

    const nftCap = (vaultUtxo.token!.nft!.capability || 'none') as 'none' | 'mutable' | 'minting';
    const nftCommitment = vaultUtxo.token!.nft!.commitment || '';

    const builder = new TransactionBuilder({ provider: getProvider() });
    const pk = signatureTemplate.getPublicKey();

    // Input[0]: vault UTXO — vault.redeemAll(pk, sig)
    builder.addInput(vaultUtxo, vaultContract.unlock.redeemAll(pk, signatureTemplate));
    // Input[1]: FT UTXO with all 1M shares (P2PKH, consumed)
    builder.addInput(ftUtxo, signatureTemplate.unlockP2PKH());
    // Input[2+]: BCH fee UTXOs
    builder.addInputs(feeUtxos, signatureTemplate.unlockP2PKH());

    // Output[0]: original NFT to owner
    builder.addOutput({
      to: ownerAddress,
      amount: 1000n,
      token: {
        category: nftCategory,
        amount: 0n,
        nft: { capability: nftCap, commitment: nftCommitment },
      },
    });
    if (change > 546n) {
      builder.addOutput({ to: ownerAddress, amount: change });
    }
    builder.setLocktime(0);

    const rawHex = builder.build();
    const txid = await getProvider().sendRawTransaction(rawHex);
    return { success: true, txid };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to redeem shares',
    };
  }
}

/**
 * Claim: burn shares → receive pro-rata BCH.
 * If burnAmount is omitted, burns the full FT balance.
 *
 *   Input[0]:  claims UTXO (claims.claim)
 *   Input[1]:  claimant FT UTXO — burnAmount burned
 *   Input[2+]: claimant BCH fee UTXOs
 *
 *   Output[0]: updated claims UTXO (if shares remain) OR payout (last claim)
 *   Output[1]: payout to claimant (if shares remain)
 */
export async function claimProceeds(
  privateKey: Uint8Array,
  claimantAddress: string,
  sharesCategory: string,
  burnAmount?: bigint,
): Promise<TransactionResult & { payout?: bigint; burnedAmount?: bigint }> {
  try {
    const signatureTemplate = new SignatureTemplate(privateKey);
    const claimsContract = buildClaimsContract(sharesCategory);

    // Fetch claims UTXO
    const claimsUtxos = await claimsContract.getUtxos();
    const claimsUtxo = claimsUtxos.find(
      u => u.token?.category === sharesCategory && u.token?.nft?.capability === 'mutable',
    );
    if (!claimsUtxo) {
      throw new Error('Claims UTXO not found. Buyout may not have occurred yet.');
    }

    // Read current state from mutable NFT commitment (8-byte LE int)
    const commitment = claimsUtxo.token!.nft!.commitment;
    const remainingShares = decodeBigIntLE8(commitment);
    const remainingSats = claimsUtxo.satoshis;

    // Claimant's FT UTXO
    const claimantAllUtxos = await getUtxos(claimantAddress);
    const ftUtxo = claimantAllUtxos.find(
      u => u.token?.category === sharesCategory && !u.token?.nft && u.token!.amount > 0n,
    );
    if (!ftUtxo) throw new Error('No shares found for this category in your wallet.');

    // Resolve burn amount — default to full balance
    const resolvedBurn = burnAmount ?? ftUtxo.token!.amount;
    if (resolvedBurn <= 0n) throw new Error('Burn amount must be greater than 0.');
    if (resolvedBurn > ftUtxo.token!.amount) {
      throw new Error(`Burn amount (${resolvedBurn}) exceeds your balance (${ftUtxo.token!.amount}).`);
    }
    if (resolvedBurn > remainingShares) {
      throw new Error(`Burn amount (${resolvedBurn}) exceeds remaining shares (${remainingShares}).`);
    }

    // Pro-rata payout (floor division)
    const payout = (resolvedBurn * remainingSats) / remainingShares;
    const newRemainingShares = remainingShares - resolvedBurn;
    const newRemainingSats = remainingSats - payout;

    // BCH fee inputs
    const feeUtxos = selectUtxos(claimantAllUtxos.filter(u => !u.token), 2000n);
    const claimantPkhBytes = pkhBytesFromAddress(claimantAddress);
    const fee = 2000n;

    const builder = new TransactionBuilder({ provider: getProvider() });

    // Input[0]: claims UTXO
    builder.addInput(claimsUtxo, claimsContract.unlock.claim(resolvedBurn, claimantPkhBytes));
    // Input[1]: claimant's FT UTXO (P2PKH, burned)
    builder.addInput(ftUtxo, signatureTemplate.unlockP2PKH());
    // Input[2+]: fee BCH
    builder.addInputs(feeUtxos, signatureTemplate.unlockP2PKH());

    // FT UTXO still contributes its BCH satoshis even though the token is burned
    const feeIn = feeUtxos.reduce((s, u) => s + u.satoshis, 0n) + ftUtxo.satoshis;
    const feeChange = feeIn - fee;

    if (newRemainingShares > 0n) {
      // Output[0]: updated claims UTXO
      builder.addOutput({
        to: claimsContract.tokenAddress,
        amount: newRemainingSats,
        token: {
          category: sharesCategory,
          amount: 0n,
          nft: { capability: 'mutable', commitment: encodeBigIntLE8(newRemainingShares) },
        },
      });
      // Output[1]: payout to claimant
      builder.addOutput({ to: claimantAddress, amount: payout });
    } else {
      // Last claim: all remaining BCH to claimant
      builder.addOutput({ to: claimantAddress, amount: payout });
    }

    if (feeChange > 546n) {
      builder.addOutput({ to: claimantAddress, amount: feeChange });
    }
    builder.setLocktime(0);

    const rawHex = builder.build();
    const txid = await getProvider().sendRawTransaction(rawHex);
    return { success: true, txid, payout, burnedAmount: resolvedBurn };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to claim proceeds',
    };
  }
}

/** Fetch live vault + claims status */
export async function getVaultStatus(
  sharesCategory: string,
  reserveSats: bigint,
  nftCategory: string,
): Promise<VaultStatus> {
  const claimsContract = buildClaimsContract(sharesCategory);
  const claimsScriptHash = computeClaimsScriptHash(claimsContract);
  const vaultContract = buildVaultContract(sharesCategory, TOTAL_SHARES, reserveSats, claimsScriptHash);

  const [vaultUtxos, claimsUtxos] = await Promise.all([
    vaultContract.getUtxos(),
    claimsContract.getUtxos(),
  ]);

  const vaultUtxo = vaultUtxos.find(u => u.token?.category === nftCategory && u.token?.nft);
  const claimsUtxo = claimsUtxos.find(
    u => u.token?.category === sharesCategory && u.token?.nft?.capability === 'mutable',
  );

  const active = !!vaultUtxo;
  const remainingShares = claimsUtxo
    ? decodeBigIntLE8(claimsUtxo.token!.nft!.commitment)
    : TOTAL_SHARES;
  const remainingSats = claimsUtxo?.satoshis ?? 0n;
  const boughtOut = !vaultUtxo && !!claimsUtxo && remainingSats > 1100n;

  return {
    active,
    boughtOut,
    claimsHasBch: !!claimsUtxo,
    remainingShares,
    remainingSats,
    totalShares: TOTAL_SHARES,
    reserveSats,
  };
}
