// BCH Contract interaction layer
// Handles marketplace and auction contract operations on Chipnet

import { ElectrumNetworkProvider, Contract, SignatureTemplate, Artifact, TransactionBuilder } from 'cashscript';
import { decodeCashAddress, lockingBytecodeToCashAddress, encodeTransaction, binToHex, cashAddressToLockingBytecode, decodeTransaction, hexToBin } from '@bitauth/libauth';
import { encodeNullDataScript, Op } from '@cashscript/utils';
import type { NFTListing, AuctionListing, CollectionBid, TransactionResult } from '@/lib/types';
import marketplaceArtifact from './artifacts/marketplace.json';
import auctionArtifact from './artifacts/auction.json';
import auctionStateArtifact from './artifacts/auction-state.json';
import collectionBidArtifact from './artifacts/collection-bid.json';
import p2pkhArtifact from './artifacts/p2pkh.json';
import { Utxo } from 'cashscript'; // Import Utxo type
import { hexToBytes, isHexString, utf8ToHex, cidToCommitmentHex, commitmentHexToCid } from '@/lib/utils';
import { buildListingEventHex, buildBidEventHex, buildStatusEventHex, buildCollectionBidEventHex } from '@/lib/bch/listing-events';
import { getListingIndexAddress } from '@/lib/bch/config';
import { getElectrumProvider, resetElectrumProvider } from '@/lib/bch/electrum';

const wcDebug = process.env.NEXT_PUBLIC_WC_DEBUG === 'true';
const NETWORK = (process.env.NEXT_PUBLIC_NETWORK as 'chipnet' | 'mainnet') || 'chipnet';
const ZERO_PKH_HEX = '00'.repeat(20);
const wcLog = (...args: unknown[]) => {
  if (wcDebug) {
    console.log(...args);
  }
};

function getLockingBytecode(address: string): Uint8Array {
  const decoded = cashAddressToLockingBytecode(address);
  if (typeof decoded === 'string') {
    throw new Error('Invalid address: ' + decoded);
  }
  return decoded.bytecode;
}

function getPkhHexFromAddress(address: string): string {
  const decoded = decodeCashAddress(address);
  if (typeof decoded === 'string') {
    throw new Error('Invalid address: ' + decoded);
  }
  return Buffer.from(decoded.payload).toString('hex');
}

function buildSourceOutputsJson(sourceOutputs: any[]) {
  return sourceOutputs.map((so) => ({
    outpointIndex: so.outpointIndex,
    outpointTransactionHash: binToHex(so.outpointTransactionHash),
    sequenceNumber: so.sequenceNumber,
    unlockingBytecode: binToHex(so.unlockingBytecode),
    lockingBytecode: binToHex(so.lockingBytecode),
    valueSatoshis: so.valueSatoshis.toString(),
    token: so.token
      ? {
          amount: so.token.amount.toString(),
          category: binToHex(so.token.category),
          nft: so.token.nft
            ? {
                capability: so.token.nft.capability,
                commitment: binToHex(so.token.nft.commitment),
              }
            : undefined,
        }
      : undefined,
    contract: so.contract
      ? {
          abiFunction: so.contract.abiFunction,
          redeemScript: binToHex(so.contract.redeemScript),
          artifact: so.contract.artifact,
        }
      : undefined,
  }));
}

let provider: ElectrumNetworkProvider | null = null;
const ELECTRUM_TIMEOUT_MS = Math.max(
  3000,
  parseInt(process.env.NEXT_PUBLIC_ELECTRUM_TIMEOUT_MS || '15000')
);

async function ensureElectrumConnected(electrum: ElectrumNetworkProvider) {
  try {
    if (typeof electrum.connectCluster === 'function') {
      await electrum.connectCluster().catch(() => {});
    }
  } catch {
    // ignore connection errors; requests may still succeed
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(label)), ms)),
  ]);
}

export function getProvider(): ElectrumNetworkProvider {
  if (!provider) {
    provider = getElectrumProvider(NETWORK);
  }
  return provider;
}

export function resetProvider(): void {
  provider = null;
  resetElectrumProvider();
}

// Get address balance in satoshis
export async function getBalance(address: string): Promise<bigint> {
  try {
    const utxos = await getUtxos(address);
    return utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0n);
  } catch (error) {
    console.error('Failed to get balance:', error);
    return 0n;
  }
}

// Get UTXOs for an address
export async function getUtxos(address: string): Promise<Utxo[]> {
  // In the browser, proxy through the server-side API so the browser never opens
  // its own WebSocket to Electrum (which competes with the server's persistent connection).
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch(`/api/utxos?address=${encodeURIComponent(address)}`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.utxos ?? []).map((u: Record<string, unknown>) => {
        // Build the Utxo without an explicit `token: undefined` — CashScript checks
        // property existence ('token' in utxo), so an explicit undefined causes it to
        // try to process the token and fail with "category undefined is not a hex string".
        const utxo: Utxo = {
          txid: u.txid as string,
          vout: u.vout as number,
          satoshis: BigInt(u.satoshis as string),
        };
        if (u.token) {
          const t = u.token as Record<string, unknown>;
          utxo.token = {
            amount: BigInt(t.amount as string),
            category: t.category as string,
            nft: t.nft as { capability: 'none' | 'mutable' | 'minting'; commitment: string } | undefined,
          };
        }
        return utxo;
      });
    } catch {
      return [];
    }
  }

  // Server-side: direct Electrum with one retry on disconnect
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const electrum = getProvider();
      await ensureElectrumConnected(electrum);
      return await withTimeout(
        electrum.getUtxos(address),
        ELECTRUM_TIMEOUT_MS,
        `Electrum timeout after ${ELECTRUM_TIMEOUT_MS}ms`
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const isConnErr = msg.includes('disconnected') || msg.includes('timeout') || msg.includes('Electrum timeout');
      if (isConnErr) {
        resetProvider();
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
      }
      console.error('Failed to get UTXOs:', error);
      return [];
    }
  }
  return [];
}

// Helper to select UTXOs to cover an amount + fee
export function selectUtxos(utxos: Utxo[], amount: bigint): Utxo[] {
  const selected: Utxo[] = [];
  let total = 0n;
  // Sort descending to use largest inputs first (minimize inputs)
  const sorted = [...utxos].sort((a, b) => Number(b.satoshis - a.satoshis));

  for (const utxo of sorted) {
    if (utxo.token) continue; // Skip token UTXOs for pure BCH payments
    selected.push(utxo);
    total += utxo.satoshis;
    if (total >= amount) break;
  }

  if (total < amount) {
    throw new Error(`Insufficient funds: needed ${amount}, got ${total}`);
  }

  return selected;
}

// Get token UTXOs (NFTs) for an address
export async function getTokenUtxos(address: string) {
  try {
    const utxos = await getUtxos(address);
    return utxos.filter((utxo) => utxo.token);
  } catch (error) {
    console.error('Failed to get token UTXOs:', error);
    return [];
  }
}

// Build a marketplace listing contract instance
export function buildMarketplaceContract(
  sellerPkh: string, // hex string
  price: bigint,
  creatorPkh: string, // hex string
  royaltyBasisPoints: bigint
): Contract {
  const electrum = getProvider();

  // Convert hex strings to Uint8Array for CashScript
  const sellerPkhBytes = Uint8Array.from(Buffer.from(sellerPkh, 'hex'));
  const creatorPkhBytes = Uint8Array.from(Buffer.from(creatorPkh, 'hex'));

  return new Contract(
    marketplaceArtifact as Artifact,
    [sellerPkhBytes, price, creatorPkhBytes, royaltyBasisPoints],
    { provider: electrum }
  );
}

export function buildAuctionContract(
  sellerPkh: string,
  minBid: bigint,
  endTime: bigint,
  creatorPkh: string,
  royaltyBasisPoints: bigint,
  minBidIncrement: bigint
): Contract {
  const electrum = getProvider();

  const sellerPkhBytes = Uint8Array.from(Buffer.from(sellerPkh, 'hex'));
  const creatorPkhBytes = Uint8Array.from(Buffer.from(creatorPkh, 'hex'));

  return new Contract(
    auctionArtifact as Artifact,
    [sellerPkhBytes, minBid, endTime, creatorPkhBytes, royaltyBasisPoints, minBidIncrement],
    { provider: electrum }
  );
}

export function buildCollectionBidContract(
  bidderPkh: string,
  tokenCategory: string,
  bidSalt: string,
  price: bigint,
  creatorPkh: string,
  royaltyBasisPoints: bigint
): Contract {
  const electrum = getProvider();
  const bidderPkhBytes = Uint8Array.from(Buffer.from(bidderPkh, 'hex'));
  const tokenCategoryBytes = Uint8Array.from(Buffer.from(tokenCategory, 'hex'));
  const bidSaltBytes = Uint8Array.from(Buffer.from(bidSalt, 'hex'));
  const creatorPkhBytes = Uint8Array.from(Buffer.from(creatorPkh, 'hex'));

  return new Contract(
    collectionBidArtifact as Artifact,
    [bidderPkhBytes, tokenCategoryBytes, bidSaltBytes, price, creatorPkhBytes, royaltyBasisPoints],
    { provider: electrum }
  );
}

export function buildAuctionStateContract(
  sellerPkh: string,
  auctionLockingBytecode: Uint8Array,
  trackingCategory: string
): Contract {
  const electrum = getProvider();
  const sellerPkhBytes = Uint8Array.from(Buffer.from(sellerPkh, 'hex'));
  const trackingCategoryBytes = Uint8Array.from(Buffer.from(trackingCategory, 'hex'));

  return new Contract(
    auctionStateArtifact as Artifact,
    [sellerPkhBytes, auctionLockingBytecode, trackingCategoryBytes],
    { provider: electrum }
  );
}

export function buildP2PKHContract(pkh: string): Contract {
  const electrum = getProvider();
  const pkhBytes = Uint8Array.from(Buffer.from(pkh, 'hex'));
  return new Contract(p2pkhArtifact as Artifact, [pkhBytes], { provider: electrum });
}

// Create a fixed-price listing
export async function createFixedListing(
  privateKey: Uint8Array,
  tokenCategory: string,
  tokenUtxo: { txid: string; vout: number; satoshis: bigint; commitment: string; capability?: 'none' | 'mutable' | 'minting' },
  price: bigint,
  creatorPkh: string,
  royaltyBasisPoints: bigint,
  sellerPkh: string,
  sellerAddress: string, // user's actual P2PKH address for BCH fee UTXOs
): Promise<TransactionResult> {
  try {
    const marketplace = buildMarketplaceContract(sellerPkh, price, creatorPkh, royaltyBasisPoints);
    const userContract = buildP2PKHContract(sellerPkh);
    const signatureTemplate = new SignatureTemplate(privateKey);
    const sellerPk = signatureTemplate.getPublicKey();

    const nftInput: Utxo = {
      txid: tokenUtxo.txid,
      vout: tokenUtxo.vout,
      satoshis: tokenUtxo.satoshis,
      token: {
        category: tokenCategory,
        amount: 0n,
        nft: { capability: tokenUtxo.capability || 'none', commitment: tokenUtxo.commitment }
      }
    };

    // Fetch fee UTXOs from the seller's actual P2PKH address (not userContract.address which is P2SH32).
    const fundingUtxos = await getUtxos(sellerAddress);
    const feeUtxos = selectUtxos(
      fundingUtxos.filter(u => !u.token && u.txid !== tokenUtxo.txid),
      3000n
    );

    const indexAddress = getListingIndexAddress();
    if (!indexAddress) throw new Error('Listing index address not configured.');

    const eventHex = buildListingEventHex({
      listingType: 'fixed',
      sellerPkh,
      creatorPkh,
      royaltyBasisPoints: Number(royaltyBasisPoints),
      price,
      minBid: 0n,
      endTime: 0,
      minBidIncrement: 0n,
      tokenCategory,
    });

    // Compute change manually so it goes to sellerAddress, not the P2SH32 userContract address.
    const totalIn = nftInput.satoshis + feeUtxos.reduce((s, u) => s + u.satoshis, 0n);
    const fee = 2000n;
    const fixedOuts = 1000n + 546n; // NFT output + index dust
    const change = totalIn - fixedOuts - fee;

    // fromP2PKH: correct P2PKH unlocking scripts for all inputs (not P2SH).
    // withTime(0): no locktime, avoids getBlockHeight() Electrum call.
    // withHardcodedFee + withoutChange: prevents CashScript from adding change to P2SH contract address.
    const tx = userContract.functions.spend(sellerPk, signatureTemplate)
      .fromP2PKH([nftInput, ...feeUtxos], signatureTemplate)
      .to(marketplace.address, 1000n, {
        category: tokenCategory,
        amount: 0n,
        nft: { capability: tokenUtxo.capability || 'none', commitment: tokenUtxo.commitment }
      } as any)
      .withTime(0)
      .withHardcodedFee(fee)
      .withoutChange();

    tx.to(indexAddress, 546n);
    tx.withOpReturn([`0x${eventHex}`]);

    if (change > 546n) {
      tx.to(sellerAddress, change);
    }

    const rawHex = await tx.build();
    const txid = await getProvider().sendRawTransaction(rawHex);

    return { success: true, txid };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create listing',
    };
  }
}

// Create an auction listing (move NFT into auction contract)
export async function createAuctionListing(
  privateKey: Uint8Array,
  tokenCategory: string,
  tokenUtxo: { txid: string; vout: number; satoshis: bigint; commitment: string; capability?: 'none' | 'mutable' | 'minting' },
  minBid: bigint,
  endTime: bigint,
  creatorPkh: string,
  royaltyBasisPoints: bigint,
  minBidIncrement: bigint,
  sellerPkh: string,
  sellerAddress: string, // user's actual P2PKH address for BCH fee UTXOs
): Promise<TransactionResult> {
  try {
    const auction = buildAuctionContract(sellerPkh, minBid, endTime, creatorPkh, royaltyBasisPoints, minBidIncrement);
    const userContract = buildP2PKHContract(sellerPkh);
    const signatureTemplate = new SignatureTemplate(privateKey);
    const sellerPk = signatureTemplate.getPublicKey();

    const nftInput: Utxo = {
      txid: tokenUtxo.txid,
      vout: tokenUtxo.vout,
      satoshis: tokenUtxo.satoshis,
      token: {
        category: tokenCategory,
        amount: 0n,
        nft: { capability: tokenUtxo.capability || 'none', commitment: tokenUtxo.commitment }
      }
    };

    // Fetch BCH UTXOs from the seller's actual P2PKH address (not P2SH32).
    let fundingUtxos = await getUtxos(sellerAddress);
    let nonTokenUtxos = fundingUtxos.filter(u => !u.token);

    // Auction listings require a genesis-capable UTXO (vout=0) to mint the tracking NFT.
    let genesisInput = nonTokenUtxos.find(u => u.vout === 0);
    if (!genesisInput) {
      const sorted = [...nonTokenUtxos].sort((a, b) => Number(b.satoshis - a.satoshis));
      if (sorted.length === 0 || sorted[0].satoshis < 1200n) {
        throw new Error('No genesis-capable UTXO. Please fund your wallet from the Chipnet faucet.');
      }
      const prepInput = sorted[0];
      const prepFee = 400n;
      const prepTx = userContract.functions.spend(sellerPk, signatureTemplate)
        .fromP2PKH([prepInput], signatureTemplate)
        .to(sellerAddress, prepInput.satoshis - prepFee)
        .withTime(0)
        .withHardcodedFee(prepFee)
        .withoutChange();
      const prepHex = await prepTx.build();
      const prepTxid = await getProvider().sendRawTransaction(prepHex);

      let freshUtxos: Utxo[] = [];
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 1500));
        freshUtxos = await getUtxos(sellerAddress);
        genesisInput = freshUtxos.find(u => u.txid === prepTxid && u.vout === 0 && !u.token) ?? undefined;
        if (genesisInput) break;
      }
      if (!genesisInput) {
        throw new Error('Prep transaction not confirmed in time. Please try again.');
      }
      fundingUtxos = freshUtxos;
      nonTokenUtxos = freshUtxos.filter(u => !u.token);
    }

    const feeUtxos = selectUtxos(
      nonTokenUtxos.filter(u => u.txid !== tokenUtxo.txid && u.txid !== genesisInput.txid),
      3000n
    );

    const trackingCategory = genesisInput.txid;
    const auctionLockingBytecode = getLockingBytecode(auction.tokenAddress);
    const auctionState = buildAuctionStateContract(sellerPkh, auctionLockingBytecode, trackingCategory);

    const indexAddress = getListingIndexAddress();
    if (!indexAddress) throw new Error('Listing index address not configured.');

    const eventHex = buildListingEventHex({
      listingType: 'auction',
      sellerPkh,
      creatorPkh,
      royaltyBasisPoints: Number(royaltyBasisPoints),
      price: 0n,
      minBid,
      endTime: Number(endTime),
      minBidIncrement,
      tokenCategory,
      trackingCategory,
    });

    const totalIn = nftInput.satoshis + genesisInput.satoshis + feeUtxos.reduce((s, u) => s + u.satoshis, 0n);
    const fee = 2000n;
    const fixedOuts = 1000n + 1000n + 546n;
    const change = totalIn - fixedOuts - fee;

    const tx = userContract.functions.spend(sellerPk, signatureTemplate)
      .fromP2PKH([genesisInput, nftInput, ...feeUtxos], signatureTemplate)
      .to(auction.tokenAddress, 1000n, {
        category: tokenCategory,
        amount: 0n,
        nft: { capability: tokenUtxo.capability || 'none', commitment: tokenUtxo.commitment }
      } as any)
      .to(auctionState.tokenAddress, 1000n, {
        category: trackingCategory,
        amount: 0n,
        nft: { capability: 'mutable', commitment: ZERO_PKH_HEX },
      } as any)
      .withTime(0)
      .withHardcodedFee(fee)
      .withoutChange();

    tx.to(indexAddress, 546n);
    tx.withOpReturn([`0x${eventHex}`]);

    if (change > 546n) {
      tx.to(sellerAddress, change);
    }

    const rawHex = await tx.build();
    const txid = await getProvider().sendRawTransaction(rawHex);

    return { success: true, txid };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create auction listing',
    };
  }
}

// Buy a listed NFT (atomic swap)
export async function buyNFT(
  buyerPrivateKey: Uint8Array,
  listing: NFTListing,
  buyerAddress: string // Needed for change/receipt
): Promise<TransactionResult> {
  try {
    if (listing.listingType !== 'fixed') throw new Error('Not a fixed price listing');

    const indexAddress = getListingIndexAddress();
    if (!indexAddress) {
      throw new Error('Listing index address not configured.');
    }

    const contract = buildMarketplaceContract(
      listing.sellerPkh,
      listing.price,
      listing.creatorPkh,
      BigInt(listing.royaltyBasisPoints)
    );

    // Get contract UTXOs (the NFT should be there)
    const contractUtxos = await contract.getUtxos();
    const nftUtxo = contractUtxos.find(u => u.token?.category === listing.tokenCategory);

    if (!nftUtxo) {
      throw new Error('NFT not found in contract');
    }

    // Prepare buyer inputs
    const buyerUtxos = await getUtxos(buyerAddress);
    // Amount needed: Price + Fee (approx 1000)
    // Actually, contract expects to receive Price. Fee is extra.
    // Total needed from buyer = Price + Fee.
    const needed = listing.price + 3000n;
    const fundingUtxos = selectUtxos(buyerUtxos, needed);
    const buyerTemplate = new SignatureTemplate(buyerPrivateKey);

    const buyerPkh = getPkhHexFromAddress(buyerAddress);
    const tx = contract.functions.buy(buyerPkh)
      .from(nftUtxo)
      .fromP2PKH(fundingUtxos, buyerTemplate); // Buyer pays

    // Contract Outputs:
    // 0: Seller
    // 1: Creator
    // 2: NFT to Buyer
    // Change (handled by CashScript automatically from P2PKH inputs)

    // Calculation
    const royalty = (listing.price * BigInt(listing.royaltyBasisPoints)) / 10000n;
    const sellerAmount = listing.price - royalty;

    tx.to(listing.sellerAddress, sellerAmount); // Output 0
    tx.to(listing.creatorAddress, royalty);     // Output 1

    // Output 2: NFT to Buyer
    tx.to(buyerAddress, 1000n, { category: listing.tokenCategory, amount: 0n, nft: { capability: 'none', commitment: listing.commitment } } as any);

    const eventBuyerPkh = buyerPkh;
    const eventHex = buildStatusEventHex({
      listingTxid: listing.txid,
      status: 'sold',
      actorPkh: eventBuyerPkh,
    });

    tx.to(indexAddress, 546n);
    tx.withOpReturn([`0x${eventHex}`]);

    const txDetails = await tx.send();

    return {
      success: true,
      txid: txDetails.txid,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to buy NFT',
    };
  }
}

// Cancel a listing (reclaim NFT)
export async function cancelListing(
  sellerPrivateKey: Uint8Array,
  listing: NFTListing
): Promise<TransactionResult> {
  try {
    const indexAddress = getListingIndexAddress();
    if (!indexAddress) {
      throw new Error('Listing index address not configured.');
    }

    if (listing.listingType === 'fixed') {
      const contract = buildMarketplaceContract(
        listing.sellerPkh,
        listing.price,
        listing.creatorPkh,
        BigInt(listing.royaltyBasisPoints)
      );

      const contractUtxos = await contract.getUtxos();
      const nftUtxo = contractUtxos.find(u => u.token?.category === listing.tokenCategory);
      if (!nftUtxo) throw new Error('NFT not found');

      const signatureTemplate = new SignatureTemplate(sellerPrivateKey);
      const sellerPk = signatureTemplate.getPublicKey();
      const tx = contract.functions.cancel(sellerPk, signatureTemplate);

      const sellerUtxos = await getUtxos(listing.sellerAddress);
      const feeUtxos = selectUtxos(
        sellerUtxos.filter(u => u.txid !== nftUtxo.txid),
        3000n
      );

      tx.from(nftUtxo)
        .fromP2PKH(feeUtxos, signatureTemplate)
        .to(listing.sellerAddress, 1000n, { category: listing.tokenCategory, amount: 0n, nft: { capability: 'none', commitment: listing.commitment } } as any);

      const sellerPkh = getPkhHexFromAddress(listing.sellerAddress);
      const eventHex = buildStatusEventHex({
        listingTxid: listing.txid,
        status: 'cancelled',
        actorPkh: sellerPkh,
      });

      tx.to(indexAddress, 546n);
      tx.withOpReturn([`0x${eventHex}`]);

      return {
        success: true,
        txid: (await tx.send()).txid
      };
    }

    // Auction cancellation (reclaim NFT + tracking state)
    const auction = listing as AuctionListing;
    if (!auction.trackingCategory) {
      throw new Error('Auction tracking category missing. Please re-list this NFT.');
    }

    const auctionContract = buildAuctionContract(
      listing.sellerPkh,
      auction.minBid,
      BigInt(auction.endTime),
      listing.creatorPkh,
      BigInt(listing.royaltyBasisPoints),
      auction.minBidIncrement
    );
    const auctionUtxos = await auctionContract.getUtxos();
    const auctionUtxo = auctionUtxos.find(u => u.token?.category === listing.tokenCategory);
    if (!auctionUtxo) throw new Error('NFT not found in auction');

    const auctionLockingBytecode = getLockingBytecode(auctionContract.tokenAddress);
    const stateContract = buildAuctionStateContract(auction.sellerPkh, auctionLockingBytecode, auction.trackingCategory);
    const stateUtxos = await stateContract.getUtxos();
    const stateUtxo = stateUtxos.find(u => u.token?.category === auction.trackingCategory && u.token?.nft);
    if (!stateUtxo) throw new Error('Auction state not found');

    const signatureTemplate = new SignatureTemplate(sellerPrivateKey);
    const sellerPk = signatureTemplate.getPublicKey();

    const sellerUtxos = await getUtxos(listing.sellerAddress);
    const feeUtxos = selectUtxos(
      sellerUtxos.filter(u => u.txid !== auctionUtxo.txid && u.txid !== stateUtxo.txid),
      3000n
    );

    const builder = new TransactionBuilder({ provider: getProvider() });
    builder.addInput(auctionUtxo, auctionContract.unlock.reclaim(sellerPk, signatureTemplate));
    builder.addInput(stateUtxo, stateContract.unlock.reclaim(sellerPk, signatureTemplate));
    builder.addInputs(feeUtxos, signatureTemplate.unlockP2PKH());

    // Output[0]: NFT back to seller
    builder.addOutput({
      to: listing.sellerAddress,
      amount: 1000n,
      token: {
        category: listing.tokenCategory,
        amount: 0n,
        nft: { capability: auctionUtxo.token!.nft!.capability, commitment: auctionUtxo.token!.nft!.commitment },
      },
    });
    // Output[1]: tracking NFT back to seller
    builder.addOutput({
      to: listing.sellerAddress,
      amount: 1000n,
      token: {
        category: auction.trackingCategory,
        amount: 0n,
        nft: { capability: stateUtxo.token!.nft!.capability, commitment: stateUtxo.token!.nft!.commitment },
      },
    });

    const sellerPkh = getPkhHexFromAddress(listing.sellerAddress);
    const eventHex = buildStatusEventHex({
      listingTxid: listing.txid,
      status: 'cancelled',
      actorPkh: sellerPkh,
    });

    builder.addOutput({ to: indexAddress, amount: 546n });
    builder.addOutput({ to: encodeNullDataScript([Op.OP_RETURN, hexToBytes(eventHex)]), amount: 0n });

    const totalInput = [auctionUtxo, stateUtxo, ...feeUtxos].reduce((sum, u) => sum + u.satoshis, 0n);
    const fee = 2000n;
    const change = totalInput - 1000n - 1000n - 546n - fee;
    if (change > 546n) {
      builder.addOutput({ to: listing.sellerAddress, amount: change });
    }
    builder.setLocktime(auction.endTime);

    const rawHex = builder.build();
    const txid = await getProvider().sendRawTransaction(rawHex);

    return { success: true, txid };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel listing',
    };
  }
}

// Create a collection bid (order book entry)
export async function createCollectionBid(
  privateKey: Uint8Array,
  tokenCategory: string,
  bidSalt: string,
  price: bigint,
  creatorPkh: string,
  royaltyBasisPoints: bigint,
  bidderPkh: string,
  bidderAddress: string
): Promise<TransactionResult> {
  try {
    if (!bidSalt || bidSalt.length !== 64) {
      throw new Error('Invalid bid salt');
    }
    const bidContract = buildCollectionBidContract(
      bidderPkh,
      tokenCategory,
      bidSalt,
      price,
      creatorPkh,
      royaltyBasisPoints
    );
    const userContract = buildP2PKHContract(bidderPkh);
    const signatureTemplate = new SignatureTemplate(privateKey);
    const bidderPk = signatureTemplate.getPublicKey();

    const fundingUtxos = await getUtxos(bidderAddress);
    const feeUtxos = selectUtxos(fundingUtxos.filter(u => !u.token), price + 4000n);

    const indexAddress = getListingIndexAddress();
    if (!indexAddress) throw new Error('Listing index address not configured.');

    const eventHex = buildCollectionBidEventHex({
      tokenCategory,
      bidderPkh,
      creatorPkh,
      bidSalt,
      royaltyBasisPoints: Number(royaltyBasisPoints),
      price,
    });

    const totalIn = feeUtxos.reduce((s, u) => s + u.satoshis, 0n);
    const fee = 2000n;
    const fixedOuts = price + 546n; // bid output + index dust
    const change = totalIn - fixedOuts - fee;

    const tx = userContract.functions.spend(bidderPk, signatureTemplate)
      .fromP2PKH(feeUtxos, signatureTemplate)
      .to(bidContract.address, price)
      .withTime(0)
      .withHardcodedFee(fee)
      .withoutChange();

    tx.to(indexAddress, 546n);
    tx.withOpReturn([`0x${eventHex}`]);

    if (change > 546n) {
      tx.to(bidderAddress, change);
    }

    const rawHex = await tx.build();
    const txid = await getProvider().sendRawTransaction(rawHex);

    return { success: true, txid };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create collection bid',
    };
  }
}

// Bidder cancels a collection bid and reclaims BCH
export async function cancelCollectionBid(
  bidderPrivateKey: Uint8Array,
  bid: CollectionBid,
  bidderAddress: string
): Promise<TransactionResult> {
  try {
    if (!bid.bidSalt) throw new Error('Bid salt missing');
    const contract = buildCollectionBidContract(
      bid.bidderPkh,
      bid.tokenCategory,
      bid.bidSalt,
      BigInt(bid.price),
      bid.creatorPkh,
      BigInt(bid.royaltyBasisPoints)
    );

    const contractUtxos = await contract.getUtxos();
    const bidUtxo = contractUtxos.find(u => !u.token);
    if (!bidUtxo) throw new Error('Active bid UTXO not found');

    const signatureTemplate = new SignatureTemplate(bidderPrivateKey);
    const bidderPk = signatureTemplate.getPublicKey();
    const tx = contract.functions.cancel(bidderPk, signatureTemplate);

    const fundingUtxos = await getUtxos(bidderAddress);
    const feeUtxos = selectUtxos(
      fundingUtxos.filter(u => !u.token && u.txid !== bidUtxo.txid),
      3000n
    );

    const price = BigInt(bid.price);
    const fee = 2000n;
    const totalIn = bidUtxo.satoshis + feeUtxos.reduce((s, u) => s + u.satoshis, 0n);
    const change = totalIn - price - fee;

    tx.from(bidUtxo)
      .fromP2PKH(feeUtxos, signatureTemplate)
      .to(bidderAddress, price)
      .withTime(0)
      .withHardcodedFee(fee)
      .withoutChange();

    if (change > 546n) {
      tx.to(bidderAddress, change);
    }

    return {
      success: true,
      txid: (await tx.send()).txid,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel collection bid',
    };
  }
}

// Seller accepts a collection bid by providing an NFT from the target category
export async function acceptCollectionBid(
  sellerPrivateKey: Uint8Array,
  bid: CollectionBid,
  sellerAddress: string,
  nftUtxo: { txid: string; vout: number; satoshis: bigint; commitment: string; capability?: 'none' | 'mutable' | 'minting' }
): Promise<TransactionResult> {
  try {
    if (!bid.bidSalt) throw new Error('Bid salt missing');
    const contract = buildCollectionBidContract(
      bid.bidderPkh,
      bid.tokenCategory,
      bid.bidSalt,
      BigInt(bid.price),
      bid.creatorPkh,
      BigInt(bid.royaltyBasisPoints)
    );

    const contractUtxos = await contract.getUtxos();
    const bidUtxo = contractUtxos.find(u => !u.token);
    if (!bidUtxo) throw new Error('Active bid UTXO not found');

    const signatureTemplate = new SignatureTemplate(sellerPrivateKey);
    const sellerPkh = getPkhHexFromAddress(sellerAddress);

    const nftInput: Utxo = {
      txid: nftUtxo.txid,
      vout: nftUtxo.vout,
      satoshis: nftUtxo.satoshis,
      token: {
        category: bid.tokenCategory,
        amount: 0n,
        nft: { capability: nftUtxo.capability || 'none', commitment: nftUtxo.commitment },
      },
    };

    const fundingUtxos = await getUtxos(sellerAddress);
    const feeUtxos = selectUtxos(
      fundingUtxos.filter(u => !u.token && u.txid !== bidUtxo.txid && u.txid !== nftUtxo.txid),
      3000n
    );

    const price = BigInt(bid.price);
    const royalty = (price * BigInt(bid.royaltyBasisPoints)) / 10000n;
    const sellerAmount = price - royalty;

    const tx = contract.functions.accept(sellerPkh)
      .from(bidUtxo)
      .fromP2PKH([nftInput, ...feeUtxos], signatureTemplate);

    tx.to(sellerAddress, sellerAmount); // Output 0
    tx.to(bid.creator, royalty);       // Output 1
    tx.to(bid.bidder, 1000n, {
      category: bid.tokenCategory,
      amount: 0n,
      nft: { capability: nftUtxo.capability || 'none', commitment: nftUtxo.commitment },
    } as any);

    const txDetails = await tx.send();
    return { success: true, txid: txDetails.txid };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to accept collection bid',
    };
  }
}

// Place a bid on an auction
export async function placeBid(
  bidderPrivateKey: Uint8Array,
  auction: AuctionListing,
  bidAmount: bigint,
  bidderAddress: string // Added argument
): Promise<TransactionResult> {
  try {
    const indexAddress = getListingIndexAddress();
    if (!indexAddress) {
      throw new Error('Listing index address not configured.');
    }

    if (!auction.trackingCategory) {
      throw new Error('Auction tracking category missing. Please re-list this NFT.');
    }

    const contract = buildAuctionContract(
      auction.sellerPkh,
      auction.minBid,
      BigInt(auction.endTime),
      auction.creatorPkh,
      BigInt(auction.royaltyBasisPoints),
      auction.minBidIncrement
    );

    const contractUtxos = await contract.getUtxos();
    const auctionUtxo = contractUtxos.find(u => u.token?.category === auction.tokenCategory);
    if (!auctionUtxo) throw new Error('NFT not found in auction');

    const auctionLockingBytecode = getLockingBytecode(contract.tokenAddress);
    const stateContract = buildAuctionStateContract(auction.sellerPkh, auctionLockingBytecode, auction.trackingCategory);
    const stateUtxos = await stateContract.getUtxos();
    const stateUtxo = stateUtxos.find(u => u.token?.category === auction.trackingCategory && u.token?.nft);
    if (!stateUtxo) throw new Error('Auction state not found');

    const currentBidAmount = auctionUtxo.satoshis;
    const prevCommitment = stateUtxo.token?.nft?.commitment || ZERO_PKH_HEX;
    const prevBidderPkhHex = prevCommitment.length === 40 ? prevCommitment : ZERO_PKH_HEX;
    const hasPrevBidder = !/^0+$/.test(prevBidderPkhHex);

    const bidderUtxos = await getUtxos(bidderAddress);
    // Needed: bidAmount + Fee (2000n for safety)
    const fundingUtxos = selectUtxos(bidderUtxos, bidAmount + 3000n);
    const bidderTemplate = new SignatureTemplate(bidderPrivateKey);

    const builder = new TransactionBuilder({ provider: getProvider() });
    builder.addInput(auctionUtxo, contract.unlock.bid(currentBidAmount));
    builder.addInput(stateUtxo, stateContract.unlock.bid(currentBidAmount, prevBidderPkhHex, getPkhHexFromAddress(bidderAddress)));
    builder.addInputs(fundingUtxos, bidderTemplate.unlockP2PKH());

    builder.addOutput({
      to: contract.tokenAddress,
      amount: bidAmount,
      token: {
        category: auction.tokenCategory,
        amount: 0n,
        nft: { capability: auctionUtxo.token!.nft!.capability, commitment: auctionUtxo.token!.nft!.commitment },
      },
    });
    builder.addOutput({
      to: stateContract.tokenAddress,
      amount: 1000n,
      token: {
        category: auction.trackingCategory,
        amount: 0n,
        nft: { capability: stateUtxo.token!.nft!.capability, commitment: getPkhHexFromAddress(bidderAddress) },
      },
    });

    if (hasPrevBidder) {
      const prevBidderLockingBytecode = new Uint8Array([
        0x76, 0xa9, 0x14, ...hexToBytes(prevBidderPkhHex), 0x88, 0xac,
      ]);
      builder.addOutput({ to: prevBidderLockingBytecode, amount: currentBidAmount });
    }

    const bidderPkh = getPkhHexFromAddress(bidderAddress);
    const eventHex = buildBidEventHex({
      listingTxid: auction.txid,
      bidderPkh,
      bidAmount,
    });
    builder.addOutput({ to: indexAddress, amount: 546n });
    builder.addOutput({ to: encodeNullDataScript([Op.OP_RETURN, hexToBytes(eventHex)]), amount: 0n });

    const totalInput = [auctionUtxo, stateUtxo, ...fundingUtxos].reduce((sum, u) => sum + u.satoshis, 0n);
    const fee = 2000n;
    const refund = hasPrevBidder ? currentBidAmount : 0n;
    const change = totalInput - bidAmount - 1000n - refund - 546n - fee;
    if (change < 0n) {
      throw new Error('Insufficient funds for bid fees.');
    }
    if (change > 546n) {
      builder.addOutput({ to: bidderAddress, amount: change });
    }

    builder.setLocktime(0);
    const rawHex = builder.build();
    const txid = await getProvider().sendRawTransaction(rawHex);

    return { success: true, txid };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to place bid',
    };
  }
}

// Claim won auction
export async function claimAuction(
  winnerPrivateKey: Uint8Array,
  auction: AuctionListing,
  winnerAddress: string // Added argument
): Promise<TransactionResult> {
  try {
    const indexAddress = getListingIndexAddress();
    if (!indexAddress) {
      throw new Error('Listing index address not configured.');
    }

    if (!auction.trackingCategory) {
      throw new Error('Auction tracking category missing. Please re-list this NFT.');
    }

    const contract = buildAuctionContract(
      auction.sellerPkh,
      auction.minBid,
      BigInt(auction.endTime),
      auction.creatorPkh,
      BigInt(auction.royaltyBasisPoints),
      auction.minBidIncrement
    );

    const contractUtxos = await contract.getUtxos();
    const auctionUtxo = contractUtxos.find(u => u.token?.category === auction.tokenCategory);
    if (!auctionUtxo) throw new Error('NFT not found');

    const auctionLockingBytecode = getLockingBytecode(contract.tokenAddress);
    const stateContract = buildAuctionStateContract(auction.sellerPkh, auctionLockingBytecode, auction.trackingCategory);
    const stateUtxos = await stateContract.getUtxos();
    const stateUtxo = stateUtxos.find(u => u.token?.category === auction.trackingCategory && u.token?.nft);
    if (!stateUtxo) throw new Error('Auction state not found');

    const finalBid = auctionUtxo.satoshis;

    const winnerUtxos = await getUtxos(winnerAddress);
    const feeUtxos = selectUtxos(winnerUtxos, 3000n);
    const winnerTemplate = new SignatureTemplate(winnerPrivateKey);

    const winnerPkh = getPkhHexFromAddress(winnerAddress);

    const royalty = (finalBid * BigInt(auction.royaltyBasisPoints)) / 10000n;
    const sellerAmount = finalBid - royalty;

    const builder = new TransactionBuilder({ provider: getProvider() });
    builder.addInput(auctionUtxo, contract.unlock.claim(finalBid, winnerPkh));
    builder.addInput(stateUtxo, stateContract.unlock.claim(winnerPkh));
    builder.addInputs(feeUtxos, winnerTemplate.unlockP2PKH());

    builder.addOutput({ to: auction.sellerAddress, amount: sellerAmount });
    builder.addOutput({ to: auction.creatorAddress, amount: royalty });
    builder.addOutput({
      to: winnerAddress,
      amount: 1000n,
      token: {
        category: auction.tokenCategory,
        amount: 0n,
        nft: { capability: auctionUtxo.token!.nft!.capability, commitment: auctionUtxo.token!.nft!.commitment },
      },
    });
    builder.addOutput({
      to: auction.sellerAddress,
      amount: 1000n,
      token: {
        category: auction.trackingCategory,
        amount: 0n,
        nft: { capability: stateUtxo.token!.nft!.capability, commitment: stateUtxo.token!.nft!.commitment },
      },
    });
    const eventHex = buildStatusEventHex({
      listingTxid: auction.txid,
      status: 'claimed',
      actorPkh: winnerPkh,
    });

    builder.addOutput({ to: indexAddress, amount: 546n });
    builder.addOutput({ to: encodeNullDataScript([Op.OP_RETURN, hexToBytes(eventHex)]), amount: 0n });

    const totalInput = [auctionUtxo, stateUtxo, ...feeUtxos].reduce((sum, u) => sum + u.satoshis, 0n);
    const fee = 2000n;
    const change = totalInput - sellerAmount - royalty - 1000n - 1000n - 546n - fee;
    if (change < 0n) {
      throw new Error('Insufficient funds for claim fees.');
    }
    if (change > 546n) {
      builder.addOutput({ to: winnerAddress, amount: change });
    }
    builder.setLocktime(auction.endTime);

    const rawHex = builder.build();
    const txid = await getProvider().sendRawTransaction(rawHex);

    return { success: true, txid };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to claim auction',
    };
  }
}

// Build WalletConnect mint transaction params (used by create page)
// Uses CashScript build() + decodeTransaction for correct byte order and CashTokens encoding.
// Returns hex-encoded transaction + sourceOutputs for signTransaction, or an error.
export async function buildWcMintParams(
  address: string,
  commitment: string,
  metadata: { name: string; description: string; image: string },
  capability: 'none' | 'mutable' | 'minting' = 'none'
): Promise<{
  transactionHex: string;
  transaction: any;
  sourceOutputs: object[];
  sourceOutputsJson: object[];
  category: string;
  userPrompt: string;
  } | { error: string }> {
  try {
    wcLog('[WC Mint] Fetching UTXOs for', address);
    const utxos = await getUtxos(address);
    wcLog('[WC Mint] Got', utxos.length, 'UTXOs');
    if (utxos.length > 0) {
      wcLog('[WC Mint] First UTXO keys:', Object.keys(utxos[0]));
      wcLog('[WC Mint] First UTXO:', JSON.stringify(utxos[0], (_, v) => typeof v === 'bigint' ? v.toString() + 'n' : v));
    }

    if (utxos.length === 0) {
      return {
        error: 'No UTXOs available or Electrum is unavailable. Please fund your wallet or check your Electrum server.',
      };
    }

    // CashTokens genesis: must find a UTXO with vout=0 (BCH protocol requirement).
    const nonTokenUtxos = utxos.filter(u => !u.token);
    const genesisInput = nonTokenUtxos.find(u => u.vout === 0);
    if (!genesisInput) {
      return {
        error: 'NO_GENESIS_UTXO',
      };
    }
    const category = genesisInput.txid;
    wcLog('[WC Mint] category (genesisInput.txid):', category);

    // Build funding list: genesis input first, then other BCH UTXOs to cover fees.
    const otherUtxos = nonTokenUtxos
      .filter(u => !(u.txid === genesisInput.txid && u.vout === genesisInput.vout))
      .sort((a, b) => Number(b.satoshis - a.satoshis));
    const fundingUtxos: Utxo[] = [genesisInput];
    let totalSats = genesisInput.satoshis;
    for (const u of otherUtxos) {
      if (totalSats >= 4000n) break;
      fundingUtxos.push(u);
      totalSats += u.satoshis;
    }
    if (totalSats < 2000n) {
      return { error: `Insufficient funds: ${totalSats} sats. Fund your wallet from the Chipnet faucet.` };
    }

    const commitmentHex = cidToCommitmentHex(commitment);

    // Locking bytecode for the user's address (used in sourceOutputs)
    const userLockingBytecode = getLockingBytecode(address);

    // Get user's PKH from their address for P2PKH contract
    const decoded = decodeCashAddress(address);
    if (typeof decoded === 'string') {
      return { error: 'Invalid address: ' + decoded };
    }
    const userPkhHex = Buffer.from(decoded.payload).toString('hex');

    // Derive the token-capable (z-prefix) address for the NFT output.
    // CashTokens requires NFT outputs to go to p2pkhWithTokens addresses.
    // lockingBytecodeToCashAddress with tokenSupport=true returns the z-prefix address.
    const tokenAddrResult = lockingBytecodeToCashAddress({
      bytecode: userLockingBytecode,
      prefix: decoded.prefix,
      tokenSupport: true,
    });
    if (typeof tokenAddrResult === 'string') {
      return { error: 'Failed to derive token address: ' + tokenAddrResult };
    }
    const tokenAddress = tokenAddrResult.address;

    // Use a dummy private key to build the CashScript transaction structure.
    // The wallet will sign via WalletConnect — we clear unlockingBytecodes below.
    const dummyKey = new Uint8Array(32);
    dummyKey[31] = 1; // Private key = 1, a valid secp256k1 key
    const dummyTemplate = new SignatureTemplate(dummyKey);
    const dummyPk = dummyTemplate.getPublicKey();
    const userContract = buildP2PKHContract(userPkhHex);

    // Build the CashTokens genesis transaction via CashScript.
    // fromP2PKH: generates standard P2PKH unlock scripts (cleared below for WC signing).
    // Token data passed directly (no extra token: wrapper) — that is the correct CashScript API.
    const fee = BigInt(Math.max(500, fundingUtxos.length * 148 + 200));
    const change = totalSats - 1000n - fee;
    const wcTx = userContract.functions.spend(dummyPk, dummyTemplate)
      .fromP2PKH(fundingUtxos, dummyTemplate)
      .to(tokenAddress, 1000n, {
        category,
        amount: 0n,
        nft: { capability, commitment: commitmentHex },
      } as any)
      .withTime(0)
      .withHardcodedFee(fee)
      .withoutChange();
    if (change > 546n) {
      wcTx.to(address, change);
    }
    const rawHex = await wcTx.build();

    // Decode to get the canonical Transaction object (correct byte order guaranteed)
    const decodedTx = decodeTransaction(hexToBin(rawHex));
    if (typeof decodedTx === 'string') {
      return { error: 'Failed to decode built transaction: ' + decodedTx };
    }

    // Clear all inputs' unlockingBytecode — the wallet (WalletConnect) signs all P2PKH inputs
    decodedTx.inputs.forEach(inp => { inp.unlockingBytecode = new Uint8Array(); });

    // Re-encode the cleared transaction for the hex field
    const transactionHex = binToHex(encodeTransaction(decodedTx));

    // Construct sourceOutputs: decoded input fields + UTXO's locking script and value
    const sourceOutputs = fundingUtxos.map((utxo, i) => ({
      ...decodedTx.inputs[i],
      lockingBytecode: userLockingBytecode,
      valueSatoshis: utxo.satoshis,
    }));

    wcLog('[WC Mint] Built tx via CashScript build():', fundingUtxos.length, 'inputs,', decodedTx.outputs.length, 'outputs');
    wcLog('[WC Mint] Category:', category, '| Commitment:', commitmentHex);
    wcLog('[WC Mint] Tx hex length:', transactionHex.length);

    const sourceOutputsJson = buildSourceOutputsJson(sourceOutputs);

    return {
      transactionHex,
      transaction: decodedTx,
      sourceOutputs,
      sourceOutputsJson,
      category,
      userPrompt: capability === 'minting' ? `Create Collection: ${metadata.name}` : `Mint NFT: ${metadata.name}`,
    };
  } catch (error) {
    console.error('[WC Mint] buildWcMintParams error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to build transaction' };
  }
}

// Build a prep transaction that creates a genesis-capable UTXO (vout=0).
// Needed when the wallet has no UTXO at output-index 0, which is required by
// the BCH CashTokens protocol for genesis minting.
export async function buildWcPrepTransaction(address: string): Promise<{
  transactionHex: string;
  transaction: any;
  sourceOutputs: object[];
  sourceOutputsJson: object[];
  userPrompt: string;
} | { error: string }> {
  try {
    const utxos = await getUtxos(address);
    const nonTokenUtxos = utxos.filter(u => !u.token);
    if (nonTokenUtxos.length === 0) {
      return { error: 'No BCH UTXOs available. Please fund your wallet from the Chipnet faucet.' };
    }

    const sorted = [...nonTokenUtxos].sort((a, b) => Number(b.satoshis - a.satoshis));
    const input = sorted[0];
    if (input.satoshis < 1200n) {
      return { error: 'Insufficient funds to prepare wallet for minting.' };
    }

    const decoded = decodeCashAddress(address);
    if (typeof decoded === 'string') return { error: 'Invalid address: ' + decoded };
    const userPkhHex = Buffer.from(decoded.payload).toString('hex');
    const userLockingBytecode = getLockingBytecode(address);
    const userContract = buildP2PKHContract(userPkhHex);

    const dummyKey = new Uint8Array(32);
    dummyKey[31] = 1;
    const dummyTemplate = new SignatureTemplate(dummyKey);
    const dummyPk = dummyTemplate.getPublicKey();

    const fee = 400n;
    const outputAmount = input.satoshis - fee;

    // Single output at vout=0 — this UTXO becomes genesis-capable for the next mint tx.
    const tx = userContract.functions.spend(dummyPk, dummyTemplate)
      .fromP2PKH([input], dummyTemplate)
      .to(address, outputAmount)
      .withTime(0)
      .withHardcodedFee(fee)
      .withoutChange();

    const rawHex = await tx.build();
    const decodedTx = decodeTransaction(hexToBin(rawHex));
    if (typeof decodedTx === 'string') return { error: 'Failed to decode prep transaction: ' + decodedTx };
    decodedTx.inputs.forEach(inp => { inp.unlockingBytecode = new Uint8Array(); });
    const transactionHex = binToHex(encodeTransaction(decodedTx));

    const sourceOutputs = [{
      ...decodedTx.inputs[0],
      lockingBytecode: userLockingBytecode,
      valueSatoshis: input.satoshis,
    }];
    const sourceOutputsJson = buildSourceOutputsJson(sourceOutputs);

    return {
      transactionHex,
      transaction: decodedTx,
      sourceOutputs,
      sourceOutputsJson,
      userPrompt: 'Prepare wallet for NFT minting (one-time setup)',
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to build prep transaction' };
  }
}

export interface MintingTokenUtxo {
  txid: string;
  vout: number;
  satoshis: bigint;
  category: string;
  commitment: string; // hex-encoded commitment stored on-chain
}

// Mint a new child NFT from an existing minting-capability token (server-side).
// The minting token is returned to tokenAddress and a new child NFT is also minted there.
export async function mintFromCollection(
  privateKey: Uint8Array,
  pkh: string,
  address: string,
  tokenAddress: string,
  mintingToken: MintingTokenUtxo,
  newCommitment: string,          // IPFS CID for the new child NFT
  newCapability: 'none' | 'mutable' = 'none',
): Promise<TransactionResult> {
  try {
    const userContract = buildP2PKHContract(pkh);
    const signatureTemplate = new SignatureTemplate(privateKey);
    const pk = signatureTemplate.getPublicKey();
    const outputAddress = tokenAddress || address;

    // Gather BCH UTXOs for fees (exclude the minting token UTXO itself)
    const allUtxos = await getUtxos(address);
    const feeUtxos = allUtxos
      .filter(u => !u.token && !(u.txid === mintingToken.txid && u.vout === mintingToken.vout))
      .sort((a, b) => Number(b.satoshis - a.satoshis));

    const mintingTokenInput: Utxo = {
      txid: mintingToken.txid,
      vout: mintingToken.vout,
      satoshis: mintingToken.satoshis,
      token: {
        amount: 0n,
        category: mintingToken.category,
        nft: { capability: 'minting', commitment: mintingToken.commitment },
      },
    };

    // Pick enough fee UTXOs
    const selectedFeeUtxos: Utxo[] = [];
    let feeSats = 0n;
    for (const u of feeUtxos) {
      if (feeSats >= 4000n) break;
      selectedFeeUtxos.push(u);
      feeSats += u.satoshis;
    }
    if (feeSats < 1000n && mintingToken.satoshis < 3000n) {
      return { success: false, error: 'Insufficient BCH to cover minting fee.' };
    }

    const newCommitmentHex = cidToCommitmentHex(newCommitment);
    const nftOutputSats = 1000n;
    const totalIn = mintingToken.satoshis + feeSats;
    const fee = BigInt(Math.max(600, (selectedFeeUtxos.length + 1) * 148 + 300));
    const change = totalIn - nftOutputSats * 2n - fee;

    const allInputs: Utxo[] = [mintingTokenInput, ...selectedFeeUtxos];
    const tx = userContract.functions.spend(pk, signatureTemplate)
      .fromP2PKH(allInputs, signatureTemplate)
      // Return minting token to owner (same category, capability='minting', same commitment)
      .to(outputAddress, nftOutputSats, {
        category: mintingToken.category,
        amount: 0n,
        nft: { capability: 'minting', commitment: mintingToken.commitment },
      } as any)
      // New child NFT (same category, new commitment)
      .to(outputAddress, nftOutputSats, {
        category: mintingToken.category,
        amount: 0n,
        nft: { capability: newCapability, commitment: newCommitmentHex },
      } as any)
      .withTime(0)
      .withHardcodedFee(fee)
      .withoutChange();

    if (change > 546n) {
      tx.to(address, change);
    }

    const rawHex = await tx.build();
    const txid = await getProvider().sendRawTransaction(rawHex);
    return { success: true, txid, tokenCategory: mintingToken.category };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to mint from collection' };
  }
}

// Build WalletConnect params for minting a child NFT from an existing minting token.
export async function buildWcMintFromCollectionParams(
  address: string,
  mintingToken: MintingTokenUtxo,
  newCommitment: string,
  metadata: { name: string; collectionName: string },
  newCapability: 'none' | 'mutable' = 'none',
): Promise<{
  transactionHex: string;
  transaction: any;
  sourceOutputs: object[];
  sourceOutputsJson: object[];
  category: string;
  userPrompt: string;
} | { error: string }> {
  try {
    const decoded = decodeCashAddress(address);
    if (typeof decoded === 'string') return { error: 'Invalid address: ' + decoded };
    const userPkhHex = Buffer.from(decoded.payload).toString('hex');

    const tokenAddrResult = lockingBytecodeToCashAddress({
      bytecode: getLockingBytecode(address),
      prefix: decoded.prefix,
      tokenSupport: true,
    });
    if (typeof tokenAddrResult === 'string') return { error: 'Failed to derive token address: ' + tokenAddrResult };
    const tokenAddress = tokenAddrResult.address;

    const userLockingBytecode = getLockingBytecode(address);
    const userContract = buildP2PKHContract(userPkhHex);

    const dummyKey = new Uint8Array(32);
    dummyKey[31] = 1;
    const dummyTemplate = new SignatureTemplate(dummyKey);
    const dummyPk = dummyTemplate.getPublicKey();

    // Gather fee UTXOs from the user's BCH address
    const allUtxos = await getUtxos(address);
    const feeUtxos = allUtxos
      .filter(u => !u.token)
      .sort((a, b) => Number(b.satoshis - a.satoshis));

    const mintingTokenInput: Utxo = {
      txid: mintingToken.txid,
      vout: mintingToken.vout,
      satoshis: mintingToken.satoshis,
      token: {
        amount: 0n,
        category: mintingToken.category,
        nft: { capability: 'minting', commitment: mintingToken.commitment },
      },
    };

    const selectedFeeUtxos: Utxo[] = [];
    let feeSats = 0n;
    for (const u of feeUtxos) {
      if (feeSats >= 4000n) break;
      selectedFeeUtxos.push(u);
      feeSats += u.satoshis;
    }
    if (feeSats < 1000n && mintingToken.satoshis < 3000n) {
      return { error: 'Insufficient BCH to cover minting fee.' };
    }

    const newCommitmentHex = cidToCommitmentHex(newCommitment);
    const nftOutputSats = 1000n;
    const totalIn = mintingToken.satoshis + feeSats;
    const fee = BigInt(Math.max(600, (selectedFeeUtxos.length + 1) * 148 + 300));
    const change = totalIn - nftOutputSats * 2n - fee;

    const allInputs: Utxo[] = [mintingTokenInput, ...selectedFeeUtxos];
    const wcTx = userContract.functions.spend(dummyPk, dummyTemplate)
      .fromP2PKH(allInputs, dummyTemplate)
      .to(tokenAddress, nftOutputSats, {
        category: mintingToken.category,
        amount: 0n,
        nft: { capability: 'minting', commitment: mintingToken.commitment },
      } as any)
      .to(tokenAddress, nftOutputSats, {
        category: mintingToken.category,
        amount: 0n,
        nft: { capability: newCapability, commitment: newCommitmentHex },
      } as any)
      .withTime(0)
      .withHardcodedFee(fee)
      .withoutChange();
    if (change > 546n) {
      wcTx.to(address, change);
    }

    const rawHex = await wcTx.build();
    const decodedTx = decodeTransaction(hexToBin(rawHex));
    if (typeof decodedTx === 'string') return { error: 'Failed to decode transaction: ' + decodedTx };
    decodedTx.inputs.forEach(inp => { inp.unlockingBytecode = new Uint8Array(); });
    const transactionHex = binToHex(encodeTransaction(decodedTx));

    // sourceOutputs: minting token input uses token-capable locking bytecode
    const mintingTokenLockingBytecode = getLockingBytecode(tokenAddress);
    const sourceOutputs = allInputs.map((utxo, i) => ({
      ...decodedTx.inputs[i],
      lockingBytecode: utxo.token ? mintingTokenLockingBytecode : userLockingBytecode,
      valueSatoshis: utxo.satoshis,
      // Convert hex string fields to Uint8Array so buildSourceOutputsJson's binToHex calls succeed
      token: utxo.token ? {
        amount: utxo.token.amount,
        category: new Uint8Array(Buffer.from(utxo.token.category as string, 'hex')),
        nft: utxo.token.nft ? {
          capability: (utxo.token.nft as any).capability,
          commitment: hexToBytes((utxo.token.nft as any).commitment || ''),
        } : undefined,
      } : undefined,
    }));
    const sourceOutputsJson = buildSourceOutputsJson(sourceOutputs);

    return {
      transactionHex,
      transaction: decodedTx,
      sourceOutputs,
      sourceOutputsJson,
      category: mintingToken.category,
      userPrompt: `Add to "${metadata.collectionName}": ${metadata.name}`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to build mint-from-collection transaction' };
  }
}

// Build WalletConnect listing params (fixed or auction)
export async function buildWcListingParams(params: {
  address: string;
  tokenCategory: string;
  listingType: 'fixed' | 'auction';
  price?: bigint;
  minBid?: bigint;
  endTime?: bigint;
  royaltyBasisPoints: bigint;
  sellerPkh: string;
  creatorPkh: string;
  minBidIncrement?: bigint;
}): Promise<{
  transactionHex: string;
  transaction: any;
  sourceOutputs: object[];
  sourceOutputsJson: object[];
  contractAddress: string;
  commitment: string;
  userPrompt: string;
} | { error: string; needsPrep?: boolean }> {
  try {
    const utxos = await getUtxos(params.address);
    if (utxos.length === 0) {
      return { error: 'No UTXOs available. Please fund your wallet from the Chipnet faucet.' };
    }

    const nftUtxo = utxos.find(
      (u) => u.token?.category === params.tokenCategory && u.token?.nft
    );
    if (!nftUtxo || !nftUtxo.token?.nft) {
      return { error: 'NFT not found in wallet' };
    }

    const indexAddress = getListingIndexAddress();
    if (!indexAddress) {
      return { error: 'Listing index address not configured.' };
    }

    const nonTokenUtxos = utxos.filter((u) => !u.token);
    let genesisInput: Utxo | undefined;
    let trackingCategory: string | undefined;

    if (params.listingType === 'auction') {
      genesisInput = nonTokenUtxos.find((u) => u.vout === 0);
      if (!genesisInput) {
        return {
          error: 'Auction listing requires a genesis-capable UTXO (vout=0). Approve the prep transaction first, then try again.',
          needsPrep: true,
        };
      }
      trackingCategory = genesisInput.txid;
    }

    const feeUtxos = selectUtxos(
      nonTokenUtxos.filter((u) => !u.token && u.txid !== nftUtxo.txid && u.txid !== genesisInput?.txid),
      3000n
    );

    const decoded = decodeCashAddress(params.address);
    if (typeof decoded === 'string') {
      return { error: 'Invalid address: ' + decoded };
    }
    const addrPkh = decoded.payload;
    const lockingBytecode = new Uint8Array([0x76, 0xa9, 0x14, ...addrPkh, 0x88, 0xac]);

    const contract =
      params.listingType === 'fixed'
        ? buildMarketplaceContract(params.sellerPkh, params.price || 0n, params.creatorPkh, params.royaltyBasisPoints)
        : buildAuctionContract(
            params.sellerPkh,
            params.minBid || 0n,
            params.endTime || 0n,
            params.creatorPkh,
            params.royaltyBasisPoints,
            params.minBidIncrement || 1000n
          );

    const auctionLockingBytecode =
      params.listingType === 'auction' ? getLockingBytecode(contract.tokenAddress) : undefined;
    const auctionState =
      params.listingType === 'auction' && trackingCategory && auctionLockingBytecode
        ? buildAuctionStateContract(params.sellerPkh, auctionLockingBytecode, trackingCategory)
        : undefined;

    const commitment = nftUtxo.token.nft.commitment || '';
    const categoryBytes = new Uint8Array(Buffer.from(params.tokenCategory, 'hex'));
    const commitmentBytes = hexToBytes(commitment);

    const inputs = params.listingType === 'auction' && genesisInput
      ? [genesisInput, nftUtxo, ...feeUtxos]
      : [nftUtxo, ...feeUtxos];

    const sourceOutputs = inputs.map((utxo) => {
      const token = utxo.token
        ? {
            amount: utxo.token.amount,
            category: new Uint8Array(Buffer.from(utxo.token.category, 'hex')),
            nft: utxo.token.nft
              ? {
                  capability: utxo.token.nft.capability,
                  commitment: hexToBytes(utxo.token.nft.commitment || ''),
                }
              : undefined,
          }
        : undefined;

      return {
        outpointIndex: utxo.vout,
        outpointTransactionHash: new Uint8Array(Buffer.from(utxo.txid, 'hex')),
        sequenceNumber: 0xffffffff,
        unlockingBytecode: new Uint8Array(),
        lockingBytecode: lockingBytecode,
        valueSatoshis: utxo.satoshis,
        token,
      };
    });

    const totalInput = inputs.reduce((sum, u) => sum + u.satoshis, 0n);
    const fee = 2000n;
    const nftDust = 1000n;
    const indexDust = 546n;
    const stateDust = params.listingType === 'auction' ? 1000n : 0n;
    const change = totalInput - nftDust - stateDust - indexDust - fee;
    if (change < 0n) {
      return { error: 'Insufficient funds for listing fees.' };
    }

    const contractDecoded = cashAddressToLockingBytecode(contract.address);
    if (typeof contractDecoded === 'string') {
      return { error: 'Invalid contract address: ' + contractDecoded };
    }
    const contractLockingBytecode = contractDecoded.bytecode;

    const indexDecoded = cashAddressToLockingBytecode(indexAddress);
    if (typeof indexDecoded === 'string') {
      return { error: 'Invalid index address: ' + indexDecoded };
    }
    const indexLockingBytecode = indexDecoded.bytecode;

    const eventHex = buildListingEventHex({
      listingType: params.listingType,
      sellerPkh: params.sellerPkh,
      creatorPkh: params.creatorPkh,
      royaltyBasisPoints: Number(params.royaltyBasisPoints),
      price: params.listingType === 'fixed' ? params.price || 0n : 0n,
      minBid: params.listingType === 'auction' ? params.minBid || 0n : 0n,
      endTime: params.listingType === 'auction' ? Number(params.endTime || 0n) : 0,
      minBidIncrement:
        params.listingType === 'auction' ? params.minBidIncrement || 0n : 0n,
      tokenCategory: params.tokenCategory,
      trackingCategory: trackingCategory || params.tokenCategory,
    });
    const opReturnLockingBytecode = encodeNullDataScript([
      Op.OP_RETURN,
      hexToBytes(eventHex),
    ]);

    const txOutputs: Array<{
      lockingBytecode: Uint8Array;
      valueSatoshis: bigint;
      token?: {
        category: Uint8Array;
        amount: bigint;
        nft?: { capability: 'none' | 'mutable' | 'minting'; commitment: Uint8Array };
      };
    }> = [
      {
        lockingBytecode: contractLockingBytecode,
        valueSatoshis: nftDust,
        token: {
          category: categoryBytes,
          amount: 0n,
          nft: {
            capability: nftUtxo.token.nft.capability as 'none' | 'mutable' | 'minting',
            commitment: commitmentBytes,
          },
        },
      },
      ...(auctionState && trackingCategory
        ? [{
            lockingBytecode: getLockingBytecode(auctionState.tokenAddress),
            valueSatoshis: 1000n,
            token: {
              category: new Uint8Array(Buffer.from(trackingCategory, 'hex')),
              amount: 0n,
              nft: {
                capability: 'mutable' as const,
                commitment: hexToBytes(ZERO_PKH_HEX),
              },
            },
          }] : []),
      {
        lockingBytecode: indexLockingBytecode,
        valueSatoshis: indexDust,
      },
      {
        lockingBytecode: opReturnLockingBytecode,
        valueSatoshis: 0n,
      },
    ];

    if (change > 546n) {
      txOutputs.push({
        lockingBytecode: lockingBytecode,
        valueSatoshis: change,
      });
    }

    const transaction = {
      version: 2,
      inputs: sourceOutputs.map((so) => ({
        outpointIndex: so.outpointIndex,
        outpointTransactionHash: so.outpointTransactionHash,
        sequenceNumber: so.sequenceNumber,
        unlockingBytecode: so.unlockingBytecode,
      })),
      outputs: txOutputs,
      locktime: 0,
    };

    const txBytes = encodeTransaction(transaction);
    const transactionHex = binToHex(txBytes);

    const sourceOutputsJson = buildSourceOutputsJson(sourceOutputs);

    return {
      transactionHex,
      transaction,
      sourceOutputs: sourceOutputs,
      sourceOutputsJson,
      contractAddress: contract.address,
      commitment,
      userPrompt: params.listingType === 'fixed' ? 'Create fixed-price listing' : 'Create auction listing',
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to build listing transaction' };
  }
}

// Build WalletConnect buy params for fixed-price listing
export async function buildWcBuyParams(params: {
  listing: NFTListing;
  buyerAddress: string;
}): Promise<{
  transactionHex: string;
  transaction: any;
  sourceOutputs: object[];
  sourceOutputsJson: object[];
  userPrompt: string;
} | { error: string }> {
  try {
    const { listing, buyerAddress } = params;

    if (listing.listingType !== 'fixed') {
      return { error: 'Listing is not fixed price' };
    }

    let sellerPkh = listing.sellerPkh || '';
    if (!sellerPkh) {
      const decodedSeller = decodeCashAddress(listing.sellerAddress);
      if (typeof decodedSeller === 'string') {
        return { error: 'Invalid seller address' };
      }
      sellerPkh = Buffer.from(decodedSeller.payload).toString('hex');
    }

    let creatorPkh = listing.creatorPkh || '';
    if (!creatorPkh) {
      const decodedCreator = decodeCashAddress(listing.creatorAddress);
      if (typeof decodedCreator === 'string') {
        return { error: 'Invalid creator address' };
      }
      creatorPkh = Buffer.from(decodedCreator.payload).toString('hex');
    }

    const contract = buildMarketplaceContract(
      sellerPkh,
      listing.price,
      creatorPkh,
      BigInt(listing.royaltyBasisPoints)
    );

    const contractUtxos = await contract.getUtxos();
    const contractUtxo = contractUtxos.find((u) => u.token?.category === listing.tokenCategory);
    if (!contractUtxo || !contractUtxo.token?.nft) {
      return { error: 'NFT not found in contract' };
    }

    const indexAddress = getListingIndexAddress();
    if (!indexAddress) {
      return { error: 'Listing index address not configured.' };
    }

    const buyerUtxos = await getUtxos(buyerAddress);
    const fundingUtxos = selectUtxos(buyerUtxos, listing.price + 3000n);

    const buyerLockingBytecode = getLockingBytecode(buyerAddress);
    const sellerLockingBytecode = getLockingBytecode(listing.sellerAddress);
    const creatorLockingBytecode = getLockingBytecode(listing.creatorAddress);
    const contractLockingBytecode = getLockingBytecode(contract.address);

    const tokenCategoryBytes = new Uint8Array(Buffer.from(contractUtxo.token.category, 'hex'));
    const commitmentBytes = hexToBytes(contractUtxo.token.nft.commitment || '');
    const token = {
      category: tokenCategoryBytes,
      amount: 0n,
      nft: {
        capability: contractUtxo.token.nft.capability,
        commitment: commitmentBytes,
      },
    };

    const inputs = [contractUtxo, ...fundingUtxos];
    const sourceOutputs = inputs.map((utxo, idx) => {
      const isContractInput = idx === 0;
      return {
        outpointIndex: utxo.vout,
        outpointTransactionHash: new Uint8Array(Buffer.from(utxo.txid, 'hex')),
        sequenceNumber: 0xffffffff,
        unlockingBytecode: new Uint8Array(),
        lockingBytecode: isContractInput ? contractLockingBytecode : buyerLockingBytecode,
        valueSatoshis: utxo.satoshis,
        token: isContractInput ? token : undefined,
        contract: isContractInput
          ? {
              abiFunction: contract.artifact.abi.find((fn) => fn.name === 'buy'),
              redeemScript: hexToBytes(contract.bytecode),
              artifact: contract.artifact,
            }
          : undefined,
      };
    });

    const royalty = (listing.price * BigInt(listing.royaltyBasisPoints)) / 10000n;
    const sellerAmount = listing.price - royalty;

    const indexLockingBytecode = getLockingBytecode(indexAddress);
    const buyerPkh = getPkhHexFromAddress(buyerAddress);
    const eventHex = buildStatusEventHex({
      listingTxid: listing.txid,
      status: 'sold',
      actorPkh: buyerPkh,
    });
    const opReturnLockingBytecode = encodeNullDataScript([
      Op.OP_RETURN,
      hexToBytes(eventHex),
    ]);

    const outputs: Array<{ lockingBytecode: Uint8Array; valueSatoshis: bigint; token?: any }> = [
      { lockingBytecode: sellerLockingBytecode, valueSatoshis: sellerAmount },
      { lockingBytecode: creatorLockingBytecode, valueSatoshis: royalty },
      { lockingBytecode: buyerLockingBytecode, valueSatoshis: 1000n, token },
      { lockingBytecode: indexLockingBytecode, valueSatoshis: 546n },
      { lockingBytecode: opReturnLockingBytecode, valueSatoshis: 0n },
    ];

    const totalInput = inputs.reduce((sum, u) => sum + u.satoshis, 0n);
    const fee = 2000n;
    const change = totalInput - sellerAmount - royalty - 1000n - 546n - fee;
    if (change < 0n) {
      return { error: 'Insufficient funds for purchase fees.' };
    }
    if (change > 546n) {
      outputs.push({ lockingBytecode: buyerLockingBytecode, valueSatoshis: change });
    }

    const transaction = {
      version: 2,
      inputs: sourceOutputs.map((so) => ({
        outpointIndex: so.outpointIndex,
        outpointTransactionHash: so.outpointTransactionHash,
        sequenceNumber: so.sequenceNumber,
        unlockingBytecode: so.unlockingBytecode,
      })),
      outputs,
      locktime: 0,
    };

    const contractUnlocker = contract.unlock.buy(buyerPkh);
    const contractUnlocking = contractUnlocker.generateUnlockingBytecode({
      transaction,
      sourceOutputs,
      inputIndex: 0,
    });
    transaction.inputs[0].unlockingBytecode = new Uint8Array(contractUnlocking);

    const transactionHex = binToHex(encodeTransaction(transaction));
    const sourceOutputsJson = buildSourceOutputsJson(sourceOutputs);

    return {
      transactionHex,
      transaction,
      sourceOutputs,
      sourceOutputsJson,
      userPrompt: `Buy NFT: ${listing.metadata?.name || listing.tokenCategory.slice(0, 8)}`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to build buy transaction' };
  }
}

// Build WalletConnect bid params for auction listing
export async function buildWcBidParams(params: {
  auction: AuctionListing;
  bidAmount: bigint;
  bidderAddress: string;
}): Promise<{
  transactionHex: string;
  transaction: any;
  sourceOutputs: object[];
  sourceOutputsJson: object[];
  userPrompt: string;
} | { error: string }> {
  try {
    const { auction, bidAmount, bidderAddress } = params;

    if (!auction.trackingCategory) {
      return { error: 'Auction tracking category missing. Please re-list this NFT.' };
    }
    const trackingCategory = auction.trackingCategory;

    let sellerPkh = auction.sellerPkh || '';
    if (!sellerPkh) {
      const decodedSeller = decodeCashAddress(auction.sellerAddress);
      if (typeof decodedSeller === 'string') {
        return { error: 'Invalid seller address' };
      }
      sellerPkh = Buffer.from(decodedSeller.payload).toString('hex');
    }

    let creatorPkh = auction.creatorPkh || '';
    if (!creatorPkh) {
      const decodedCreator = decodeCashAddress(auction.creatorAddress);
      if (typeof decodedCreator === 'string') {
        return { error: 'Invalid creator address' };
      }
      creatorPkh = Buffer.from(decodedCreator.payload).toString('hex');
    }

    const contract = buildAuctionContract(
      sellerPkh,
      auction.minBid,
      BigInt(auction.endTime),
      creatorPkh,
      BigInt(auction.royaltyBasisPoints),
      auction.minBidIncrement
    );

    const contractUtxos = await contract.getUtxos();
    const contractUtxo = contractUtxos.find((u) => u.token?.category === auction.tokenCategory);
    if (!contractUtxo || !contractUtxo.token?.nft) {
      return { error: 'NFT not found in auction contract' };
    }

    const auctionLockingBytecode = getLockingBytecode(contract.tokenAddress);
    const stateContract = buildAuctionStateContract(sellerPkh, auctionLockingBytecode, trackingCategory);
    const stateUtxos = await stateContract.getUtxos();
    const stateUtxo = stateUtxos.find((u) => u.token?.category === trackingCategory && u.token?.nft);
    if (!stateUtxo || !stateUtxo.token?.nft) {
      return { error: 'Auction state not found' };
    }

    const currentBidAmount = contractUtxo.satoshis;
    const prevCommitment = stateUtxo.token.nft.commitment || ZERO_PKH_HEX;
    const prevBidderPkhHex = prevCommitment.length === 40 ? prevCommitment : ZERO_PKH_HEX;
    const hasPrevBidder = !/^0+$/.test(prevBidderPkhHex);

    const indexAddress = getListingIndexAddress();
    if (!indexAddress) {
      return { error: 'Listing index address not configured.' };
    }

    const bidderUtxos = await getUtxos(bidderAddress);
    const fundingUtxos = selectUtxos(bidderUtxos, bidAmount + 3000n);

    const bidderLockingBytecode = getLockingBytecode(bidderAddress);
    const contractLockingBytecode = auctionLockingBytecode;
    const stateLockingBytecode = getLockingBytecode(stateContract.tokenAddress);

    const tokenCategoryBytes = new Uint8Array(Buffer.from(contractUtxo.token.category, 'hex'));
    const commitmentBytes = hexToBytes(contractUtxo.token.nft.commitment || '');
    const token = {
      category: tokenCategoryBytes,
      amount: 0n,
      nft: {
        capability: contractUtxo.token.nft.capability,
        commitment: commitmentBytes,
      },
    };

    const inputs = [contractUtxo, stateUtxo, ...fundingUtxos];
    const sourceOutputs = inputs.map((utxo, idx) => {
      const isAuctionInput = idx === 0;
      const isStateInput = idx === 1;
      return {
        outpointIndex: utxo.vout,
        outpointTransactionHash: new Uint8Array(Buffer.from(utxo.txid, 'hex')),
        sequenceNumber: 0xffffffff,
        unlockingBytecode: new Uint8Array(),
        lockingBytecode: isAuctionInput
          ? contractLockingBytecode
          : isStateInput
            ? stateLockingBytecode
            : bidderLockingBytecode,
        valueSatoshis: utxo.satoshis,
        token: isAuctionInput
          ? token
          : isStateInput
            ? {
                category: new Uint8Array(Buffer.from(trackingCategory, 'hex')),
                amount: 0n,
                nft: {
                  capability: stateUtxo.token!.nft!.capability,
                  commitment: hexToBytes(prevBidderPkhHex),
                },
              }
            : undefined,
        contract: isAuctionInput
          ? {
              abiFunction: contract.artifact.abi.find((fn) => fn.name === 'bid'),
              redeemScript: hexToBytes(contract.bytecode),
              artifact: contract.artifact,
            }
          : isStateInput
            ? {
                abiFunction: stateContract.artifact.abi.find((fn) => fn.name === 'bid'),
                redeemScript: hexToBytes(stateContract.bytecode),
                artifact: stateContract.artifact,
              }
            : undefined,
      };
    });

    const indexLockingBytecode = getLockingBytecode(indexAddress);
    const bidderPkh = getPkhHexFromAddress(bidderAddress);
    const eventHex = buildBidEventHex({
      listingTxid: auction.txid,
      bidderPkh,
      bidAmount,
    });
    const opReturnLockingBytecode = encodeNullDataScript([
      Op.OP_RETURN,
      hexToBytes(eventHex),
    ]);

    const outputs: Array<{ lockingBytecode: Uint8Array; valueSatoshis: bigint; token?: any }> = [
      { lockingBytecode: contractLockingBytecode, valueSatoshis: bidAmount, token },
      {
        lockingBytecode: getLockingBytecode(stateContract.tokenAddress),
        valueSatoshis: 1000n,
        token: {
          category: new Uint8Array(Buffer.from(trackingCategory, 'hex')),
          amount: 0n,
          nft: {
            capability: stateUtxo.token!.nft!.capability,
            commitment: hexToBytes(bidderPkh),
          },
        },
      },
    ];

    const refund = hasPrevBidder ? currentBidAmount : 0n;
    if (hasPrevBidder) {
      const prevBidderLockingBytecode = new Uint8Array([
        0x76, 0xa9, 0x14, ...hexToBytes(prevBidderPkhHex), 0x88, 0xac,
      ]);
      outputs.push({ lockingBytecode: prevBidderLockingBytecode, valueSatoshis: currentBidAmount });
    }

    outputs.push({ lockingBytecode: indexLockingBytecode, valueSatoshis: 546n });
    outputs.push({ lockingBytecode: opReturnLockingBytecode, valueSatoshis: 0n });

    const totalInput = inputs.reduce((sum, u) => sum + u.satoshis, 0n);
    const fee = 2000n;
    const change = totalInput - bidAmount - 1000n - refund - 546n - fee;
    if (change < 0n) {
      return { error: 'Insufficient funds for bid fees.' };
    }
    if (change > 546n) {
      outputs.push({ lockingBytecode: bidderLockingBytecode, valueSatoshis: change });
    }

    const transaction = {
      version: 2,
      inputs: sourceOutputs.map((so) => ({
        outpointIndex: so.outpointIndex,
        outpointTransactionHash: so.outpointTransactionHash,
        sequenceNumber: so.sequenceNumber,
        unlockingBytecode: so.unlockingBytecode,
      })),
      outputs,
      locktime: 0,
    };

    const contractUnlocker = contract.unlock.bid(currentBidAmount);
    const contractUnlocking = contractUnlocker.generateUnlockingBytecode({
      transaction,
      sourceOutputs,
      inputIndex: 0,
    });
    transaction.inputs[0].unlockingBytecode = new Uint8Array(contractUnlocking);

    const stateUnlocker = stateContract.unlock.bid(
      currentBidAmount,
      prevBidderPkhHex,
      bidderPkh
    );
    const stateUnlocking = stateUnlocker.generateUnlockingBytecode({
      transaction,
      sourceOutputs,
      inputIndex: 1,
    });
    transaction.inputs[1].unlockingBytecode = new Uint8Array(stateUnlocking);

    const transactionHex = binToHex(encodeTransaction(transaction));
    const sourceOutputsJson = buildSourceOutputsJson(sourceOutputs);

    return {
      transactionHex,
      transaction,
      sourceOutputs,
      sourceOutputsJson,
      userPrompt: `Place bid: ${auction.metadata?.name || auction.tokenCategory.slice(0, 8)}`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to build bid transaction' };
  }
}

// Build WalletConnect claim params for auction listing
export async function buildWcClaimParams(params: {
  auction: AuctionListing;
  winnerAddress: string;
}): Promise<{
  transactionHex: string;
  transaction: any;
  sourceOutputs: object[];
  sourceOutputsJson: object[];
  userPrompt: string;
} | { error: string }> {
  try {
    const { auction, winnerAddress } = params;

    if (!auction.trackingCategory) {
      return { error: 'Auction tracking category missing. Please re-list this NFT.' };
    }
    const trackingCategory = auction.trackingCategory;

    let sellerPkh = auction.sellerPkh || '';
    if (!sellerPkh) {
      const decodedSeller = decodeCashAddress(auction.sellerAddress);
      if (typeof decodedSeller === 'string') {
        return { error: 'Invalid seller address' };
      }
      sellerPkh = Buffer.from(decodedSeller.payload).toString('hex');
    }

    let creatorPkh = auction.creatorPkh || '';
    if (!creatorPkh) {
      const decodedCreator = decodeCashAddress(auction.creatorAddress);
      if (typeof decodedCreator === 'string') {
        return { error: 'Invalid creator address' };
      }
      creatorPkh = Buffer.from(decodedCreator.payload).toString('hex');
    }

    const contract = buildAuctionContract(
      sellerPkh,
      auction.minBid,
      BigInt(auction.endTime),
      creatorPkh,
      BigInt(auction.royaltyBasisPoints),
      auction.minBidIncrement
    );

    const contractUtxos = await contract.getUtxos();
    const contractUtxo = contractUtxos.find((u) => u.token?.category === auction.tokenCategory);
    if (!contractUtxo || !contractUtxo.token?.nft) {
      return { error: 'NFT not found in auction contract' };
    }

    const auctionLockingBytecode = getLockingBytecode(contract.tokenAddress);
    const stateContract = buildAuctionStateContract(sellerPkh, auctionLockingBytecode, trackingCategory);
    const stateUtxos = await stateContract.getUtxos();
    const stateUtxo = stateUtxos.find((u) => u.token?.category === trackingCategory && u.token?.nft);
    if (!stateUtxo || !stateUtxo.token?.nft) {
      return { error: 'Auction state not found' };
    }

    const finalBid = contractUtxo.satoshis;
    if (finalBid <= 0n) {
      return { error: 'No winning bid to claim' };
    }

    const indexAddress = getListingIndexAddress();
    if (!indexAddress) {
      return { error: 'Listing index address not configured.' };
    }

    const winnerUtxos = await getUtxos(winnerAddress);
    const feeUtxos = selectUtxos(winnerUtxos, 3000n);

    const winnerLockingBytecode = getLockingBytecode(winnerAddress);
    const sellerLockingBytecode = getLockingBytecode(auction.sellerAddress);
    const creatorLockingBytecode = getLockingBytecode(auction.creatorAddress);
    const contractLockingBytecode = getLockingBytecode(contract.tokenAddress);
    const stateLockingBytecode = getLockingBytecode(stateContract.tokenAddress);

    const tokenCategoryBytes = new Uint8Array(Buffer.from(contractUtxo.token.category, 'hex'));
    const commitmentBytes = hexToBytes(contractUtxo.token.nft.commitment || '');
    const token = {
      category: tokenCategoryBytes,
      amount: 0n,
      nft: {
        capability: contractUtxo.token.nft.capability,
        commitment: commitmentBytes,
      },
    };

    const stateCommitment = stateUtxo.token.nft.commitment || ZERO_PKH_HEX;
    const winnerPkh = getPkhHexFromAddress(winnerAddress);
    if (stateCommitment !== winnerPkh) {
      return { error: 'Winner does not match current highest bidder.' };
    }

    const inputs = [contractUtxo, stateUtxo, ...feeUtxos];
    const sourceOutputs = inputs.map((utxo, idx) => {
      const isAuctionInput = idx === 0;
      const isStateInput = idx === 1;
      return {
        outpointIndex: utxo.vout,
        outpointTransactionHash: new Uint8Array(Buffer.from(utxo.txid, 'hex')),
        sequenceNumber: isAuctionInput || isStateInput ? 0xfffffffe : 0xffffffff,
        unlockingBytecode: new Uint8Array(),
        lockingBytecode: isAuctionInput
          ? contractLockingBytecode
          : isStateInput
            ? stateLockingBytecode
            : winnerLockingBytecode,
        valueSatoshis: utxo.satoshis,
        token: isAuctionInput
          ? token
          : isStateInput
            ? {
                category: new Uint8Array(Buffer.from(trackingCategory, 'hex')),
                amount: 0n,
                nft: {
                  capability: stateUtxo.token!.nft!.capability,
                  commitment: hexToBytes(stateCommitment),
                },
              }
            : undefined,
        contract: isAuctionInput
          ? {
              abiFunction: contract.artifact.abi.find((fn) => fn.name === 'claim'),
              redeemScript: hexToBytes(contract.bytecode),
              artifact: contract.artifact,
            }
          : isStateInput
            ? {
                abiFunction: stateContract.artifact.abi.find((fn) => fn.name === 'claim'),
                redeemScript: hexToBytes(stateContract.bytecode),
                artifact: stateContract.artifact,
              }
            : undefined,
      };
    });

    const royalty = (finalBid * BigInt(auction.royaltyBasisPoints)) / 10000n;
    const sellerAmount = finalBid - royalty;

    const indexLockingBytecode = getLockingBytecode(indexAddress);
    const eventHex = buildStatusEventHex({
      listingTxid: auction.txid,
      status: 'claimed',
      actorPkh: winnerPkh,
    });
    const opReturnLockingBytecode = encodeNullDataScript([
      Op.OP_RETURN,
      hexToBytes(eventHex),
    ]);

    const outputs: Array<{ lockingBytecode: Uint8Array; valueSatoshis: bigint; token?: any }> = [
      { lockingBytecode: sellerLockingBytecode, valueSatoshis: sellerAmount },
      { lockingBytecode: creatorLockingBytecode, valueSatoshis: royalty },
      { lockingBytecode: winnerLockingBytecode, valueSatoshis: 1000n, token },
      {
        lockingBytecode: sellerLockingBytecode,
        valueSatoshis: 1000n,
        token: {
          category: new Uint8Array(Buffer.from(trackingCategory, 'hex')),
          amount: 0n,
          nft: {
            capability: stateUtxo.token!.nft!.capability,
            commitment: hexToBytes(stateCommitment),
          },
        },
      },
      { lockingBytecode: indexLockingBytecode, valueSatoshis: 546n },
      { lockingBytecode: opReturnLockingBytecode, valueSatoshis: 0n },
    ];

    const totalInput = inputs.reduce((sum, u) => sum + u.satoshis, 0n);
    const fee = 2000n;
    const change = totalInput - sellerAmount - royalty - 1000n - 1000n - 546n - fee;
    if (change < 0n) {
      return { error: 'Insufficient funds for claim fees.' };
    }
    if (change > 546n) {
      outputs.push({ lockingBytecode: winnerLockingBytecode, valueSatoshis: change });
    }

    const transaction = {
      version: 2,
      inputs: sourceOutputs.map((so) => ({
        outpointIndex: so.outpointIndex,
        outpointTransactionHash: so.outpointTransactionHash,
        sequenceNumber: so.sequenceNumber,
        unlockingBytecode: so.unlockingBytecode,
      })),
      outputs,
      locktime: auction.endTime,
    };

    const contractUnlocker = contract.unlock.claim(finalBid, winnerPkh);
    const contractUnlocking = contractUnlocker.generateUnlockingBytecode({
      transaction,
      sourceOutputs,
      inputIndex: 0,
    });
    transaction.inputs[0].unlockingBytecode = new Uint8Array(contractUnlocking);

    const stateUnlocker = stateContract.unlock.claim(winnerPkh);
    const stateUnlocking = stateUnlocker.generateUnlockingBytecode({
      transaction,
      sourceOutputs,
      inputIndex: 1,
    });
    transaction.inputs[1].unlockingBytecode = new Uint8Array(stateUnlocking);

    const transactionHex = binToHex(encodeTransaction(transaction));
    const sourceOutputsJson = buildSourceOutputsJson(sourceOutputs);

    return {
      transactionHex,
      transaction,
      sourceOutputs,
      sourceOutputsJson,
      userPrompt: `Claim NFT: ${auction.metadata?.name || auction.tokenCategory.slice(0, 8)}`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to build claim transaction' };
  }
}

// Mint a new CashTokens NFT (server-side only — called via /api/mint)
export async function mintNFT(
  privateKey: Uint8Array,
  pkh: string,
  address: string,        // P2PKH funding address (where BCH lives)
  tokenAddress: string,   // token-capable address (z… prefix) for NFT output
  commitment: string,     // IPFS CID or arbitrary UTF-8 string (truncated to 40 bytes)
  capability: 'none' | 'mutable' | 'minting' = 'none',
  payment?: { toAddress: string; amount: bigint }, // optional payment output (e.g. drop mint price)
): Promise<TransactionResult> {
  try {
    // CashTokens genesis: the token category = txid of the genesis input.
    // BCH protocol requires the genesis input to have vout === 0.
    const userContract = buildP2PKHContract(pkh);
    const utxos = await getUtxos(address);

    if (utxos.length === 0) {
      return {
        success: false,
        error: 'No UTXOs available or Electrum is unavailable. Please fund your wallet or check your Electrum server.',
      };
    }

    // Find a UTXO with vout=0 — required by BCH CashTokens spec for genesis minting.
    let nonTokenUtxos = utxos.filter(u => !u.token);
    let genesisInput = nonTokenUtxos.find(u => u.vout === 0);

    const signatureTemplate = new SignatureTemplate(privateKey);
    const pk = signatureTemplate.getPublicKey();
    const outputAddress = tokenAddress || address;

    if (!genesisInput) {
      // Auto-prep: create a self-send transaction to produce a fresh vout=0 UTXO.
      // This is needed when all UTXOs came back as change (vout>=1) from prior transactions.
      const sorted = [...nonTokenUtxos].sort((a, b) => Number(b.satoshis - a.satoshis));
      if (sorted.length === 0 || sorted[0].satoshis < 1200n) {
        return {
          success: false,
          error: 'No genesis-capable UTXO and insufficient funds to create one. Please fund your wallet from the Chipnet faucet.',
        };
      }
      const prepInput = sorted[0];
      const prepFee = 400n;
      const prepTx = userContract.functions.spend(pk, signatureTemplate)
        .fromP2PKH([prepInput], signatureTemplate)
        .to(address, prepInput.satoshis - prepFee) // Single output → becomes vout=0
        .withTime(0)
        .withHardcodedFee(prepFee)
        .withoutChange();
      const prepHex = await prepTx.build();
      const prepTxid = await getProvider().sendRawTransaction(prepHex);

      // Poll for the new vout=0 UTXO to appear in the mempool (up to ~15s)
      let freshUtxos: Utxo[] = [];
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 1500));
        freshUtxos = await getUtxos(address);
        genesisInput = freshUtxos.find(u => u.txid === prepTxid && u.vout === 0 && !u.token) ?? undefined;
        if (genesisInput) break;
      }
      if (!genesisInput) {
        return { success: false, error: 'Prep transaction not confirmed in time. Please try again.' };
      }
      nonTokenUtxos = freshUtxos.filter(u => !u.token);
    }

    // The token category = txid of the genesis input.
    const category = genesisInput.txid;

    // Encode CIDv1 as binary bytes (36 bytes = 72 hex chars, fits in 40-byte BCH limit).
    const commitmentHex = cidToCommitmentHex(commitment);

    // Build input list: genesis input first (required), then other BCH UTXOs for fees.
    const otherUtxos = nonTokenUtxos
      .filter(u => !(u.txid === genesisInput!.txid && u.vout === genesisInput!.vout))
      .sort((a, b) => Number(b.satoshis - a.satoshis));

    const paymentAmount = payment?.amount ?? 0n;
    const allFundingUtxos: Utxo[] = [genesisInput];
    let totalSats = genesisInput.satoshis;
    // Gather enough UTXOs to cover NFT dust + fee + optional payment
    const minimumTarget = 4000n + paymentAmount;
    for (const u of otherUtxos) {
      if (totalSats >= minimumTarget) break;
      allFundingUtxos.push(u);
      totalSats += u.satoshis;
    }

    const minimumNeeded = 2000n + paymentAmount;
    if (totalSats < minimumNeeded) {
      return { success: false, error: `Insufficient funds: ${totalSats} sats available, need at least ${minimumNeeded} sats.` };
    }

    // Fee estimate: 148 bytes per P2PKH input + ~34 bytes per extra output + ~200 overhead
    const extraOutputCount = payment && payment.amount > 546n ? 1 : 0;
    const fee = BigInt(Math.max(500, allFundingUtxos.length * 148 + 200 + extraOutputCount * 34));
    const nftOutputSats = 1000n;
    const change = totalSats - nftOutputSats - fee - paymentAmount;

    // fromP2PKH: generates standard P2PKH unlocking scripts (not P2SH).
    // withTime(0): sets locktime=0, avoids calling getBlockHeight() on Electrum.
    // withHardcodedFee + withoutChange: prevents CashScript from adding change to
    //   the P2SH32 contract address — we add change to the user's real address manually.
    const tx = userContract.functions.spend(pk, signatureTemplate)
      .fromP2PKH(allFundingUtxos, signatureTemplate)
      .to(outputAddress, nftOutputSats, {
        category: category,
        amount: 0n,
        nft: { capability, commitment: commitmentHex },
      } as any)
      .withTime(0)
      .withHardcodedFee(fee)
      .withoutChange();

    // Optional: include payment to drop creator (e.g. mint price)
    if (payment && payment.amount > 546n) {
      tx.to(payment.toAddress, payment.amount);
    }

    if (change > 546n) {
      tx.to(address, change);
    }

    // Build the signed tx hex, then broadcast directly — bypasses CashScript's
    // debug() call which would fail when all inputs are P2PKH (no contract inputs).
    const rawHex = await tx.build();
    const txid = await getProvider().sendRawTransaction(rawHex);

    return {
      success: true,
      txid,
      tokenCategory: category,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mint NFT',
    };
  }
}

export function normalizeCommitment(commitment: string): string {
  if (!commitment) return '';
  if (isHexString(commitment)) return commitment.toLowerCase();
  return utf8ToHex(commitment).toLowerCase();
}

export function decodeCommitmentToCid(commitment: string): string {
  return commitmentHexToCid(commitment);
}
