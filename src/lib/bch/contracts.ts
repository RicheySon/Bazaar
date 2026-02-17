// BCH Contract interaction layer
// Handles marketplace and auction contract operations on Chipnet

import { ElectrumNetworkProvider, Contract, SignatureTemplate, Artifact } from 'cashscript';
import { decodeCashAddress, encodeTransaction, binToHex, cashAddressToLockingBytecode } from '@bitauth/libauth';
import type { NFTListing, AuctionListing, TransactionResult } from '@/lib/types';
import marketplaceArtifact from './artifacts/marketplace.json';
import auctionArtifact from './artifacts/auction.json';
import p2pkhArtifact from './artifacts/p2pkh.json';
import { Utxo } from 'cashscript'; // Import Utxo type
import { hexToBytes, isHexString, utf8ToHex } from '@/lib/utils';

const wcDebug = process.env.NEXT_PUBLIC_WC_DEBUG === 'true';
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

export function getProvider(): ElectrumNetworkProvider {
  if (!provider) {
    provider = new ElectrumNetworkProvider('chipnet');
  }
  return provider;
}

// Get address balance in satoshis
export async function getBalance(address: string): Promise<bigint> {
  try {
    const electrum = getProvider();
    const utxos = await electrum.getUtxos(address);
    return utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0n);
  } catch (error) {
    console.error('Failed to get balance:', error);
    return 0n;
  }
}

// Get UTXOs for an address
export async function getUtxos(address: string): Promise<Utxo[]> {
  try {
    const electrum = getProvider();
    return await electrum.getUtxos(address);
  } catch (error) {
    console.error('Failed to get UTXOs:', error);
    return [];
  }
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
  sellerPkh: string // Added argument to reconstruction
): Promise<TransactionResult> {
  try {
    // 1. Build marketplace contract (destination)
    const marketplace = buildMarketplaceContract(sellerPkh, price, creatorPkh, royaltyBasisPoints);

    // 2. Build seller's P2PKH contract (source)
    const userContract = buildP2PKHContract(sellerPkh);

    // 3. Prepare wallet signature
    const signatureTemplate = new SignatureTemplate(privateKey);
    const sellerPk = signatureTemplate.getPublicKey();

    // 4. Get fee UTXOs
    // We need 1000n (output) + fee (approx 500n) = 1500n
    // NFT UTXO has some dust, likely 800-1000n.
    // If NFT UTXO < 1000n, we definitely need more.
    // Safest to ask for 2000n from wallet.
    // But `tokenUtxo` is passed as specific object, might not match Utxo type exactly.
    // We need to cast it or find it in user UTXOs?
    // It's checked in `getUtxos` logic?
    // Let's assume it matches Utxo interface or cast it.

    // Note: tokenUtxo passed here doesn't have `token` property explicitly in type logic above?
    // `tokenUtxo: { txid: string; vout: number; satoshis: bigint }`
    // We need to shape it as Utxo for CashScript.
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

    // We need fee UTXOs.
    // We need to fetch FRESH UTXOs from network to be safe.
    // Assuming `getUtxos` uses address derived from `privateKey`.
    // But we don't have address here, only `privateKey`.
    // We can derive it? Or assume `sellerPkh` implies address?
    // We need address to query Electrum.
    // `wallet.ts` has `address` in `WalletData`.
    // Here we only have `privateKey`.
    // We can derive address from `privateKey` + chipnet prefix?
    // `contracts.ts` shouldn't re-implement wallet logic.
    // Ideally `createFixedListing` should take `WalletData` or `address`.
    // But signature is fixed.
    // Wait, `sellerPkh` is passed. We can derive address from that?
    // Yes, `p2pkh.cash` uses `pkh`. we can query `scripthash` of `p2pkh` contract = legacy address.
    // CashScript `Contract` has `.address`.

    const fundingUtxos = await getUtxos(userContract.address);
    // Filter out the NFT UTXO itself to avoid double usage error
    const feeUtxos = selectUtxos(
      fundingUtxos.filter(u => u.txid !== tokenUtxo.txid),
      2000n
    );

    // 5. Construct Transaction
    const tx = userContract.functions.spend(sellerPk, signatureTemplate)
      .from(nftInput)
      .from(feeUtxos)
      .to(marketplace.address, 1000n, {
        token: {
          category: tokenCategory,
          amount: 0n,
          nft: { capability: tokenUtxo.capability || 'none', commitment: tokenUtxo.commitment }
        }
      } as any);

    const txDetails = await tx.send();

    return {
      success: true,
      txid: txDetails.txid,
    };
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
  sellerPkh: string
): Promise<TransactionResult> {
  try {
    const auction = buildAuctionContract(
      sellerPkh,
      minBid,
      endTime,
      creatorPkh,
      royaltyBasisPoints,
      minBidIncrement
    );

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

    const fundingUtxos = await getUtxos(userContract.address);
    const feeUtxos = selectUtxos(
      fundingUtxos.filter(u => u.txid !== tokenUtxo.txid),
      2000n
    );

    const tx = userContract.functions.spend(sellerPk, signatureTemplate)
      .from(nftInput)
      .from(feeUtxos)
      .to(auction.address, 1000n, {
        token: {
          category: tokenCategory,
          amount: 0n,
          nft: { capability: tokenUtxo.capability || 'none', commitment: tokenUtxo.commitment }
        }
      } as any);

    const txDetails = await tx.send();

    return {
      success: true,
      txid: txDetails.txid,
    };
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
    const needed = listing.price + 2000n;
    const fundingUtxos = selectUtxos(buyerUtxos, needed);
    const buyerTemplate = new SignatureTemplate(buyerPrivateKey);

    const tx = contract.functions.buy()
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
    tx.to(buyerAddress, 1000n, { token: { category: listing.tokenCategory, amount: 0n, nft: { capability: 'none', commitment: listing.commitment } } } as any);

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
    let contract: Contract;

    if (listing.listingType === 'fixed') {
      contract = buildMarketplaceContract(
        listing.sellerPkh,
        listing.price,
        listing.creatorPkh,
        BigInt(listing.royaltyBasisPoints)
      );
    } else {
      // Auction cancellation
      const auction = listing as AuctionListing;
      contract = buildAuctionContract(
        listing.sellerPkh,
        auction.minBid,
        BigInt(auction.endTime),
        listing.creatorPkh,
        BigInt(listing.royaltyBasisPoints),
        auction.minBidIncrement
      );
    }

    const contractUtxos = await contract.getUtxos();
    const nftUtxo = contractUtxos.find(u => u.token?.category === listing.tokenCategory);

    if (!nftUtxo) throw new Error('NFT not found');

    const signatureTemplate = new SignatureTemplate(sellerPrivateKey);
    const sellerPk = signatureTemplate.getPublicKey();

    // Call cancel or reclaim
    let tx;
    if (listing.listingType === 'fixed') {
      tx = contract.functions.cancel(sellerPk, signatureTemplate);
    } else {
      tx = contract.functions.reclaim(sellerPk, signatureTemplate);
      const auction = listing as AuctionListing;
      tx.withTime(auction.endTime);
    }

    const sellerUtxos = await getUtxos(listing.sellerAddress);
    const feeUtxos = selectUtxos(
      sellerUtxos.filter(u => u.txid !== nftUtxo.txid),
      2000n
    );

    tx.from(nftUtxo)
      .fromP2PKH(feeUtxos, signatureTemplate)
      .to(listing.sellerAddress, 1000n, { token: { category: listing.tokenCategory, amount: 0n, nft: { capability: 'none', commitment: listing.commitment } } } as any);

    return {
      success: true,
      txid: (await tx.send()).txid
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel listing',
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
    const contract = buildAuctionContract(
      auction.sellerPkh,
      auction.minBid,
      BigInt(auction.endTime),
      auction.creatorPkh,
      BigInt(auction.royaltyBasisPoints),
      auction.minBidIncrement
    );

    const contractUtxos = await contract.getUtxos();
    const nftUtxo = contractUtxos.find(u => u.token?.category === auction.tokenCategory);
    if (!nftUtxo) throw new Error('NFT not found in auction');

    const currentBid = auction.currentBid || 0n;
    const prevBidder = auction.currentBidder || auction.sellerAddress;
    const decodedPrev = decodeCashAddress(prevBidder);
    if (typeof decodedPrev === 'string') {
      throw new Error('Invalid previous bidder address');
    }
    const prevBidderPkh = decodedPrev.payload;

    const bidderUtxos = await getUtxos(bidderAddress);
    // Needed: bidAmount + Fee (2000n for safety)
    const fundingUtxos = selectUtxos(bidderUtxos, bidAmount + 2000n);
    const bidderTemplate = new SignatureTemplate(bidderPrivateKey);

    const tx = contract.functions.bid(currentBid, prevBidderPkh)
      .from(nftUtxo)
      .fromP2PKH(fundingUtxos, bidderTemplate)
      .to(contract.address, bidAmount, { token: { category: auction.tokenCategory, amount: 0n, nft: { capability: 'none', commitment: auction.commitment } } } as any);

    // Output 1: Refund
    if (currentBid > 0) {
      tx.to(prevBidder, currentBid);
    }

    // Change automatically handled

    const txDetails = await tx.send();

    return {
      success: true,
      txid: txDetails.txid,
    };
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
    const contract = buildAuctionContract(
      auction.sellerPkh,
      auction.minBid,
      BigInt(auction.endTime),
      auction.creatorPkh,
      BigInt(auction.royaltyBasisPoints),
      auction.minBidIncrement
    );

    const contractUtxos = await contract.getUtxos();
    const nftUtxo = contractUtxos.find(u => u.token?.category === auction.tokenCategory);
    if (!nftUtxo) throw new Error('NFT not found');

    const finalBid = auction.currentBid;

    const winnerUtxos = await getUtxos(winnerAddress);
    const feeUtxos = selectUtxos(winnerUtxos, 2000n);
    const winnerTemplate = new SignatureTemplate(winnerPrivateKey);

    const tx = contract.functions.claim(finalBid)
      .from(nftUtxo)
      .fromP2PKH(feeUtxos, winnerTemplate) // Pay for fees
      .withTime(auction.endTime);

    const royalty = (finalBid * BigInt(auction.royaltyBasisPoints)) / 10000n;
    const sellerAmount = finalBid - royalty;

    tx.to(auction.sellerAddress, sellerAmount);
    tx.to(auction.creatorAddress, royalty);

    // Send NFT to winner (currentBidder)
    tx.to(auction.currentBidder, 1000n, { token: { category: auction.tokenCategory, amount: 0n, nft: { capability: 'none', commitment: auction.commitment } } } as any);

    const txDetails = await tx.send();

    return {
      success: true,
      txid: txDetails.txid,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to claim auction',
    };
  }
}

// Build WalletConnect mint transaction params (used by create page)
// Returns hex-encoded transaction + sourceOutputs for signTransaction, or an error
export async function buildWcMintParams(
  address: string,
  commitment: string,
  metadata: { name: string; description: string; image: string }
): Promise<{
  transactionHex: string;
  transaction: any;
  sourceOutputs: object[];
  sourceOutputsJson: object[];
  category: string;
  userPrompt: string;
} | { error: string }> {
  try {
    const electrum = getProvider();
    wcLog('[WC Mint] Fetching UTXOs for', address);
    const utxos = await electrum.getUtxos(address);
    wcLog('[WC Mint] Got', utxos.length, 'UTXOs');

    if (utxos.length === 0) {
      return { error: 'No UTXOs available. Please fund your wallet from the Chipnet faucet.' };
    }

    const fundingUtxos = selectUtxos(utxos, 2000n);
    const genesisInput = fundingUtxos[0];
    const category = genesisInput.txid;
    const commitmentBytes = new Uint8Array(Buffer.from(commitment, 'utf8'));

    const decoded = decodeCashAddress(address);
    if (typeof decoded === 'string') {
      return { error: 'Invalid address: ' + decoded };
    }
    const addrPkh = decoded.payload;
    const lockingBytecode = new Uint8Array([0x76, 0xa9, 0x14, ...addrPkh, 0x88, 0xac]);

    // sourceOutputs: libauth Input & Output fields
    const sourceOutputs = fundingUtxos.map(utxo => ({
      outpointIndex: utxo.vout,
      outpointTransactionHash: new Uint8Array(Buffer.from(utxo.txid, 'hex')),
      sequenceNumber: 0xffffffff, // Final, non-RBF
      unlockingBytecode: new Uint8Array(), // CRITICAL: Empty so wallet recognizes it needs signing
      lockingBytecode: lockingBytecode,
      valueSatoshis: utxo.satoshis,
    }));

    const totalInput = fundingUtxos.reduce((sum, u) => sum + u.satoshis, 0n);
    const fee = 1000n;
    const nftDust = 1000n;
    const change = totalInput - nftDust - fee;

    const categoryBytes = new Uint8Array(Buffer.from(category, 'hex'));

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
          lockingBytecode: lockingBytecode,
          valueSatoshis: nftDust,
          token: {
            category: categoryBytes,
            amount: 0n,
            nft: {
              capability: 'none' as const,
              commitment: commitmentBytes,
            }
          }
        }
      ];

    if (change > 546n) {
      txOutputs.push({
        lockingBytecode: lockingBytecode,
        valueSatoshis: change,
      });
    }

    // Build the libauth Transaction object
    const transaction = {
      version: 2,
      inputs: sourceOutputs.map(so => ({
        outpointIndex: so.outpointIndex,
        outpointTransactionHash: so.outpointTransactionHash,
        sequenceNumber: so.sequenceNumber,
        unlockingBytecode: so.unlockingBytecode,
      })),
      outputs: txOutputs,
      locktime: 0,
    };

    // Encode to raw hex — bypasses the stringify() serialization issue
    // The WcSignTransactionRequest accepts `transaction: Transaction | string`
    const txBytes = encodeTransaction(transaction);
    const transactionHex = binToHex(txBytes);

    wcLog('[WC Mint] ========== TRANSACTION DEBUG ==========');
    wcLog('[WC Mint] Built tx:', fundingUtxos.length, 'inputs,', txOutputs.length, 'outputs');
    wcLog('[WC Mint] Category (hex):', category);
    wcLog('[WC Mint] Category (bytes):', categoryBytes);
    wcLog('[WC Mint] Commitment (string):', commitment);
    wcLog('[WC Mint] Commitment (bytes):', commitmentBytes);
    wcLog('[WC Mint] Total input:', totalInput.toString(), 'satoshis');
    wcLog('[WC Mint] Fee:', fee.toString(), 'satoshis');
    wcLog('[WC Mint] Change:', change.toString(), 'satoshis');
    wcLog('[WC Mint] NFT Dust:', nftDust.toString(), 'satoshis');
    wcLog('[WC Mint] Tx hex length:', transactionHex.length, 'chars, bytes:', txBytes.length);
    wcLog('[WC Mint] Transaction object:', JSON.stringify({
      version: transaction.version,
      inputs: transaction.inputs.map(inp => ({
        outpointIndex: inp.outpointIndex,
        outpointTransactionHash: binToHex(inp.outpointTransactionHash),
        sequenceNumber: inp.sequenceNumber,
        unlockingBytecode: binToHex(inp.unlockingBytecode), // Should be empty
      })),
      outputs: transaction.outputs.map(out => ({
        lockingBytecode: binToHex(out.lockingBytecode),
        valueSatoshis: out.valueSatoshis.toString(),
        token: out.token ? {
          category: binToHex(out.token.category),
          amount: out.token.amount.toString(),
          nft: out.token.nft
        } : undefined,
      })),
      locktime: transaction.locktime,
    }, null, 2));
    wcLog('[WC Mint] SourceOutputs:', JSON.stringify(sourceOutputs.map(so => ({
      outpointIndex: so.outpointIndex,
      outpointTransactionHash: binToHex(so.outpointTransactionHash),
      sequenceNumber: so.sequenceNumber,
      unlockingBytecode: binToHex(so.unlockingBytecode), // Should be empty ''
      lockingBytecode: binToHex(so.lockingBytecode),
      valueSatoshis: so.valueSatoshis.toString(),
    })), null, 2));
    wcLog('[WC Mint] ==========================================');

    const sourceOutputsJson = buildSourceOutputsJson(sourceOutputs);

    return {
      transactionHex,
      transaction, // Return the full object
      sourceOutputs: sourceOutputs,
      sourceOutputsJson,
      category,
      userPrompt: `Mint NFT: ${metadata.name}`,
    };
  } catch (error) {
    console.error('[WC Mint] buildWcMintParams error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to build transaction' };
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
} | { error: string }> {
  try {
    const electrum = getProvider();
    const utxos = await electrum.getUtxos(params.address);
    if (utxos.length === 0) {
      return { error: 'No UTXOs available. Please fund your wallet from the Chipnet faucet.' };
    }

    const nftUtxo = utxos.find(
      (u) => u.token?.category === params.tokenCategory && u.token?.nft
    );
    if (!nftUtxo || !nftUtxo.token?.nft) {
      return { error: 'NFT not found in wallet' };
    }

    const feeUtxos = selectUtxos(
      utxos.filter((u) => !u.token && u.txid !== nftUtxo.txid),
      2000n
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

    const commitment = nftUtxo.token.nft.commitment || '';
    const categoryBytes = new Uint8Array(Buffer.from(params.tokenCategory, 'hex'));
    const commitmentBytes = hexToBytes(commitment);

    const inputs = [nftUtxo, ...feeUtxos];

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
    const fee = 1000n;
    const nftDust = 1000n;
    const change = totalInput - nftDust - fee;

    const contractDecoded = cashAddressToLockingBytecode(contract.address);
    if (typeof contractDecoded === 'string') {
      return { error: 'Invalid contract address: ' + contractDecoded };
    }
    const contractLockingBytecode = contractDecoded.bytecode;

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

    const buyerUtxos = await getUtxos(buyerAddress);
    const fundingUtxos = selectUtxos(buyerUtxos, listing.price + 2000n);

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

    const outputs: Array<{ lockingBytecode: Uint8Array; valueSatoshis: bigint; token?: any }> = [
      { lockingBytecode: sellerLockingBytecode, valueSatoshis: sellerAmount },
      { lockingBytecode: creatorLockingBytecode, valueSatoshis: royalty },
      { lockingBytecode: buyerLockingBytecode, valueSatoshis: 1000n, token },
    ];

    const totalInput = inputs.reduce((sum, u) => sum + u.satoshis, 0n);
    const fee = 1000n;
    const change = totalInput - sellerAmount - royalty - 1000n - fee;
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

    const contractUnlocker = contract.unlock.buy();
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

    const currentBid = auction.currentBid || 0n;
    const prevBidder = auction.currentBidder || auction.sellerAddress;
    const decodedPrev = decodeCashAddress(prevBidder);
    if (typeof decodedPrev === 'string') {
      return { error: 'Invalid previous bidder address' };
    }
    const prevBidderPkhHex = Buffer.from(decodedPrev.payload).toString('hex');

    const bidderUtxos = await getUtxos(bidderAddress);
    const fundingUtxos = selectUtxos(bidderUtxos, bidAmount + 2000n);

    const bidderLockingBytecode = getLockingBytecode(bidderAddress);
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
        lockingBytecode: isContractInput ? contractLockingBytecode : bidderLockingBytecode,
        valueSatoshis: utxo.satoshis,
        token: isContractInput ? token : undefined,
        contract: isContractInput
          ? {
              abiFunction: contract.artifact.abi.find((fn) => fn.name === 'bid'),
              redeemScript: hexToBytes(contract.bytecode),
              artifact: contract.artifact,
            }
          : undefined,
      };
    });

    const outputs: Array<{ lockingBytecode: Uint8Array; valueSatoshis: bigint; token?: any }> = [
      { lockingBytecode: contractLockingBytecode, valueSatoshis: bidAmount, token },
    ];

    if (currentBid > 0n) {
      const prevBidderLockingBytecode = getLockingBytecode(prevBidder);
      outputs.push({ lockingBytecode: prevBidderLockingBytecode, valueSatoshis: currentBid });
    }

    const totalInput = inputs.reduce((sum, u) => sum + u.satoshis, 0n);
    const fee = 1000n;
    const change = totalInput - bidAmount - (currentBid > 0n ? currentBid : 0n) - fee;
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

    const contractUnlocker = contract.unlock.bid(currentBid, prevBidderPkhHex);
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

    const finalBid = auction.currentBid || 0n;
    if (finalBid <= 0n) {
      return { error: 'No winning bid to claim' };
    }

    const winnerUtxos = await getUtxos(winnerAddress);
    const feeUtxos = selectUtxos(winnerUtxos, 2000n);

    const winnerLockingBytecode = getLockingBytecode(winnerAddress);
    const sellerLockingBytecode = getLockingBytecode(auction.sellerAddress);
    const creatorLockingBytecode = getLockingBytecode(auction.creatorAddress);
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

    const inputs = [contractUtxo, ...feeUtxos];
    const sourceOutputs = inputs.map((utxo, idx) => {
      const isContractInput = idx === 0;
      return {
        outpointIndex: utxo.vout,
        outpointTransactionHash: new Uint8Array(Buffer.from(utxo.txid, 'hex')),
        sequenceNumber: 0xfffffffe,
        unlockingBytecode: new Uint8Array(),
        lockingBytecode: isContractInput ? contractLockingBytecode : winnerLockingBytecode,
        valueSatoshis: utxo.satoshis,
        token: isContractInput ? token : undefined,
        contract: isContractInput
          ? {
              abiFunction: contract.artifact.abi.find((fn) => fn.name === 'claim'),
              redeemScript: hexToBytes(contract.bytecode),
              artifact: contract.artifact,
            }
          : undefined,
      };
    });

    const royalty = (finalBid * BigInt(auction.royaltyBasisPoints)) / 10000n;
    const sellerAmount = finalBid - royalty;

    const outputs: Array<{ lockingBytecode: Uint8Array; valueSatoshis: bigint; token?: any }> = [
      { lockingBytecode: sellerLockingBytecode, valueSatoshis: sellerAmount },
      { lockingBytecode: creatorLockingBytecode, valueSatoshis: royalty },
      { lockingBytecode: winnerLockingBytecode, valueSatoshis: 1000n, token },
    ];

    const totalInput = inputs.reduce((sum, u) => sum + u.satoshis, 0n);
    const fee = 1000n;
    const change = totalInput - sellerAmount - royalty - 1000n - fee;
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

    const contractUnlocker = contract.unlock.claim(finalBid);
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
      userPrompt: `Claim NFT: ${auction.metadata?.name || auction.tokenCategory.slice(0, 8)}`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to build claim transaction' };
  }
}

// Mint a new CashTokens NFT (generated wallet path only)
export async function mintNFT(
  privateKey: Uint8Array,
  pkh: string,
  address: string,
  commitment: string,
  metadata: { name: string; description: string; image: string },
): Promise<TransactionResult> {
  try {

    // CashTokens genesis: spend a regular UTXO, create output with token data
    // Token category = txid of input being spent (specifically the 0th input)

    const userContract = buildP2PKHContract(pkh);
    const electrum = getProvider();
    const utxos = await electrum.getUtxos(address);

    if (utxos.length === 0) {
      return {
        success: false,
        error: 'No UTXOs available. Please fund your wallet from the Chipnet faucet.',
      };
    }

    // Select UTXOs.
    // We need at least 1000n (for NFT dust) + fee (approx 1000n) = 2000n.
    // We pick the largest generic UTXO as the genesis input.
    const fundingUtxos = selectUtxos(utxos, 2000n);
    const genesisInput = fundingUtxos[0];

    // The category ID of the new token will be the TXID of the *first* input.
    const category = genesisInput.txid;

    // Encode commitment string to hex
    const commitmentHex = Buffer.from(commitment, 'utf8').toString('hex');

    const signatureTemplate = new SignatureTemplate(privateKey);
    const pk = signatureTemplate.getPublicKey();

    const tx = userContract.functions.spend(pk, signatureTemplate)
      .from(fundingUtxos)
      .to(address, 1000n, {
        token: {
          category: category,
          amount: 0n,
          nft: {
            capability: 'none', // Immutable NFT
            commitment: commitmentHex
          }
        }
      } as any);

    const txDetails = await tx.send();

    return {
      success: true,
      txid: txDetails.txid,
      tokenCategory: category
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
  if (!commitment) return '';
  if (!isHexString(commitment)) return commitment;
  try {
    return new TextDecoder().decode(hexToBytes(commitment));
  } catch {
    return commitment;
  }
}
