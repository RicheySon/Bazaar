import { bytesToHex, hexToBytes } from '@/lib/utils';

export type ListingEventType = 'fixed' | 'auction';
export type ListingStatusEvent = 'sold' | 'cancelled' | 'claimed';

export interface ListingEventPayload {
  listingType: ListingEventType;
  sellerPkh: string;
  creatorPkh: string;
  royaltyBasisPoints: number;
  price: bigint;
  minBid: bigint;
  endTime: number;
  minBidIncrement: bigint;
  tokenCategory: string;
  trackingCategory?: string;
}

const PREFIX = new Uint8Array([0x42, 0x5a, 0x41, 0x52]); // "BZAR"
const BID_PREFIX = new Uint8Array([0x42, 0x5a, 0x42, 0x44]); // "BZBD"
const STATUS_PREFIX = new Uint8Array([0x42, 0x5a, 0x53, 0x54]); // "BZST"
const COLLECTION_BID_PREFIX = new Uint8Array([0x42, 0x5a, 0x43, 0x42]); // "BZCB"
const COLLECTION_BID_STATUS_PREFIX = new Uint8Array([0x42, 0x5a, 0x43, 0x53]); // "BZCS"
const VERSION = 2;
const TYPE_FIXED = 0;
const TYPE_AUCTION = 1;
const PAYLOAD_LENGTH_V1 = 104;
const PAYLOAD_LENGTH_V2 = 136;
const BID_PAYLOAD_LENGTH = 65;
const STATUS_PAYLOAD_LENGTH = 58;
const COLLECTION_BID_PAYLOAD_LENGTH = 119;
const COLLECTION_BID_STATUS_PAYLOAD_LENGTH = 58;

const STATUS_CODES: Record<ListingStatusEvent, number> = {
  sold: 1,
  cancelled: 2,
  claimed: 3,
};

const STATUS_BY_CODE: Record<number, ListingStatusEvent> = {
  1: 'sold',
  2: 'cancelled',
  3: 'claimed',
};

const COLLECTION_BID_STATUS_CODES: Record<'filled' | 'cancelled', number> = {
  filled: 1,
  cancelled: 2,
};

const COLLECTION_BID_STATUS_BY_CODE: Record<number, 'filled' | 'cancelled'> = {
  1: 'filled',
  2: 'cancelled',
};

function writeUint16BE(value: number): Uint8Array {
  const out = new Uint8Array(2);
  out[0] = (value >>> 8) & 0xff;
  out[1] = value & 0xff;
  return out;
}

function writeUint32BE(value: number): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = (value >>> 24) & 0xff;
  out[1] = (value >>> 16) & 0xff;
  out[2] = (value >>> 8) & 0xff;
  out[3] = value & 0xff;
  return out;
}

function writeUint64BE(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  let v = value;
  for (let i = 7; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function readUint64BE(bytes: Uint8Array, offset: number): bigint {
  let result = 0n;
  for (let i = 0; i < 8; i++) {
    result = (result << 8n) | BigInt(bytes[offset + i]);
  }
  return result;
}

export function buildListingEventPayload(params: ListingEventPayload): Uint8Array {
  const trackingCategory = params.trackingCategory || params.tokenCategory;
  const payload = new Uint8Array(PAYLOAD_LENGTH_V2);
  payload.set(PREFIX, 0);
  payload[4] = VERSION;
  payload[5] = params.listingType === 'fixed' ? TYPE_FIXED : TYPE_AUCTION;

  payload.set(writeUint16BE(params.royaltyBasisPoints), 6);
  payload.set(writeUint64BE(params.price), 8);
  payload.set(writeUint64BE(params.minBid), 16);
  payload.set(writeUint32BE(params.endTime), 24);
  payload.set(writeUint32BE(Number(params.minBidIncrement)), 28);

  payload.set(hexToBytes(params.sellerPkh), 32);
  payload.set(hexToBytes(params.creatorPkh), 52);
  payload.set(hexToBytes(params.tokenCategory), 72);
  payload.set(hexToBytes(trackingCategory), 104);
  return payload;
}

export function buildListingEventHex(params: ListingEventPayload): string {
  return bytesToHex(buildListingEventPayload(params));
}

export function parseListingEventPayload(payload: Uint8Array): ListingEventPayload | null {
  if (payload.length < PAYLOAD_LENGTH_V1) return null;
  for (let i = 0; i < PREFIX.length; i++) {
    if (payload[i] !== PREFIX[i]) return null;
  }
  const version = payload[4];
  if (version !== 1 && version !== 2) return null;
  const listingType = payload[5] === TYPE_FIXED ? 'fixed' : 'auction';

  const royaltyBasisPoints = readUint16BE(payload, 6);
  const price = readUint64BE(payload, 8);
  const minBid = readUint64BE(payload, 16);
  const endTime = readUint32BE(payload, 24);
  const minBidIncrement = readUint32BE(payload, 28);

  const sellerPkh = bytesToHex(payload.slice(32, 52));
  const creatorPkh = bytesToHex(payload.slice(52, 72));
  const tokenCategory = bytesToHex(payload.slice(72, 104));
  const trackingCategory =
    version >= 2 && payload.length >= PAYLOAD_LENGTH_V2
      ? bytesToHex(payload.slice(104, 136))
      : undefined;

  return {
    listingType,
    sellerPkh,
    creatorPkh,
    royaltyBasisPoints,
    price,
    minBid,
    endTime,
    minBidIncrement: BigInt(minBidIncrement),
    tokenCategory,
    trackingCategory,
  };
}

export function buildBidEventHex(params: {
  listingTxid: string;
  bidderPkh: string;
  bidAmount: bigint;
}): string {
  const payload = new Uint8Array(BID_PAYLOAD_LENGTH);
  payload.set(BID_PREFIX, 0);
  payload[4] = VERSION;
  payload.set(hexToBytes(params.listingTxid), 5);
  payload.set(hexToBytes(params.bidderPkh), 37);
  payload.set(writeUint64BE(params.bidAmount), 57);
  return bytesToHex(payload);
}

export function parseBidEventPayload(payload: Uint8Array): {
  listingTxid: string;
  bidderPkh: string;
  bidAmount: bigint;
} | null {
  if (payload.length < BID_PAYLOAD_LENGTH) return null;
  for (let i = 0; i < BID_PREFIX.length; i++) {
    if (payload[i] !== BID_PREFIX[i]) return null;
  }
  if (payload[4] !== VERSION) return null;
  const listingTxid = bytesToHex(payload.slice(5, 37));
  const bidderPkh = bytesToHex(payload.slice(37, 57));
  const bidAmount = readUint64BE(payload, 57);
  return { listingTxid, bidderPkh, bidAmount };
}

export function buildCollectionBidEventHex(params: {
  tokenCategory: string;
  bidderPkh: string;
  creatorPkh: string;
  bidSalt: string;
  royaltyBasisPoints: number;
  price: bigint;
}): string {
  const payload = new Uint8Array(COLLECTION_BID_PAYLOAD_LENGTH);
  payload.set(COLLECTION_BID_PREFIX, 0);
  payload[4] = VERSION;
  payload.set(writeUint16BE(params.royaltyBasisPoints), 5);
  payload.set(writeUint64BE(params.price), 7);
  payload.set(hexToBytes(params.bidderPkh), 15);
  payload.set(hexToBytes(params.creatorPkh), 35);
  payload.set(hexToBytes(params.tokenCategory), 55);
  payload.set(hexToBytes(params.bidSalt), 87);
  return bytesToHex(payload);
}

export function parseCollectionBidEventPayload(payload: Uint8Array): {
  tokenCategory: string;
  bidderPkh: string;
  creatorPkh: string;
  bidSalt: string;
  royaltyBasisPoints: number;
  price: bigint;
} | null {
  if (payload.length < COLLECTION_BID_PAYLOAD_LENGTH) return null;
  for (let i = 0; i < COLLECTION_BID_PREFIX.length; i++) {
    if (payload[i] !== COLLECTION_BID_PREFIX[i]) return null;
  }
  if (payload[4] !== VERSION) return null;
  const royaltyBasisPoints = readUint16BE(payload, 5);
  const price = readUint64BE(payload, 7);
  const bidderPkh = bytesToHex(payload.slice(15, 35));
  const creatorPkh = bytesToHex(payload.slice(35, 55));
  const tokenCategory = bytesToHex(payload.slice(55, 87));
  const bidSalt = bytesToHex(payload.slice(87, 119));
  return { tokenCategory, bidderPkh, creatorPkh, bidSalt, royaltyBasisPoints, price };
}

export function buildCollectionBidStatusEventHex(params: {
  bidTxid: string;
  status: 'filled' | 'cancelled';
  actorPkh: string;
}): string {
  const payload = new Uint8Array(COLLECTION_BID_STATUS_PAYLOAD_LENGTH);
  payload.set(COLLECTION_BID_STATUS_PREFIX, 0);
  payload[4] = VERSION;
  payload[5] = COLLECTION_BID_STATUS_CODES[params.status] || COLLECTION_BID_STATUS_CODES.filled;
  payload.set(hexToBytes(params.bidTxid), 6);
  payload.set(hexToBytes(params.actorPkh), 38);
  return bytesToHex(payload);
}

export function parseCollectionBidStatusEventPayload(payload: Uint8Array): {
  bidTxid: string;
  status: 'filled' | 'cancelled';
  actorPkh: string;
} | null {
  if (payload.length < COLLECTION_BID_STATUS_PAYLOAD_LENGTH) return null;
  for (let i = 0; i < COLLECTION_BID_STATUS_PREFIX.length; i++) {
    if (payload[i] !== COLLECTION_BID_STATUS_PREFIX[i]) return null;
  }
  if (payload[4] !== VERSION) return null;
  const statusCode = payload[5];
  const status = COLLECTION_BID_STATUS_BY_CODE[statusCode];
  if (!status) return null;
  const bidTxid = bytesToHex(payload.slice(6, 38));
  const actorPkh = bytesToHex(payload.slice(38, 58));
  return { bidTxid, status, actorPkh };
}

export function buildStatusEventHex(params: {
  listingTxid: string;
  status: ListingStatusEvent;
  actorPkh: string;
}): string {
  const payload = new Uint8Array(STATUS_PAYLOAD_LENGTH);
  payload.set(STATUS_PREFIX, 0);
  payload[4] = VERSION;
  payload[5] = STATUS_CODES[params.status] || STATUS_CODES.sold;
  payload.set(hexToBytes(params.listingTxid), 6);
  payload.set(hexToBytes(params.actorPkh), 38);
  return bytesToHex(payload);
}

export function parseStatusEventPayload(payload: Uint8Array): {
  listingTxid: string;
  status: ListingStatusEvent;
  actorPkh: string;
} | null {
  if (payload.length < STATUS_PAYLOAD_LENGTH) return null;
  for (let i = 0; i < STATUS_PREFIX.length; i++) {
    if (payload[i] !== STATUS_PREFIX[i]) return null;
  }
  if (payload[4] !== VERSION) return null;
  const statusCode = payload[5];
  const status = STATUS_BY_CODE[statusCode];
  if (!status) return null;
  const listingTxid = bytesToHex(payload.slice(6, 38));
  const actorPkh = bytesToHex(payload.slice(38, 58));
  return { listingTxid, status, actorPkh };
}
