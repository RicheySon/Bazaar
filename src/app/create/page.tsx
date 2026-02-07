'use client';

import { useState, useRef } from 'react';
import {
  Upload, Image as ImageIcon, Video, X, Loader2, Check, ExternalLink,
  Sparkles, Tag, Gavel, Percent, AlertCircle
} from 'lucide-react';
import { useWalletStore } from '@/lib/store/wallet-store';
import { uploadFileToPinata, uploadMetadataToPinata, isPinataConfigured } from '@/lib/ipfs/pinata';
import { prepareMint } from '@/lib/bch/api-client';
import { loadWallet } from '@/lib/bch/wallet';
import { getExplorerTxUrl } from '@/lib/bch/config';

type ListingMode = 'fixed' | 'auction';
type MediaType = 'image' | 'video';

export default function CreatePage() {
  const { wallet, setModalOpen } = useWalletStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>('image');
  const [royaltyPercent, setRoyaltyPercent] = useState(10);
  const [listingMode, setListingMode] = useState<ListingMode>('fixed');
  const [price, setPrice] = useState('');
  const [minBid, setMinBid] = useState('');
  const [auctionHours, setAuctionHours] = useState('24');
  const [attributes, setAttributes] = useState<Array<{ trait_type: string; value: string }>>([]);

  const [step, setStep] = useState(0);
  const [txid, setTxid] = useState('');
  const [error, setError] = useState('');

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = mediaType === 'video' ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setError(`File too large. Max ${mediaType === 'video' ? '50MB' : '10MB'}.`);
      return;
    }

    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
    setError('');
  };

  const removeMedia = () => {
    setMediaFile(null);
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaPreview(null);
  };

  const addAttribute = () => setAttributes([...attributes, { trait_type: '', value: '' }]);

  const updateAttribute = (index: number, field: 'trait_type' | 'value', value: string) => {
    const updated = [...attributes];
    updated[index][field] = value;
    setAttributes(updated);
  };

  const removeAttribute = (index: number) => setAttributes(attributes.filter((_, i) => i !== index));

  const handleSubmit = async () => {
    if (!wallet?.isConnected) { setModalOpen(true); return; }
    if (wallet.balance <= 0n) {
      setError('Insufficient balance. Fund your wallet with Chipnet BCH from the faucet: https://tbch.googol.cash');
      return;
    }
    if (!name.trim()) { setError('Name is required'); return; }
    if (!mediaFile) { setError(`${mediaType === 'video' ? 'Video' : 'Image'} is required`); return; }
    if (listingMode === 'fixed' && (!price || parseFloat(price) <= 0)) { setError('Valid price is required'); return; }
    if (listingMode === 'auction' && (!minBid || parseFloat(minBid) <= 0)) { setError('Valid minimum bid is required'); return; }

    setError('');
    try {
      setStep(1);
      if (isPinataConfigured()) {
        const imageResult = await uploadFileToPinata(mediaFile);
        if (!imageResult.success || !imageResult.ipfsUri) {
          setError(imageResult.error || 'Upload failed');
          setStep(0); return;
        }

        const metadataResult = await uploadMetadataToPinata({
          name: name.trim(),
          description: description.trim(),
          image: imageResult.ipfsUri,
          creator: wallet.address,
          royalty: royaltyPercent * 100,
          attributes: attributes.filter((a) => a.trait_type && a.value),
        });

        if (!metadataResult.success || !metadataResult.ipfsHash) {
          setError(metadataResult.error || 'Metadata upload failed');
          setStep(0); return;
        }

        setStep(2);
        const walletData = loadWallet();
        if (!walletData) { setError('Wallet not found. Please reconnect.'); setStep(0); return; }

        const mintResult = await prepareMint(walletData.address, metadataResult.ipfsHash, name.trim());
        if (!mintResult.success) { setError(mintResult.error || 'Minting failed'); setStep(0); return; }

        setTxid(mintResult.tokenCategory || mintResult.utxo?.txid || '');
        setStep(4);
      } else {
        await new Promise((r) => setTimeout(r, 2000));
        setStep(2);
        await new Promise((r) => setTimeout(r, 2000));
        setStep(3);
        await new Promise((r) => setTimeout(r, 1500));
        setTxid('demo_tx_' + Date.now().toString(16));
        setStep(4);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setStep(0);
    }
  };

  const steps = [
    { label: 'Upload to IPFS', icon: Upload },
    { label: 'Mint NFT', icon: Sparkles },
    { label: 'Create Listing', icon: Tag },
    { label: 'Complete', icon: Check },
  ];

  // Progress view
  if (step > 0) {
    return (
      <div className="px-4 sm:px-6 py-16">
        <div className="mx-auto max-w-lg">
          <div className="card p-8 text-center">
            {step < 4 ? (
              <>
                <Loader2 className="h-10 w-10 mx-auto mb-6 animate-spin" style={{ color: 'var(--accent)' }} />
                <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  {steps[step - 1]?.label}...
                </h2>
                <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
                  Please wait while your NFT is being created on Chipnet
                </p>
                <div className="flex justify-center gap-2">
                  {steps.map((s, i) => (
                    <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${
                      i + 1 < step ? 'badge-green' : i + 1 === step ? 'badge-blue animate-pulse' : ''
                    }`} style={i + 1 > step ? { color: 'var(--text-muted)' } : {}}>
                      {i + 1 < step ? <Check className="h-3 w-3" /> : <s.icon className="h-3 w-3" />}
                      {s.label}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-6"
                  style={{ background: 'rgba(0,229,69,0.1)' }}>
                  <Check className="h-7 w-7" style={{ color: 'var(--accent)' }} />
                </div>
                <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>NFT Created!</h2>
                <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
                  Your CashTokens NFT has been minted on Bitcoin Cash Chipnet
                </p>
                {txid && (
                  <div className="p-3 rounded-lg mb-6" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                    <div className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Transaction ID</div>
                    <div className="text-xs font-mono break-all" style={{ color: 'var(--accent)' }}>{txid}</div>
                  </div>
                )}
                <div className="flex gap-3">
                  {txid && !txid.startsWith('demo') && (
                    <a href={getExplorerTxUrl(txid)} target="_blank" rel="noopener noreferrer"
                      className="btn-secondary flex-1 flex items-center justify-center gap-2 text-xs">
                      <ExternalLink className="h-3.5 w-3.5" /> View on Explorer
                    </a>
                  )}
                  <button onClick={() => { setStep(0); setName(''); setDescription(''); removeMedia(); setPrice(''); setMinBid(''); setAttributes([]); }}
                    className="btn-primary flex-1 text-xs">Create Another</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Create NFT</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Mint a CashTokens NFT on Bitcoin Cash Chipnet with on-chain royalties
          </p>
        </div>

        {!isPinataConfigured() && (
          <div className="flex items-start gap-3 p-3 rounded-lg mb-6"
            style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)' }}>
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--accent-orange)' }} />
            <div>
              <div className="text-xs font-medium" style={{ color: 'var(--accent-orange)' }}>Pinata API not configured</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Add NEXT_PUBLIC_PINATA_JWT to .env.local for IPFS. Running in demo mode.
              </div>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-5 gap-6">
          {/* Left Column - Media Upload */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Artwork</label>

            {/* Media type toggle */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => { setMediaType('image'); removeMedia(); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  mediaType === 'image' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                }`}
                style={mediaType === 'image' ? { background: 'var(--bg-hover)', border: '1px solid var(--border-light)' } : { border: '1px solid var(--border)' }}
              >
                <ImageIcon className="h-3.5 w-3.5" /> Image
              </button>
              <button
                onClick={() => { setMediaType('video'); removeMedia(); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  mediaType === 'video' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                }`}
                style={mediaType === 'video' ? { background: 'var(--bg-hover)', border: '1px solid var(--border-light)' } : { border: '1px solid var(--border)' }}
              >
                <Video className="h-3.5 w-3.5" /> Video
              </button>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="relative aspect-square rounded-xl border-2 border-dashed cursor-pointer transition-all overflow-hidden"
              style={{ borderColor: mediaPreview ? 'var(--accent)' : 'var(--border)' }}
            >
              {mediaPreview ? (
                <>
                  {mediaType === 'video' ? (
                    <video src={mediaPreview} className="w-full h-full object-cover" muted loop autoPlay playsInline />
                  ) : (
                    <img src={mediaPreview} alt="Preview" className="w-full h-full object-cover" />
                  )}
                  <button onClick={(e) => { e.stopPropagation(); removeMedia(); }}
                    className="absolute top-2 right-2 p-1.5 rounded-lg transition-colors"
                    style={{ background: 'rgba(0,0,0,0.6)' }}>
                    <X className="h-4 w-4 text-white" />
                  </button>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ color: 'var(--text-muted)' }}>
                  {mediaType === 'video' ? <Video className="h-10 w-10 mb-2" /> : <ImageIcon className="h-10 w-10 mb-2" />}
                  <span className="text-xs font-medium">Click to upload</span>
                  <span className="text-[11px] mt-1">
                    {mediaType === 'video' ? 'MP4, WebM (max 50MB)' : 'PNG, JPG, GIF, SVG (max 10MB)'}
                  </span>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file"
              accept={mediaType === 'video' ? 'video/*' : 'image/*'}
              onChange={handleMediaSelect} className="hidden" />
          </div>

          {/* Right Column - Form */}
          <div className="md:col-span-3 space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Chipnet Collectible #001" className="input-field" maxLength={100} />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your NFT..." rows={3} className="input-field resize-none" maxLength={1000} />
            </div>

            {/* Listing Type */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Listing Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setListingMode('fixed')}
                  className="flex items-center gap-3 p-3 rounded-lg border transition-all"
                  style={{
                    borderColor: listingMode === 'fixed' ? 'var(--accent)' : 'var(--border)',
                    background: listingMode === 'fixed' ? 'rgba(0,229,69,0.05)' : 'transparent'
                  }}>
                  <Tag className="h-4 w-4" style={{ color: listingMode === 'fixed' ? 'var(--accent)' : 'var(--text-muted)' }} />
                  <div className="text-left">
                    <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Fixed Price</div>
                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Instant buy</div>
                  </div>
                </button>
                <button onClick={() => setListingMode('auction')}
                  className="flex items-center gap-3 p-3 rounded-lg border transition-all"
                  style={{
                    borderColor: listingMode === 'auction' ? 'var(--accent-purple)' : 'var(--border)',
                    background: listingMode === 'auction' ? 'rgba(139,92,246,0.05)' : 'transparent'
                  }}>
                  <Gavel className="h-4 w-4" style={{ color: listingMode === 'auction' ? 'var(--accent-purple)' : 'var(--text-muted)' }} />
                  <div className="text-left">
                    <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Auction</div>
                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>English style</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Price / Min Bid */}
            {listingMode === 'fixed' ? (
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Price (BCH)</label>
                <input type="number" value={price} onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.001" step="0.00000001" min="0" className="input-field" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Min Bid (BCH)</label>
                  <input type="number" value={minBid} onChange={(e) => setMinBid(e.target.value)}
                    placeholder="0.001" step="0.00000001" min="0" className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Duration</label>
                  <select value={auctionHours} onChange={(e) => setAuctionHours(e.target.value)} className="input-field cursor-pointer">
                    {[['1', '1 hour'], ['6', '6 hours'], ['12', '12 hours'], ['24', '24 hours'], ['48', '48 hours'], ['168', '7 days']].map(([v, l]) => (
                      <option key={v} value={v} style={{ background: 'var(--bg-secondary)' }}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Royalty */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                <Percent className="h-3.5 w-3.5" /> Creator Royalty
              </label>
              <div className="flex items-center gap-3">
                <input type="range" value={royaltyPercent} onChange={(e) => setRoyaltyPercent(parseInt(e.target.value))}
                  min={0} max={25} className="flex-1" style={{ accentColor: 'var(--accent)' }} />
                <span className="text-xs font-mono w-10 text-right" style={{ color: 'var(--accent)' }}>{royaltyPercent}%</span>
              </div>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Enforced on-chain via CashScript covenant
              </p>
            </div>

            {/* Attributes */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Attributes</label>
              {attributes.map((attr, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input type="text" value={attr.trait_type} onChange={(e) => updateAttribute(i, 'trait_type', e.target.value)}
                    placeholder="Trait" className="input-field flex-1 py-2 text-xs" />
                  <input type="text" value={attr.value} onChange={(e) => updateAttribute(i, 'value', e.target.value)}
                    placeholder="Value" className="input-field flex-1 py-2 text-xs" />
                  <button onClick={() => removeAttribute(i)} className="p-2 hover:text-red-400 transition-colors" style={{ color: 'var(--text-muted)' }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button onClick={addAttribute} className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
                + Add Attribute
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <p className="text-xs" style={{ color: 'var(--accent-red)' }}>{error}</p>
              </div>
            )}

            <button onClick={handleSubmit}
              className="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2">
              <Sparkles className="h-4 w-4" />
              {wallet?.isConnected ? 'Create & List NFT' : 'Connect Wallet to Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
