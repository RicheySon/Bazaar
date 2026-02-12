# Bitcoin Cash WalletConnect Integration Guide
## Using @bch-wc2/web3modal-connector for Selene Wallet

> **Complete implementation guide for integrating WalletConnect v2 with Bitcoin Cash applications using the official @bch-wc2/web3modal-connector library.**

---

## Table of Contents
1. [Overview](#overview)
2. [Installation](#installation)
3. [Project Setup](#project-setup)
4. [Implementation](#implementation)
5. [Testing Guide](#testing-guide)
6. [Troubleshooting](#troubleshooting)

---

## Overview

This guide shows you how to integrate Selene Wallet (and other BCH wallets) using WalletConnect v2. The `@bch-wc2/web3modal-connector` library provides:

- ✅ Built-in QR modal for wallet connection
- ✅ Automatic session management
- ✅ Mainnet and Chipnet support (auto-detected from wallet)
- ✅ Transaction signing interface
- ✅ Message signing support

---

## Installation

```bash
npm install @bch-wc2/web3modal-connector
```

**Get a WalletConnect Project ID:**
1. Visit [cloud.walletconnect.com](https://cloud.walletconnect.com)
2. Create a new project
3. Copy your Project ID
4. Add to `.env.local`:

```env
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

---

## Project Setup

### 1. Create WalletProvider Component

Create `src/components/wallet/WalletProvider.tsx`:

```tsx
'use client';

import { Web3ModalConnectorContextProvider } from '@bch-wc2/web3modal-connector';
import { useEffect, useRef, useState } from 'react';

// Clear WalletConnect cached session data to prevent auto-popup
function clearWalletConnectCache() {
  if (typeof window === 'undefined') return;

  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (
      key.startsWith('wc@') ||
      key.startsWith('W3M') ||
      key.startsWith('wagmi') ||
      key.includes('walletconnect')
    )) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const clearedRef = useRef(false);

  useEffect(() => {
    // Clear cache only once on the client
    if (!clearedRef.current) {
      clearWalletConnectCache();
      clearedRef.current = true;
    }
    setMounted(true);
  }, []);

  // Prevent hydration issues
  if (!mounted) {
    return <div className="min-h-screen" aria-hidden="true">{children}</div>;
  }

  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

  return (
    <Web3ModalConnectorContextProvider
      config={{
        projectId,
        metadata: {
          name: 'Your App Name',
          description: 'Your App Description',
          url: typeof window !== 'undefined' ? window.location.origin : '',
          icons: ['https://your-app.com/icon.png']
        }
      }}
    >
      {children}
    </Web3ModalConnectorContextProvider>
  );
}
```

### 2. Wrap Your App

In `src/app/layout.tsx`:

```tsx
import { WalletProvider } from '@/components/wallet/WalletProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
```

---

## Implementation

### Connect Button

Create a simple connect button:

```tsx
'use client';

import { useWeb3ModalConnectorContext } from '@bch-wc2/web3modal-connector';

export function ConnectButton() {
  const { address, connect, disconnect, isConnected } = useWeb3ModalConnectorContext();

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm">
          {address.slice(0, 10)}...{address.slice(-8)}
        </span>
        <button onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button onClick={() => connect()}>
      Connect Selene Wallet
    </button>
  );
}
```

### Sync with State Management (Optional)

If using Zustand or Redux, create a sync hook:

```tsx
'use client';

import { useEffect } from 'react';
import { useWeb3ModalConnectorContext } from '@bch-wc2/web3modal-connector';
import { useWalletStore } from '@/lib/store/wallet-store';

export function useWalletSync() {
  const { address, isConnected } = useWeb3ModalConnectorContext();
  const { setWallet, wallet } = useWalletStore();

  useEffect(() => {
    if (isConnected && address) {
      setWallet({
        address,
        isConnected: true,
      });
    } else if (!isConnected && wallet?.isConnected) {
      setWallet(null);
    }
  }, [address, isConnected, setWallet, wallet]);
}
```

Use the hook in your root component:

```tsx
export function App() {
  useWalletSync(); // Syncs WalletConnect context to your store
  
  return <YourApp />;
}
```

---

## Network Detection (Mainnet vs Chipnet)

The wallet's network setting determines the address prefix:

```tsx
const { address } = useWeb3ModalConnectorContext();

// Detect network from address
const network = address?.startsWith('bchtest:') ? 'chipnet' : 'mainnet';
const blockExplorer = network === 'chipnet' 
  ? 'https://chipnet.chaingraph.cash' 
  : 'https://blockchair.com/bitcoin-cash';
```

**To test on Chipnet:**
1. Open Selene Wallet
2. Go to **Settings** → **Network**
3. Switch to **Chipnet**
4. Connect to your app
5. Address will be `bchtest:...` instead of `bitcoincash:...`

---

## Transaction Signing

### Interface

```typescript
interface WcSignTransactionRequest {
  transaction: Transaction | string;  // libauth Transaction or hex string
  sourceOutputs: WcSourceOutput[];    // UTXOs being spent
  broadcast?: boolean;                // Auto-broadcast after signing
  userPrompt?: string;                // Custom message shown in wallet
}

interface WcSignTransactionResponse {
  signedTransaction: string;          // Signed tx hex
  signedTransactionHash: string;      // Transaction hash
}
```

### Example: Signing a Transaction

```tsx
import { useWeb3ModalConnectorContext } from '@bch-wc2/web3modal-connector';

async function mintNFT() {
  const { signTransaction } = useWeb3ModalConnectorContext();
  
  // 1. Build your transaction using libauth/cashscript
  const unsignedTx = await buildTransaction();
  
  // 2. Sign with WalletConnect
  const response = await signTransaction({
    transaction: unsignedTx,
    sourceOutputs: utxos,
    userPrompt: "Mint CashToken NFT",
    broadcast: false  // We'll broadcast manually
  });
  
  // 3. Broadcast the signed transaction
  const txid = await broadcastTransaction(response.signedTransaction);
  
  console.log('Transaction ID:', txid);
}
```

---

## Testing Guide

### 1. Install Selene Wallet
- Download from [selene.cash](https://selene.cash)
- Create or import a wallet
- Switch to **Chipnet** for testing

### 2. Get Test BCH
- Visit the [Chipnet Faucet](https://tbch.googol.cash/)
- Enter your Chipnet address from Selene
- Receive free test BCH

### 3. Test Connection Flow
1. Click "Connect Wallet" in your app
2. QR code modal appears
3. Scan with Selene Wallet
4. Approve connection
5. Your address appears in the app

### 4. Test Transaction Signing
1. Trigger a transaction (e.g., mint NFT)
2. Selene prompts for approval
3. Review and sign in Selene
4. Transaction broadcasts to Chipnet
5. Verify on explorer

---

## Troubleshooting

### Modal Won't Open

**Problem:** `connect()` doesn't show QR modal

**Solution:** Clear WalletConnect cache

```tsx
// Add to your WalletProvider or run manually
Object.keys(localStorage)
  .filter(key => key.includes('walletconnect') || key.startsWith('wc@'))
  .forEach(key => localStorage.removeItem(key));

window.location.reload();
```

### Address Not Updating

**Problem:** `address` is undefined after connecting

**Solution:** Check if connection completed

```tsx
const { address, isConnected } = useWeb3ModalConnectorContext();

// Wait for both
if (isConnected && address) {
  console.log('Connected:', address);
}
```

### Transaction Signing Fails

**Problem:** `signTransaction` throws an error

**Common causes:**
- Transaction format is incorrect (use libauth `Transaction` object)
- `sourceOutputs` missing required fields
- Wallet session disconnected

**Debug:**
```tsx
try {
  const result = await signTransaction({
    transaction: tx,
    sourceOutputs: utxos,
  });
} catch (error) {
  console.error('Sign error:', error);
  // Reconnect if session expired
  await connect();
}
```

### Hydration Errors (Next.js)

**Problem:** "Hydration failed" error

**Solution:** Delay provider rendering until client-side

```tsx
const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true);
}, []);

if (!mounted) return <>{children}</>;

return <Web3ModalConnectorContextProvider>...</Web3ModalConnectorContextProvider>;
```

---

## Complete Example

See `examples/` folder for full Next.js implementation with:
- ✅ WalletProvider setup
- ✅ Connect/Disconnect button
- ✅ State synchronization
- ✅ Transaction signing
- ✅ Network detection

---

## Additional Resources

- **@bch-wc2 GitHub:** [github.com/salemkode/web3-bch](https://github.com/salemkode/web3-bch)
- **Selene Wallet:** [selene.cash](https://selene.cash)
- **Chipnet Faucet:** [tbch.googol.cash](https://tbch.googol.cash/)
- **BCH Developer Docs:** [docs.bitcoincashnode.org](https://docs.bitcoincashnode.org)

---

**Questions?** Open an issue on GitHub or ask in the BCH developer Telegram!
