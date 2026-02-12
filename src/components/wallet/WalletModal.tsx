'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, KeyRound, Copy, Check, Eye, EyeOff, ExternalLink, AlertTriangle } from 'lucide-react';
import { useWalletStore } from '@/lib/store/wallet-store';
import { generateWallet, restoreWallet, saveWallet, validateMnemonic, type WalletData } from '@/lib/bch/wallet';
import { connectWallet as connectWC } from '@/lib/bch/walletconnect';
import { CHIPNET_CONFIG } from '@/lib/bch/config';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WalletModal({ isOpen, onClose }: WalletModalProps) {
  const { setWallet, setConnectionType, setWCSession, setWCClient } = useWalletStore();
  const [mode, setMode] = useState<'choose' | 'create' | 'restore'>('choose');
  const [mnemonic, setMnemonic] = useState('');
  const [newWalletData, setNewWalletData] = useState<WalletData | null>(null);
  const [restoreInput, setRestoreInput] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showSeed, setShowSeed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleCreate = () => {
    try {
      const wallet = generateWallet();
      setNewWalletData(wallet);
      setMnemonic(wallet.mnemonic);
      setMode('create');
      setError('');
    } catch (err) {
      setError('Failed to generate wallet');
    }
  };

  const handleWalletConnect = async () => {
    try {
      setError('');
      const wcState = await connectWC();

      if (!wcState.address) {
        throw new Error('No address received from wallet');
      }

      setWallet({
        address: wcState.address,
        tokenAddress: wcState.address, // BCH wallets use same address
        balance: 0n,
        publicKey: wcState.publicKey || '',
        isConnected: true,
      });
      setConnectionType('walletconnect');
      setWCSession(wcState.session);
      setWCClient(wcState.client);

      resetAndClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect wallet');
    }
  };

  const handleConfirmCreate = () => {
    if (!newWalletData) return;
    saveWallet(newWalletData.mnemonic);
    setWallet({
      address: newWalletData.address,
      tokenAddress: newWalletData.tokenAddress,
      balance: 0n,
      publicKey: Array.from(newWalletData.publicKey).map(b => b.toString(16).padStart(2, '0')).join(''),
      isConnected: true,
    });
    resetAndClose();
  };

  const handleRestore = () => {
    try {
      const trimmed = restoreInput.trim().toLowerCase();
      if (!validateMnemonic(trimmed)) {
        setError('Invalid seed phrase. Please check and try again.');
        return;
      }
      const wallet = restoreWallet(trimmed);
      saveWallet(trimmed);
      setWallet({
        address: wallet.address,
        tokenAddress: wallet.tokenAddress,
        balance: 0n,
        publicKey: Array.from(wallet.publicKey).map(b => b.toString(16).padStart(2, '0')).join(''),
        isConnected: true,
      });
      resetAndClose();
    } catch (err) {
      setError('Failed to restore wallet. Check your seed phrase.');
    }
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(mnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetAndClose = () => {
    setMode('choose');
    setMnemonic('');
    setNewWalletData(null);
    setRestoreInput('');
    setError('');
    setCopied(false);
    setShowSeed(false);
    setConfirmed(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={resetAndClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative card w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto"
          >
            <button onClick={resetAndClose}
              className="absolute top-4 right-4 p-1 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}>
              <X className="h-5 w-5" />
            </button>

            {mode === 'choose' && (
              <>
                <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Connect Wallet</h2>
                <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>
                  Create a new wallet or restore from a seed phrase. Keys stay in your browser.
                </p>

                <div className="space-y-2">
                  <button onClick={handleCreate}
                    className="w-full flex items-center gap-3 p-4 rounded-lg border transition-all hover:border-[var(--accent)]"
                    style={{ borderColor: 'var(--border)', background: 'transparent' }}>
                    <div className="p-2.5 rounded-lg" style={{ background: 'rgba(0,229,69,0.1)' }}>
                      <Plus className="h-5 w-5" style={{ color: 'var(--accent)' }} />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Create New Wallet</div>
                      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Generate a fresh Chipnet wallet</div>
                    </div>
                  </button>

                  <button onClick={() => { setMode('restore'); setError(''); }}
                    className="w-full flex items-center gap-3 p-4 rounded-lg border transition-all hover:border-[var(--accent-purple)]"
                    style={{ borderColor: 'var(--border)', background: 'transparent' }}>
                    <div className="p-2.5 rounded-lg" style={{ background: 'rgba(139,92,246,0.1)' }}>
                      <KeyRound className="h-5 w-5" style={{ color: 'var(--accent-purple)' }} />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Restore Wallet</div>
                      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Import with 12-word seed phrase</div>
                    </div>
                  </button>

                  <button onClick={handleWalletConnect}
                    className="w-full flex items-center gap-3 p-4 rounded-lg border transition-all hover:border-[var(--accent-blue)]"
                    style={{ borderColor: 'var(--border)', background: 'transparent' }}>
                    <div className="p-2.5 rounded-lg" style={{ background: 'rgba(59,130,246,0.1)' }}>
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--accent-blue)' }}>
                        <path d="M5.463 4A3.463 3.463 0 0 0 2 7.463V16.537A3.463 3.463 0 0 0 5.463 20h13.074A3.463 3.463 0 0 0 22 16.537V7.463A3.463 3.463 0 0 0 18.537 4H5.463zM12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Connect Selene Wallet</div>
                      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Use your existing BCH wallet</div>
                    </div>
                  </button>
                </div>

                <div className="mt-5 p-3 rounded-lg" style={{ background: 'rgba(0,229,69,0.05)', border: '1px solid rgba(0,229,69,0.1)' }}>
                  <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    <span className="font-medium" style={{ color: 'var(--accent)' }}>Chipnet Only</span> &mdash; Testnet wallet. No real funds.
                    Get free tBCH from the{' '}
                    <a href={CHIPNET_CONFIG.faucetUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5" style={{ color: 'var(--accent)' }}>
                      faucet <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </p>
                </div>
              </>
            )}

            {mode === 'create' && newWalletData && (
              <>
                <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Save Your Seed Phrase</h2>
                <div className="flex items-start gap-2 p-3 rounded-lg mb-4"
                  style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}>
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--accent-orange)' }} />
                  <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Write this down and store it safely. It&apos;s the only way to recover your wallet.
                  </p>
                </div>

                <div className="relative p-4 rounded-lg mb-4" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <div className={`grid grid-cols-3 gap-2 ${showSeed ? '' : 'blur-md select-none'}`}>
                    {mnemonic.split(' ').map((word, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs">
                        <span className="w-4" style={{ color: 'var(--text-muted)' }}>{i + 1}.</span>
                        <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{word}</span>
                      </div>
                    ))}
                  </div>
                  {!showSeed && (
                    <button onClick={() => setShowSeed(true)}
                      className="absolute inset-0 flex items-center justify-center gap-2 text-xs"
                      style={{ color: 'var(--text-secondary)' }}>
                      <Eye className="h-4 w-4" /> Click to reveal
                    </button>
                  )}
                </div>

                <div className="flex gap-2 mb-4">
                  <button onClick={copyToClipboard} className="btn-secondary flex-1 flex items-center justify-center gap-2 text-xs py-2">
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button onClick={() => setShowSeed(!showSeed)} className="btn-secondary flex-1 flex items-center justify-center gap-2 text-xs py-2">
                    {showSeed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {showSeed ? 'Hide' : 'Show'}
                  </button>
                </div>

                <div className="p-3 rounded-lg mb-4" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <div className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Your Chipnet Address</div>
                  <div className="text-xs font-mono break-all" style={{ color: 'var(--accent)' }}>
                    {newWalletData.address}
                  </div>
                </div>

                <label className="flex items-start gap-3 p-3 rounded-lg cursor-pointer mb-4 hover:bg-[var(--bg-hover)]">
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}
                    className="mt-0.5" style={{ accentColor: 'var(--accent)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    I have saved my seed phrase securely
                  </span>
                </label>

                <button onClick={handleConfirmCreate} disabled={!confirmed} className="btn-primary w-full">
                  Continue to Marketplace
                </button>
              </>
            )}

            {mode === 'restore' && (
              <>
                <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Restore Wallet</h2>
                <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                  Enter your 12-word seed phrase to restore your wallet.
                </p>

                <textarea value={restoreInput} onChange={(e) => { setRestoreInput(e.target.value); setError(''); }}
                  placeholder="Enter your 12-word seed phrase..."
                  rows={3} className="input-field mb-4 resize-none font-mono text-xs" />

                {error && (
                  <div className="p-3 rounded-lg mb-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
                    <p className="text-xs" style={{ color: 'var(--accent-red)' }}>{error}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={() => { setMode('choose'); setError(''); }} className="btn-secondary flex-1 py-2">Back</button>
                  <button onClick={handleRestore} disabled={!restoreInput.trim()} className="btn-primary flex-1">Restore</button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
