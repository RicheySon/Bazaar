import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ElectrumNetworkProvider } from 'cashscript';
import {
  decodeTransaction,
  hexToBin,
  binToHex,
  addressContentsToLockingBytecode,
  lockingBytecodeToCashAddress,
  LockingBytecodeType,
} from '@bitauth/libauth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const inputArgIndex = args.indexOf('--input');
const outputArgIndex = args.indexOf('--output');
const networkArgIndex = args.indexOf('--network');

const inputPath = inputArgIndex >= 0 ? args[inputArgIndex + 1] : null;
const outputPath = outputArgIndex >= 0 ? args[outputArgIndex + 1] : null;
const network =
  (networkArgIndex >= 0 ? args[networkArgIndex + 1] : null) ||
  process.env.NEXT_PUBLIC_NETWORK ||
  'chipnet';

if (!inputPath) {
  console.error('Usage: node scripts/backfill-index-events.mjs --input backfill.json [--output out.json] [--network chipnet]');
  process.exit(1);
}

const LISTING_INDEX_PKH =
  process.env.NEXT_PUBLIC_LISTING_INDEX_PKH ||
  '2222222222222222222222222222222222222222';
const LISTING_INDEX_ADDRESS =
  process.env.NEXT_PUBLIC_LISTING_INDEX_ADDRESS || '';

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function writeUint16BE(value) {
  const out = new Uint8Array(2);
  out[0] = (value >>> 8) & 0xff;
  out[1] = value & 0xff;
  return out;
}

function writeUint32BE(value) {
  const out = new Uint8Array(4);
  out[0] = (value >>> 24) & 0xff;
  out[1] = (value >>> 16) & 0xff;
  out[2] = (value >>> 8) & 0xff;
  out[3] = value & 0xff;
  return out;
}

function writeUint64BE(value) {
  const out = new Uint8Array(8);
  let v = BigInt(value);
  for (let i = 7; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function buildListingEventHex(params) {
  const PREFIX = new Uint8Array([0x42, 0x5a, 0x41, 0x52]); // "BZAR"
  const VERSION = 1;
  const TYPE_FIXED = 0;
  const TYPE_AUCTION = 1;
  const payload = new Uint8Array(104);
  payload.set(PREFIX, 0);
  payload[4] = VERSION;
  payload[5] = params.listingType === 'fixed' ? TYPE_FIXED : TYPE_AUCTION;
  payload.set(writeUint16BE(params.royaltyBasisPoints), 6);
  payload.set(writeUint64BE(BigInt(params.price || 0)), 8);
  payload.set(writeUint64BE(BigInt(params.minBid || 0)), 16);
  payload.set(writeUint32BE(params.endTime || 0), 24);
  payload.set(writeUint32BE(Number(params.minBidIncrement || 0)), 28);
  payload.set(hexToBytes(params.sellerPkh), 32);
  payload.set(hexToBytes(params.creatorPkh), 52);
  payload.set(hexToBytes(params.tokenCategory), 72);
  return bytesToHex(payload);
}

function getIndexAddress() {
  if (LISTING_INDEX_ADDRESS) return LISTING_INDEX_ADDRESS;
  const prefix = network === 'mainnet' ? 'bitcoincash' : 'bchtest';
  const lockingBytecode = addressContentsToLockingBytecode({
    payload: hexToBytes(LISTING_INDEX_PKH),
    type: LockingBytecodeType.p2pkh,
  });
  const result = lockingBytecodeToCashAddress({
    bytecode: lockingBytecode,
    prefix,
    tokenSupport: false,
  });
  if (typeof result === 'string') return '';
  return result.address;
}

const provider = new ElectrumNetworkProvider(network);
const inputJson = JSON.parse(await fs.readFile(path.resolve(__dirname, inputPath), 'utf8'));
const rows = Array.isArray(inputJson) ? inputJson : inputJson.listings || [];
const indexAddress = getIndexAddress();

if (!indexAddress) {
  console.error('Listing index address missing. Set NEXT_PUBLIC_LISTING_INDEX_ADDRESS or NEXT_PUBLIC_LISTING_INDEX_PKH.');
  process.exit(1);
}

const results = [];

for (const row of rows) {
  const txid = row.txid;
  if (!txid) continue;
  const rawTx = await provider.getRawTransaction(txid);
  const decoded = decodeTransaction(hexToBin(rawTx));
  if (typeof decoded === 'string') {
    console.warn(`Failed to decode tx: ${txid}`);
    continue;
  }

  let tokenCategory = '';
  let commitment = '';
  for (const output of decoded.outputs) {
    if (!output.token?.nft) continue;
    tokenCategory = binToHex(output.token.category);
    commitment = binToHex(output.token.nft.commitment);
    break;
  }

  if (!tokenCategory) {
    console.warn(`No NFT output found in tx: ${txid}`);
    continue;
  }

  const eventHex = buildListingEventHex({
    listingType: row.listingType,
    sellerPkh: row.sellerPkh,
    creatorPkh: row.creatorPkh,
    royaltyBasisPoints: row.royaltyBasisPoints || 0,
    price: row.price || 0,
    minBid: row.minBid || 0,
    endTime: row.endTime || 0,
    minBidIncrement: row.minBidIncrement || 0,
    tokenCategory,
  });

  results.push({
    txid,
    listingType: row.listingType,
    tokenCategory,
    commitment,
    eventHex,
    indexAddress,
  });
}

const output = { indexAddress, network, events: results };

if (outputPath) {
  await fs.writeFile(path.resolve(__dirname, outputPath), JSON.stringify(output, null, 2));
  console.log(`Wrote ${results.length} events to ${outputPath}`);
} else {
  console.log(JSON.stringify(output, null, 2));
}
