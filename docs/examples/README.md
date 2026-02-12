# WalletConnect Examples

This folder contains working code examples for integrating `@bch-wc2/web3modal-connector` with Bitcoin Cash applications.

## Files

- **`WalletProvider.tsx`** - Provider component that wraps your app and enables WalletConnect context
- **`ConnectWalletButton.tsx`** - Ready-to-use connect/disconnect button with loading states
- **`useWalletSync.ts`** - Hook to sync WalletConnect state with Zustand/Redux
- **`TRANSACTION_SIGNING.md`** - Complete guide for signing and broadcasting transactions

## Quick Start

### 1. Install Package

```bash
npm install @bch-wc2/web3modal-connector
```

### 2. Add Environment Variable

Create `.env.local`:

```env
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
```

Get your Project ID at: https://cloud.walletconnect.com

### 3. Wrap Your App

In `app/layout.tsx`:

```tsx
import { WalletProvider } from './WalletProvider';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
```

### 4. Add Connect Button

```tsx
import { ConnectWalletButton } from './ConnectWalletButton';

export default function Page() {
  return (
    <div>
      <ConnectWalletButton />
    </div>
  );
}
```

## Usage

### Get Wallet Address

```tsx
import { useWeb3ModalConnectorContext } from '@bch-wc2/web3modal-connector';

function MyComponent() {
  const { address, isConnected } = useWeb3ModalConnectorContext();

  if (!isConnected) {
    return <p>Please connect your wallet</p>;
  }

  return <p>Connected: {address}</p>;
}
```

### Sign Transaction

```tsx
const { signTransaction } = useWeb3ModalConnectorContext();

const response = await signTransaction({
  transaction: unsignedTx,
  sourceOutputs: utxos,
  userPrompt: 'Sign this transaction',
});

console.log('Signed TX:', response.signedTransaction);
```

### Detect Network

```tsx
const { address } = useWeb3ModalConnectorContext();
const isChipnet = address?.startsWith('bchtest:');

console.log(`Network: ${isChipnet ? 'Chipnet' : 'Mainnet'}`);
```

## Testing

1. Install **Selene Wallet** from [selene.cash](https://selene.cash)
2. Switch to **Chipnet** in Settings → Network
3. Get test BCH from [tbch.googol.cash](https://tbch.googol.cash/)
4. Connect to your app and test!

## Need Help?

See the main integration guide: [`../WALLETCONNECT_INTEGRATION.md`](../WALLETCONNECT_INTEGRATION.md)
