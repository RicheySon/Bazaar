# Example: Transaction Signing with WalletConnect

This example shows how to sign and broadcast BCH transactions using `@bch-wc2/web3modal-connector`.

## Basic Transaction Signing

```tsx
'use client';

import { useWeb3ModalConnectorContext } from '@bch-wc2/web3modal-connector';
import { useState } from 'react';

export function MintNFTButton() {
  const { signTransaction, address, isConnected } = useWeb3ModalConnectorContext();
  const [loading, setLoading] = useState(false);
  const [txid, setTxid] = useState<string | null>(null);

  const handleMint = async () => {
    if (!isConnected || !address) {
      alert('Please connect your wallet first');
      return;
    }

    try {
      setLoading(true);

      // 1. Build your unsigned transaction
      const unsignedTx = await buildMintTransaction(address);
      
      // 2. Get UTXOs for the transaction
      const utxos = await fetchUTXOs(address);

      // 3. Sign with WalletConnect
      const response = await signTransaction({
        transaction: unsignedTx,
        sourceOutputs: utxos,
        userPrompt: 'Mint CashToken NFT',
        broadcast: false // We'll broadcast manually
      });

      // 4. Broadcast the signed transaction
      const txid = await broadcastTransaction(response.signedTransaction);
      
      setTxid(txid);
      alert(`NFT minted! TX: ${txid}`);
    } catch (error) {
      console.error('Minting failed:', error);
      alert('Failed to mint NFT');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleMint}
        disabled={!isConnected || loading}
        className="px-6 py-3 bg-green-600 text-white rounded-lg disabled:opacity-50"
      >
        {loading ? 'Minting...' : 'Mint NFT'}
      </button>
      
      {txid && (
        <a
          href={`https://chipnet.chaingraph.cash/tx/${txid}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline"
        >
          View Transaction
        </a>
      )}
    </div>
  );
}
```

## Helper Functions

### Building Transaction

```tsx
import { buildTransaction } from '@bitauth/libauth';

async function buildMintTransaction(address: string): Promise<Transaction> {
  // Use libauth or cashscript to build your transaction
  // This is just a simplified example
  
  const tx = {
    version: 2,
    inputs: [/* your inputs */],
    outputs: [/* your outputs */],
    locktime: 0,
  };

  return tx;
}
```

### Fetching UTXOs

```tsx
interface UTXO {
  txid: string;
  vout: number;
  satoshis: number;
  scriptPubKey: string;
}

async function fetchUTXOs(address: string): Promise<UTXO[]> {
  const response = await fetch(`https://chipnet.chaingraph.cash/v1/address/${address}/utxo`);
  const data = await response.json();
  
  return data.map((utxo: any) => ({
    txid: utxo.tx_hash,
    vout: utxo.tx_pos,
    satoshis: utxo.value,
    scriptPubKey: utxo.script_pubkey,
  }));
}
```

### Broadcasting Transaction

```tsx
async function broadcastTransaction(txHex: string): Promise<string> {
  const response = await fetch('https://chipnet.chaingraph.cash/v1/tx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tx: txHex }),
  });

  const data = await response.json();
  return data.txid;
}
```

## Network Detection

```tsx
const { address } = useWeb3ModalConnectorContext();

// Detect network from address prefix
const network = address?.startsWith('bchtest:') ? 'chipnet' : 'mainnet';

const explorerUrl = network === 'chipnet'
  ? 'https://chipnet.chaingraph.cash'
  : 'https://blockchair.com/bitcoin-cash';

const broadcastEndpoint = network === 'chipnet'
  ? 'https://chipnet.chaingraph.cash/v1/tx'
  : 'https://rest.bitcoin.com/v2/rawtransactions/sendRawTransaction';
```

## Error Handling

```tsx
try {
  const response = await signTransaction({
    transaction: tx,
    sourceOutputs: utxos,
  });
} catch (error) {
  if (error.message.includes('User rejected')) {
    alert('Transaction was rejected');
  } else if (error.message.includes('Insufficient funds')) {
    alert('Not enough BCH in wallet');
  } else {
    console.error('Unknown error:', error);
    alert('Transaction failed');
  }
}
```

## Complete Flow Diagram

```
User Action
    ↓
Build Transaction (libauth/cashscript)
    ↓
Fetch UTXOs from blockchain
    ↓
Call signTransaction() → Opens Selene Wallet
    ↓
User Reviews & Signs in Wallet
    ↓
Receive signed transaction hex
    ↓
Broadcast to BCH network
    ↓
Display Transaction ID
```
