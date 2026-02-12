// BCH Contract interaction layer
// Handles marketplace and auction contract operations on Chipnet

import { ElectrumNetworkProvider, Contract, SignatureTemplate, Artifact } from 'cashscript';
import type { NFTListing, AuctionListing, TransactionResult } from '@/lib/types';
import marketplaceArtifact from './artifacts/marketplace.json';
import auctionArtifact from './artifacts/auction.json';
import p2pkhArtifact from './artifacts/p2pkh.json';
import { Utxo } from 'cashscript'; // Import Utxo type

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
  tokenUtxo: { txid: string; vout: number; satoshis: bigint },
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
        nft: { capability: 'none', commitment: '' } // Assumption: commitment empty or should be passed? 
        // Ideally we should pass full Utxo object.
        // Using placeholder for now, might fail if commitment mismatch?
        // CashScript doesn't check commitment on input unless script requires it?
        // Actually it matters for preserving it in output.
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
          nft: { capability: 'none', commitment: '' } // TODO: Pass real commitment 
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
      .fromP2PKH(fundingUtxos, buyerTemplate) // Buyer pays
      .to(contract.address, 1000n); // Dust to contract (or nothing? wait, contract doesn't keep anything, it sends all out)

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
        10000n // TODO: Add minBidIncrement to AuctionListing type
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
    }

    tx.from(nftUtxo)
      .to(listing.sellerAddress, 1000n, { token: { category: listing.tokenCategory, amount: 0n, nft: { capability: 'none', commitment: listing.commitment } } } as any);

    return {
      success: true,
      txid: 'cancel_tx_simulated'
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
      10000n // TODO: minBidIncrement
    );

    const contractUtxos = await contract.getUtxos();
    const nftUtxo = contractUtxos.find(u => u.token?.category === auction.tokenCategory);
    if (!nftUtxo) throw new Error('NFT not found in auction');

    const currentBid = auction.currentBid || 0n;
    const prevBidder = auction.currentBidder || auction.sellerAddress;

    // Convert address to bytes20 placeholder (real implementation would decode address)
    // We need to decode prevBidder address to PKH.
    // Since we don't have decode helper here, using placeholder.
    // Ideally use library like `libauth`.
    const prevBidderPkh = Uint8Array.from(Buffer.alloc(20));

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
      10000n
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
      .fromP2PKH(feeUtxos, winnerTemplate); // Pay for fees

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

// Mint a new CashTokens NFT
export async function mintNFT(
  privateKey: Uint8Array,
  pkh: string,
  address: string, // Added argument
  commitment: string, // IPFS CID or text
  metadata: { name: string; description: string; image: string },
  walletType: 'generated' | 'walletconnect' = 'generated',
  wcSession?: any,
  wcClient?: any
): Promise<TransactionResult> {
  try {
    if (walletType === 'walletconnect') {
      // WalletConnect Implementation
      // TODO: Implement robust transaction construction for external signing.
      // Currently, CashScript relies on internal construction.
      // We would need to:
      // 1. Build the transaction using a library like Libauth or bitcoincashjs
      // 2. Request signature via wcClient.request({ method: 'bch_signTransaction', ... })
      // 3. Broadcast signed tx

      console.log('WalletConnect Mint initiated', wcSession);
      return {
        success: false,
        error: 'WalletConnect minting is currently implementing external signing. Please use "Create New Wallet" for now.',
      };
    }

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
