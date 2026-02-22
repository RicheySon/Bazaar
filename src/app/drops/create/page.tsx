'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Image as ImageIcon, Settings, Clock, Lock, CheckCircle,
  ChevronRight, ChevronLeft, Upload, X, Plus, Trash2, AlertCircle, Zap,
} from 'lucide-react';
import { uploadFileToPinata } from '@/lib/ipfs/pinata';
import { useWalletStore } from '@/lib/store/wallet-store';
import { formatBCH } from '@/lib/utils';
import Link from 'next/link';

// ─── Step definitions ────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Artwork',    icon: ImageIcon },
  { id: 2, label: 'Details',   icon: Settings },
  { id: 3, label: 'Supply',    icon: Zap },
  { id: 4, label: 'Timing',    icon: Clock },
  { id: 5, label: 'Allowlist', icon: Lock },
  { id: 6, label: 'Review',    icon: CheckCircle },
];

// ─── Form state ──────────────────────────────────────────────────────────────

interface FormState {
  // Step 1
  bannerFile:        File | null;
  bannerIpfsUri:     string;
  bannerPreviewUrl:  string;

  // Step 2
  name:              string;
  collectionName:    string;
  description:       string;
  metadataDescription: string;

  // Step 3
  totalSupply:       string;
  mintPrice:         string;          // BCH string
  maxPerWallet:      string;
  royaltyBasisPoints: string;
  attributes:        { trait_type: string; value: string }[];

  // Step 4
  mintStartDate:     string;          // datetime-local value
  mintEndDate:       string;
  hasEndTime:        boolean;

  // Step 5
  whitelistEnabled:     boolean;
  whitelistStartDate:   string;
  whitelistAddressesRaw: string;      // one address per line
}

const INITIAL: FormState = {
  bannerFile:           null,
  bannerIpfsUri:        '',
  bannerPreviewUrl:     '',
  name:                 '',
  collectionName:       '',
  description:          '',
  metadataDescription:  '',
  totalSupply:          '1000',
  mintPrice:            '0.1',
  maxPerWallet:         '5',
  royaltyBasisPoints:   '500',
  attributes:           [],
  mintStartDate:        '',
  mintEndDate:          '',
  hasEndTime:           false,
  whitelistEnabled:     false,
  whitelistStartDate:   '',
  whitelistAddressesRaw: '',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function bchToSats(bch: string): string {
  const n = parseFloat(bch);
  if (isNaN(n)) return '0';
  return String(Math.round(n * 100_000_000));
}

function dateLocalToUnix(val: string): number {
  if (!val) return 0;
  return Math.floor(new Date(val).getTime() / 1000);
}

function toDatetimeLocal(unix: number): string {
  if (!unix) return '';
  const d = new Date(unix * 1000);
  // Format: YYYY-MM-DDTHH:mm (no seconds)
  return d.toISOString().slice(0, 16);
}

// Default to 1 week from now
function defaultStartDate() {
  return toDatetimeLocal(Math.floor(Date.now() / 1000) + 7 * 86400);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CreateDropPage() {
  const router = useRouter();
  const { wallet, setModalOpen } = useWalletStore();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>({ ...INITIAL, mintStartDate: defaultStartDate() });
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof FormState, value: any) =>
    setForm((f) => ({ ...f, [key]: value }));

  // ── Step 1: Artwork ──────────────────────────────────────────────────────

  const handleBannerSelect = async (file: File) => {
    set('bannerFile', file);
    set('bannerPreviewUrl', URL.createObjectURL(file));
    setUploadingBanner(true);
    const result = await uploadFileToPinata(file);
    setUploadingBanner(false);
    if (result.success && result.ipfsUri) {
      set('bannerIpfsUri', result.ipfsUri);
    }
  };

  // ── Step 3: Attributes ───────────────────────────────────────────────────

  const addAttr = () => set('attributes', [...form.attributes, { trait_type: '', value: '' }]);
  const removeAttr = (i: number) => set('attributes', form.attributes.filter((_, idx) => idx !== i));
  const updateAttr = (i: number, key: 'trait_type' | 'value', val: string) =>
    set('attributes', form.attributes.map((a, idx) => idx === i ? { ...a, [key]: val } : a));

  // ── Validation ───────────────────────────────────────────────────────────

  function canProceed(): boolean {
    switch (step) {
      case 1: return !!form.bannerIpfsUri;
      case 2: return !!form.name.trim() && !!form.collectionName.trim();
      case 3: return Number(form.totalSupply) >= 1 && parseFloat(form.mintPrice) >= 0;
      case 4: return !!form.mintStartDate;
      case 5: return true;
      default: return true;
    }
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!wallet?.isConnected) { setModalOpen(true); return; }
    setIsSubmitting(true);
    setSubmitError('');

    const whitelistAddresses = form.whitelistEnabled
      ? form.whitelistAddressesRaw
          .split('\n')
          .map((a) => a.trim())
          .filter(Boolean)
      : [];

    const body = {
      name:                form.name.trim(),
      collectionName:      form.collectionName.trim(),
      description:         form.description.trim(),
      metadataDescription: form.metadataDescription.trim() || form.description.trim(),
      bannerImage:         form.bannerIpfsUri,
      creatorAddress:      wallet.address,
      totalSupply:         Number(form.totalSupply),
      mintPrice:           bchToSats(form.mintPrice),
      maxPerWallet:        Number(form.maxPerWallet),
      royaltyBasisPoints:  Number(form.royaltyBasisPoints),
      attributes:          form.attributes.filter((a) => a.trait_type && a.value),
      mintStartTime:       dateLocalToUnix(form.mintStartDate),
      mintEndTime:         form.hasEndTime ? dateLocalToUnix(form.mintEndDate) : undefined,
      whitelistEnabled:    form.whitelistEnabled,
      whitelistStartTime:  form.whitelistEnabled ? dateLocalToUnix(form.whitelistStartDate) : undefined,
      whitelistAddresses,
    };

    try {
      const res = await fetch('/api/drops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || 'Failed to create drop');
        setIsSubmitting(false);
        return;
      }
      router.push(`/drops/${data.drop.slug}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unexpected error');
      setIsSubmitting(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (!wallet?.isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <Zap className="h-10 w-10 mb-3" style={{ color: 'var(--accent)' }} />
        <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Connect your wallet</h2>
        <p className="text-sm mb-4 max-w-xs" style={{ color: 'var(--text-muted)' }}>
          You need a connected wallet to create an NFT drop.
        </p>
        <button onClick={() => setModalOpen(true)} className="btn-primary px-6 py-2.5 text-sm">
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="mx-auto max-w-[820px]">

        {/* Header */}
        <div className="mb-6">
          <Link href="/drops" className="text-xs hover:text-[var(--text-primary)] transition-colors" style={{ color: 'var(--text-muted)' }}>
            ← Back to Drops
          </Link>
          <h1 className="text-xl font-semibold mt-2" style={{ color: 'var(--text-primary)' }}>Create NFT Drop</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Schedule a timed NFT release on Bitcoin Cash Chipnet
          </p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-1">
          {STEPS.map(({ id, label, icon: Icon }, i) => (
            <div key={id} className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => id < step ? setStep(id) : undefined}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                  id === step
                    ? 'font-semibold'
                    : id < step
                      ? 'cursor-pointer hover:bg-[var(--bg-hover)]'
                      : 'opacity-40 cursor-not-allowed'
                }`}
                style={{
                  background: id === step ? 'var(--bg-hover)' : 'transparent',
                  color: id <= step ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {id < step ? (
                  <CheckCircle className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
                {label}
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRight className="h-3 w-3 shrink-0" style={{ color: 'var(--border)' }} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.18 }}
          >
            {/* ── Step 1: Artwork ──────────────────────────────────────── */}
            {step === 1 && (
              <div className="card p-6">
                <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Upload Banner Artwork</h2>
                <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                  This image will be used as the drop banner and as the artwork for each minted NFT.
                  Supports JPG, PNG, GIF, SVG, MP4, WebM.
                </p>

                {form.bannerPreviewUrl ? (
                  <div className="relative rounded-xl overflow-hidden mb-4 h-52">
                    <img src={form.bannerPreviewUrl} alt="Banner preview" className="w-full h-full object-cover" />
                    <button
                      onClick={() => { set('bannerFile', null); set('bannerPreviewUrl', ''); set('bannerIpfsUri', ''); }}
                      className="absolute top-2 right-2 p-1.5 rounded-full"
                      style={{ background: 'rgba(0,0,0,0.7)', color: '#fff' }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    {uploadingBanner && (
                      <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
                        <span className="text-white text-sm font-semibold animate-pulse">Uploading to IPFS…</span>
                      </div>
                    )}
                    {form.bannerIpfsUri && (
                      <div className="absolute bottom-2 left-2 text-[10px] px-2 py-0.5 rounded"
                        style={{ background: 'rgba(0,229,69,0.2)', color: 'var(--accent)' }}>
                        ✓ Uploaded to IPFS
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className="border-2 border-dashed rounded-xl h-52 flex flex-col items-center justify-center cursor-pointer transition-colors hover:border-[var(--accent)]"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-8 w-8 mb-2" style={{ color: 'var(--text-muted)' }} />
                    <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Click to upload banner
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      JPG, PNG, GIF, SVG, MP4, WebM
                    </div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleBannerSelect(e.target.files[0])}
                />
              </div>
            )}

            {/* ── Step 2: Details ──────────────────────────────────────── */}
            {step === 2 && (
              <div className="card p-6 space-y-4">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Drop Details</h2>

                <div>
                  <label className="label-text">Drop Name *</label>
                  <input
                    className="input-field"
                    placeholder="e.g. Bazaar Punks Gen 1"
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                  />
                </div>

                <div>
                  <label className="label-text">Collection Name *</label>
                  <input
                    className="input-field"
                    placeholder="e.g. Bazaar Punks"
                    value={form.collectionName}
                    onChange={(e) => set('collectionName', e.target.value)}
                  />
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                    NFTs will be named "{form.collectionName || 'Collection'} #1", "#2", etc.
                  </p>
                </div>

                <div>
                  <label className="label-text">Drop Description</label>
                  <textarea
                    className="input-field resize-none"
                    rows={3}
                    placeholder="Tell collectors about this drop…"
                    value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                  />
                </div>

                <div>
                  <label className="label-text">NFT Metadata Description</label>
                  <textarea
                    className="input-field resize-none"
                    rows={2}
                    placeholder="Description stored in each NFT's metadata (defaults to drop description)"
                    value={form.metadataDescription}
                    onChange={(e) => set('metadataDescription', e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* ── Step 3: Supply & Pricing ─────────────────────────────── */}
            {step === 3 && (
              <div className="card p-6 space-y-4">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Supply & Pricing</h2>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label-text">Total Supply *</label>
                    <input
                      className="input-field font-mono"
                      type="number"
                      min="1"
                      max="10000"
                      value={form.totalSupply}
                      onChange={(e) => set('totalSupply', e.target.value)}
                    />
                    <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>Max NFTs that can be minted</p>
                  </div>
                  <div>
                    <label className="label-text">Mint Price (BCH) *</label>
                    <input
                      className="input-field font-mono"
                      type="number"
                      min="0"
                      step="0.001"
                      value={form.mintPrice}
                      onChange={(e) => set('mintPrice', e.target.value)}
                    />
                    <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>0 = free mint</p>
                  </div>
                  <div>
                    <label className="label-text">Max per Wallet</label>
                    <input
                      className="input-field font-mono"
                      type="number"
                      min="1"
                      max="100"
                      value={form.maxPerWallet}
                      onChange={(e) => set('maxPerWallet', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label-text">Royalty (basis points)</label>
                    <input
                      className="input-field font-mono"
                      type="number"
                      min="0"
                      max="2500"
                      value={form.royaltyBasisPoints}
                      onChange={(e) => set('royaltyBasisPoints', e.target.value)}
                    />
                    <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                      {Number(form.royaltyBasisPoints) / 100}% on secondary sales
                    </p>
                  </div>
                </div>

                {/* Attributes */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label-text mb-0">Collection Traits (optional)</label>
                    <button onClick={addAttr} className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
                      <Plus className="h-3.5 w-3.5" />
                      Add Trait
                    </button>
                  </div>
                  {form.attributes.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Traits are added to each NFT's metadata (e.g. "Art Style: Pixel")
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {form.attributes.map((attr, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <input
                            className="input-field flex-1"
                            placeholder="Trait name"
                            value={attr.trait_type}
                            onChange={(e) => updateAttr(i, 'trait_type', e.target.value)}
                          />
                          <input
                            className="input-field flex-1"
                            placeholder="Value"
                            value={attr.value}
                            onChange={(e) => updateAttr(i, 'value', e.target.value)}
                          />
                          <button onClick={() => removeAttr(i)} style={{ color: 'var(--accent-red)' }}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Step 4: Timing ───────────────────────────────────────── */}
            {step === 4 && (
              <div className="card p-6 space-y-4">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Mint Timing</h2>

                <div>
                  <label className="label-text">Public Mint Start *</label>
                  <input
                    className="input-field"
                    type="datetime-local"
                    value={form.mintStartDate}
                    onChange={(e) => set('mintStartDate', e.target.value)}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="hasEndTime"
                    checked={form.hasEndTime}
                    onChange={(e) => set('hasEndTime', e.target.checked)}
                    className="h-3.5 w-3.5 cursor-pointer"
                  />
                  <label htmlFor="hasEndTime" className="text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                    Set a mint end time
                  </label>
                </div>

                {form.hasEndTime && (
                  <div>
                    <label className="label-text">Mint End Time</label>
                    <input
                      className="input-field"
                      type="datetime-local"
                      value={form.mintEndDate}
                      onChange={(e) => set('mintEndDate', e.target.value)}
                      min={form.mintStartDate}
                    />
                  </div>
                )}

                <div className="card p-3" style={{ background: 'var(--bg-secondary)' }}>
                  <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Schedule Preview</div>
                  <div className="space-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {form.mintStartDate && (
                      <div>Public mint: <span style={{ color: 'var(--accent)' }}>{new Date(form.mintStartDate).toLocaleString()}</span></div>
                    )}
                    {form.hasEndTime && form.mintEndDate && (
                      <div>Closes: <span style={{ color: 'var(--text-secondary)' }}>{new Date(form.mintEndDate).toLocaleString()}</span></div>
                    )}
                    {!form.hasEndTime && <div style={{ color: 'var(--text-muted)' }}>No end time (open indefinitely)</div>}
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 5: Allowlist ────────────────────────────────────── */}
            {step === 5 && (
              <div className="card p-6 space-y-4">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Allowlist / Pre-sale</h2>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="whitelistEnabled"
                    checked={form.whitelistEnabled}
                    onChange={(e) => set('whitelistEnabled', e.target.checked)}
                    className="h-3.5 w-3.5 cursor-pointer"
                  />
                  <label htmlFor="whitelistEnabled" className="text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                    Enable allowlist (pre-sale phase for selected wallets)
                  </label>
                </div>

                {form.whitelistEnabled && (
                  <>
                    <div>
                      <label className="label-text">Pre-sale Start Time</label>
                      <input
                        className="input-field"
                        type="datetime-local"
                        value={form.whitelistStartDate}
                        onChange={(e) => set('whitelistStartDate', e.target.value)}
                        max={form.mintStartDate}
                      />
                      <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                        Must be before the public mint start
                      </p>
                    </div>
                    <div>
                      <label className="label-text">Allowlisted Addresses</label>
                      <textarea
                        className="input-field font-mono resize-none"
                        rows={8}
                        placeholder={'bchtest:qz...\nbchtest:qr...\nbchtest:qa...'}
                        value={form.whitelistAddressesRaw}
                        onChange={(e) => set('whitelistAddressesRaw', e.target.value)}
                      />
                      <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                        One BCH address per line.{' '}
                        {form.whitelistAddressesRaw.split('\n').filter(a => a.trim()).length} addresses entered.
                      </p>
                    </div>
                  </>
                )}

                {!form.whitelistEnabled && (
                  <div className="text-xs p-3 rounded-lg" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                    With no allowlist, minting will be open to everyone when the mint starts.
                  </div>
                )}
              </div>
            )}

            {/* ── Step 6: Review ───────────────────────────────────────── */}
            {step === 6 && (
              <div className="space-y-4">
                <div className="card p-5">
                  <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Review Your Drop</h2>

                  <div className="flex gap-4 mb-4">
                    {form.bannerPreviewUrl && (
                      <div className="w-24 h-24 rounded-xl overflow-hidden shrink-0">
                        <img src={form.bannerPreviewUrl} alt="Banner" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div>
                      <div className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{form.name}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{form.collectionName}</div>
                      {form.description && (
                        <div className="text-xs mt-2 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{form.description}</div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                    {[
                      { label: 'Total Supply', value: Number(form.totalSupply).toLocaleString() },
                      { label: 'Mint Price',   value: parseFloat(form.mintPrice) === 0 ? 'Free' : `${form.mintPrice} BCH` },
                      { label: 'Max / Wallet', value: form.maxPerWallet },
                      { label: 'Royalty',      value: `${Number(form.royaltyBasisPoints) / 100}%` },
                      { label: 'Mint Opens',   value: form.mintStartDate ? new Date(form.mintStartDate).toLocaleString() : '—' },
                      { label: 'Mint Closes',  value: form.hasEndTime && form.mintEndDate ? new Date(form.mintEndDate).toLocaleString() : 'No end' },
                      { label: 'Allowlist',    value: form.whitelistEnabled ? `Yes (${form.whitelistAddressesRaw.split('\n').filter(a=>a.trim()).length} addrs)` : 'No' },
                      { label: 'Creator',      value: wallet?.address ? `${wallet.address.slice(0, 16)}…` : '—' },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between border-b py-1.5" style={{ borderColor: 'var(--border)' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                        <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {submitError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg text-xs"
                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--accent-red)' }}>
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {submitError}
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="btn-primary w-full text-sm py-3"
                >
                  {isSubmitting ? 'Creating Drop…' : 'Deploy Drop'}
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={step === 1}
            className="btn-secondary flex items-center gap-1.5 text-xs px-4 py-2 disabled:opacity-30"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </button>

          {step < 6 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canProceed()}
              className="btn-primary flex items-center gap-1.5 text-xs px-4 py-2 disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
