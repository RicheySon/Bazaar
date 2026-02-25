#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ElectrumNetworkProvider,
  SignatureTemplate,
  TransactionBuilder,
} = require('cashscript');
const {
  ElectrumCluster,
  ElectrumTransport,
  ClusterOrder,
  DefaultParameters,
} = require('electrum-cash');
const {
  decodeTransaction,
  hexToBin,
  binToHex,
  addressContentsToLockingBytecode,
  lockingBytecodeToCashAddress,
  LockingBytecodeType,
} = require('@bitauth/libauth');
const { bytecodeToScript, Op, encodeNullDataScript } = require('@cashscript/utils');

const PREFIX = [0x42, 0x5a, 0x41, 0x52]; // "BZAR"
const PAYLOAD_LENGTHS = new Set([104, 136]);

function usage() {
  console.log([
    'Usage:',
    '  node scripts/backfill-index.js --txids <comma-separated>',
    '  node scripts/backfill-index.js --file <path-to-txids.txt>',
    '',
    'Optional:',
    '  --broadcast    Actually broadcast replay transactions (requires BACKFILL_PRIVATE_KEY_HEX + BACKFILL_ADDRESS).',
    '',
    'Env:',
    '  NEXT_PUBLIC_NETWORK=chipnet|mainnet',
    '  NEXT_PUBLIC_ELECTRUM_SERVERS=host:port:scheme or wss://host:port',
    '  NEXT_PUBLIC_LISTING_INDEX_ADDRESS or NEXT_PUBLIC_LISTING_INDEX_PKH',
    '  BACKFILL_PRIVATE_KEY_HEX=<hex> (required for --broadcast)',
    '  BACKFILL_ADDRESS=<cashaddr> (required for --broadcast)',
  ].join('\n'));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const txids = [];
  let broadcast = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--broadcast') {
      broadcast = true;
      continue;
    }
    if (arg === '--txids' && args[i + 1]) {
      txids.push(...args[i + 1].split(',').map((t) => t.trim()).filter(Boolean));
      i++;
      continue;
    }
    if (arg.startsWith('--txids=')) {
      txids.push(...arg.slice('--txids='.length).split(',').map((t) => t.trim()).filter(Boolean));
      continue;
    }
    if (arg === '--file' && args[i + 1]) {
      const filePath = args[i + 1];
      const content = fs.readFileSync(filePath, 'utf8');
      txids.push(...content.split(/\r?\n/).map((t) => t.trim()).filter((t) => t && !t.startsWith('#')));
      i++;
      continue;
    }
    if (arg.startsWith('--file=')) {
      const filePath = arg.slice('--file='.length);
      const content = fs.readFileSync(filePath, 'utf8');
      txids.push(...content.split(/\r?\n/).map((t) => t.trim()).filter((t) => t && !t.startsWith('#')));
      continue;
    }
    if (!arg.startsWith('--')) {
      txids.push(arg);
    }
  }

  return { txids, broadcast };
}

function parseServerList() {
  const raw = process.env.NEXT_PUBLIC_ELECTRUM_SERVERS || process.env.ELECTRUM_SERVERS || '';
  if (!raw) return [];

  const entries = raw.split(',').map((e) => e.trim()).filter(Boolean);
  const servers = [];

  for (const entry of entries) {
    if (entry.includes('://')) {
      try {
        const url = new URL(entry);
        const scheme = url.protocol.replace(':', '') || ElectrumTransport.WSS.Scheme;
        const host = url.hostname;
        const port = url.port ? parseInt(url.port, 10) : ElectrumTransport.WSS.Port;
        if (host) servers.push({ host, port, scheme });
      } catch {
        // ignore bad url
      }
      continue;
    }

    const parts = entry.split(':').map((p) => p.trim()).filter(Boolean);
    const [host, portRaw, schemeRaw] = parts;
    if (!host) continue;
    const scheme = schemeRaw || ElectrumTransport.WSS.Scheme;
    const port = portRaw ? parseInt(portRaw, 10) : ElectrumTransport.WSS.Port;
    if (!Number.isNaN(port)) servers.push({ host, port, scheme });
  }

  return servers;
}

function getProvider() {
  const network = process.env.NEXT_PUBLIC_NETWORK || 'chipnet';
  const servers = parseServerList();

  if (!servers.length) {
    return new ElectrumNetworkProvider(network);
  }

  const timeout = Math.max(1000, parseInt(process.env.NEXT_PUBLIC_ELECTRUM_TIMEOUT_MS || `${DefaultParameters.TIMEOUT}`, 10));
  const ping = Math.max(1000, parseInt(process.env.NEXT_PUBLIC_ELECTRUM_PING_MS || `${DefaultParameters.PING_INTERVAL}`, 10));
  const cluster = new ElectrumCluster(
    'BazaarBackfill',
    '1.4.1',
    1,
    1,
    ClusterOrder.PRIORITY,
    timeout,
    ping
  );

  for (const server of servers) {
    void cluster.addServer(server.host, server.port, server.scheme).catch(() => {});
  }

  const provider = new ElectrumNetworkProvider(network, cluster, true);
  void provider.connectCluster();
  return provider;
}

function getIndexAddress() {
  if (process.env.NEXT_PUBLIC_LISTING_INDEX_ADDRESS) {
    return process.env.NEXT_PUBLIC_LISTING_INDEX_ADDRESS;
  }
  const pkh = process.env.NEXT_PUBLIC_LISTING_INDEX_PKH || '2222222222222222222222222222222222222222';
  const payload = hexToBin(pkh);
  const lockingBytecode = addressContentsToLockingBytecode({
    payload,
    type: LockingBytecodeType.p2pkh,
  });
  const prefix = (process.env.NEXT_PUBLIC_NETWORK === 'mainnet') ? 'bitcoincash' : 'bchtest';
  const result = lockingBytecodeToCashAddress({
    bytecode: lockingBytecode,
    prefix,
    tokenSupport: false,
  });
  return typeof result === 'string' ? '' : result.address;
}

function findListingPayload(decodedTx) {
  for (const output of decodedTx.outputs || []) {
    const script = bytecodeToScript(output.lockingBytecode);
    if (!script.length || script[0] !== Op.OP_RETURN) continue;
    for (const chunk of script.slice(1)) {
      if (!(chunk instanceof Uint8Array)) continue;
      if (!PAYLOAD_LENGTHS.has(chunk.length)) continue;
      let matches = true;
      for (let i = 0; i < PREFIX.length; i++) {
        if (chunk[i] !== PREFIX[i]) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;
      const version = chunk[4];
      if (version !== 1 && version !== 2) continue;
      return chunk;
    }
  }
  return null;
}

function selectUtxos(utxos, target) {
  const sorted = [...utxos].filter((u) => !u.token).sort((a, b) => Number(b.satoshis - a.satoshis));
  const selected = [];
  let total = 0n;
  for (const u of sorted) {
    selected.push(u);
    total += u.satoshis;
    if (total >= target) break;
  }
  return { selected, total };
}

async function main() {
  const { txids, broadcast } = parseArgs();
  if (!txids.length) {
    usage();
    process.exit(1);
  }

  const indexAddress = getIndexAddress();
  if (!indexAddress) {
    console.error('Missing listing index address. Set NEXT_PUBLIC_LISTING_INDEX_ADDRESS or NEXT_PUBLIC_LISTING_INDEX_PKH.');
    process.exit(1);
  }

  const provider = getProvider();
  const results = [];

  for (const txid of txids) {
    try {
      const rawTx = await provider.getRawTransaction(txid);
      const decoded = decodeTransaction(hexToBin(rawTx));
      if (typeof decoded === 'string') {
        console.warn(`Skipping ${txid}: ${decoded}`);
        continue;
      }
      const payload = findListingPayload(decoded);
      if (!payload) {
        console.warn(`Skipping ${txid}: no listing payload found`);
        continue;
      }
      results.push({ txid, payload });
    } catch (err) {
      console.warn(`Failed to fetch ${txid}: ${err && err.message ? err.message : err}`);
    }
  }

  if (!results.length) {
    console.log('No listing payloads found.');
    return;
  }

  if (!broadcast) {
    console.log('Found listing payloads (dry run). Use --broadcast to replay on-chain.');
    results.forEach(({ txid, payload }) => {
      console.log(`${txid} -> ${binToHex(payload)}`);
    });
    return;
  }

  const privateKeyHex = process.env.BACKFILL_PRIVATE_KEY_HEX;
  const fundingAddress = process.env.BACKFILL_ADDRESS;
  if (!privateKeyHex || !fundingAddress) {
    console.error('Missing BACKFILL_PRIVATE_KEY_HEX or BACKFILL_ADDRESS for --broadcast.');
    process.exit(1);
  }

  const privateKey = hexToBin(privateKeyHex);
  const template = new SignatureTemplate(privateKey);

  for (const { txid, payload } of results) {
    const utxos = await provider.getUtxos(fundingAddress);
    const { selected, total } = selectUtxos(utxos, 2000n);
    if (!selected.length) {
      console.error('No BCH UTXOs available for backfill funding.');
      process.exit(1);
    }

    const feeEstimate = BigInt(Math.max(500, selected.length * 148 + 200));
    const totalNeeded = 546n + feeEstimate;
    if (total < totalNeeded) {
      console.error(`Insufficient funds to replay ${txid}. Need ${totalNeeded} sats, have ${total}.`);
      continue;
    }

    const builder = new TransactionBuilder({ provider });
    builder.addInputs(selected, template.unlockP2PKH());
    builder.addOutput({ to: indexAddress, amount: 546n });
    builder.addOutput({ to: encodeNullDataScript([Op.OP_RETURN, payload]), amount: 0n });

    const change = total - 546n - feeEstimate;
    if (change > 546n) {
      builder.addOutput({ to: fundingAddress, amount: change });
    }
    builder.setLocktime(0);
    const rawHex = builder.build();

    const replayTxid = await provider.sendRawTransaction(rawHex);
    console.log(`Replayed ${txid} -> ${replayTxid}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
