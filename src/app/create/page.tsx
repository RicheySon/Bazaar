'use client';

import { useState, useRef, useEffect } from 'react';
import { useWeb3ModalConnectorContext } from '@bch-wc2/web3modal-connector';
import {
  Upload, Image as ImageIcon, Video, X, Loader2, Check, ExternalLink,
  Sparkles, Tag, Gavel, Percent, AlertCircle, Library, ChevronDown
} from 'lucide-react';
import { useWalletStore } from '@/lib/store/wallet-store';
import { uploadFileToPinata, uploadMetadataToPinata, isPinataConfigured } from '@/lib/ipfs/pinata';
import { loadWallet, getPkhHex } from '@/lib/bch/wallet';
import { buildWcMintParams, buildWcPrepTransaction, buildWcMintFromCollectionParams, buildMarketplaceContract, buildAuctionContract, buildWcListingParams, getTokenUtxos } from '@/lib/bch/contracts';
import type { MintingTokenUtxo } from '@/lib/bch/contracts';
import { getExplorerTxUrl, MARKETPLACE_CONFIG } from '@/lib/bch/config';
import { bchToSatoshis, commitmentHexToCid, shortenAddress } from '@/lib/utils';
import { decodeCashAddress } from '@bitauth/libauth';

interface MintingTokenInfo extends MintingTokenUtxo {
  collectionName: string;
}

type ListingMode = 'fixed' | 'auction';
type MediaType = 'image' | 'video';

export default function CreatePage() {
  const { wallet, setModalOpen, connectionType } = useWalletStore();
  const { signTransaction } = useWeb3ModalConnectorContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // WalletConnect compatibility: send hex payloads by default (set NEXT_PUBLIC_WC_PAYLOAD_MODE=raw to send libauth Transaction objects)
  const wcPayloadMode = process.env.NEXT_PUBLIC_WC_PAYLOAD_MODE || 'hex';
  const wcDebug = process.env.NEXT_PUBLIC_WC_DEBUG === 'true';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [collectionName, setCollectionName] = useState('');
  const [mintAsCollection, setMintAsCollection] = useState(false);
  const [addToCollection, setAddToCollection] = useState(false);
  const [mintingTokens, setMintingTokens] = useState<MintingTokenInfo[]>([]);
  const [selectedMintingToken, setSelectedMintingToken] = useState<MintingTokenInfo | null>(null);
  const [loadingMintingTokens, setLoadingMintingTokens] = useState(false);
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
  const [stepNote, setStepNote] = useState('');
  const [mintTxid, setMintTxid] = useState('');
  const [listingTxid, setListingTxid] = useState('');
  const [error, setError] = useState('');

  const waitForTokenUtxo = async (address: string, tokenCategory: string, fromTxid?: string) => {
    for (let i = 0; i < 24; i++) {
      const tokenUtxos = await getTokenUtxos(address);
      const utxo = tokenUtxos.find((u) =>
        u.token?.category === tokenCategory &&
        u.token?.nft &&
        // Only exclude minting tokens when looking for a specific child NFT (addToCollection path).
        // When fromTxid is not set, we accept any capability so genesis minting tokens are found too.
        (!fromTxid || u.token.nft.capability !== 'minting') &&
        (!fromTxid || u.txid === fromTxid)
      );
      if (utxo) return utxo;
      await new Promise((r) => setTimeout(r, 2500));
    }
    return null;
  };

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

  // Load minting-capability tokens from the user's wallet
  useEffect(() => {
    if (!wallet?.isConnected) { setMintingTokens([]); return; }
    const pollAddress = connectionType !== 'walletconnect' && wallet.tokenAddress
      ? wallet.tokenAddress : wallet.address;

    setLoadingMintingTokens(true);
    getTokenUtxos(pollAddress).then(async (utxos) => {
      const minting = utxos.filter(u => u.token?.nft?.capability === 'minting');
      const infos: MintingTokenInfo[] = await Promise.all(
        minting.map(async (u) => {
          const commitment = u.token!.nft!.commitment || '';
          let collectionName = shortenAddress(u.token!.category, 6);
          try {
            const cid = commitmentHexToCid(commitment);
            if (cid) {
              const res = await fetch(`/api/ipfs/metadata`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // We abuse the metadata route here just to resolve the CID name
              }).catch(() => null);
              // Directly fetch IPFS metadata via pinata gateway
              const gateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY || 'https://gateway.pinata.cloud';
              const metaRes = await fetch(`${gateway}/ipfs/${cid}`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
              if (metaRes?.ok) {
                const meta = await metaRes.json().catch(() => null);
                if (meta?.collection) collectionName = meta.collection;
                else if (meta?.name) collectionName = meta.name;
              }
            }
          } catch { /* use shortened category */ }
          return {
            txid: u.txid,
            vout: u.vout,
            satoshis: u.satoshis,
            category: u.token!.category,
            commitment,
            collectionName,
          };
        })
      );
      setMintingTokens(infos);
    }).catch(() => setMintingTokens([])).finally(() => setLoadingMintingTokens(false));
  }, [wallet?.isConnected, wallet?.address]);

  const handleSubmit = async () => {
    if (!wallet?.isConnected) { setModalOpen(true); return; }

    // For WalletConnect, we might not have a balance check if Electrum is down.
    // Allow proceeding if balance is 0 but we have a wallet connected via WC.
    if (connectionType !== 'walletconnect' && wallet.balance <= 0n) {
      setError('Insufficient balance. Fund your wallet with Chipnet BCH from the faucet: https://tbch.googol.cash');
      return;
    }

    if (!name.trim()) { setError('Name is required'); return; }
    if (!mediaFile) { setError(`${mediaType === 'video' ? 'Video' : 'Image'} is required`); return; }
    if (listingMode === 'fixed' && (!price || parseFloat(price) <= 0)) { setError('Valid price is required'); return; }
    if (listingMode === 'auction' && (!minBid || parseFloat(minBid) <= 0)) { setError('Valid minimum bid is required'); return; }

    setError('');
    try {
      if (!isPinataConfigured()) {
        setError('Pinata API not configured. Add PINATA_JWT to .env.local to mint NFTs.');
        return;
      }

      setStep(1);
      {
        const imageResult = await uploadFileToPinata(mediaFile);
        if (!imageResult.success || !imageResult.ipfsUri) {
          setError(imageResult.error || 'Upload failed');
          setStep(0); return;
        }

        const effectiveCollection = addToCollection && selectedMintingToken
          ? selectedMintingToken.collectionName
          : collectionName.trim() || undefined;

        const metadataResult = await uploadMetadataToPinata({
          name: name.trim(),
          description: description.trim(),
          image: imageResult.ipfsUri,
          creator: wallet.address,
          royalty: royaltyPercent * 100,
          collection: effectiveCollection,
          attributes: attributes.filter((a) => a.trait_type && a.value),
          ...(mediaType === 'video' && {
            animation_url: imageResult.ipfsUri,
            mimeType: mediaFile.type || 'video/mp4',
          }),
        });

        if (!metadataResult.success || !metadataResult.ipfsHash) {
          setError(metadataResult.error || 'Metadata upload failed');
          setStep(0); return;
        }

        // Validate minting token selection
        if (addToCollection && !selectedMintingToken) {
          setError('Please select a collection to add this NFT to.');
          setStep(0); return;
        }

        setStep(2);

        let mintResult;

        // ── Mint from existing collection (minting token fan-out) ────────────
        if (addToCollection && selectedMintingToken) {
          if (connectionType === 'walletconnect') {
            const wcParams = await buildWcMintFromCollectionParams(
              wallet.address,
              selectedMintingToken,
              metadataResult.ipfsHash,
              { name: name.trim(), collectionName: selectedMintingToken.collectionName },
            );
            if ('error' in wcParams) { setError(wcParams.error); setStep(0); return; }
            const wcReq = wcPayloadMode === 'raw'
              ? { transaction: wcParams.transaction, sourceOutputs: wcParams.sourceOutputs as any }
              : { transaction: wcParams.transactionHex, sourceOutputs: wcParams.sourceOutputsJson as any };
            try {
              const signResult = await signTransaction({ ...wcReq, broadcast: true, userPrompt: wcParams.userPrompt });
              if (!signResult) { mintResult = { success: false, error: 'Signing rejected by wallet.' }; }
              else { mintResult = { success: true, txid: signResult.signedTransactionHash, tokenCategory: wcParams.category }; }
            } catch (e: unknown) {
              mintResult = { success: false, error: e instanceof Error ? e.message : 'Wallet did not respond.' };
            }
          } else {
            const walletData = loadWallet();
            if (!walletData) { setError('Wallet not found.'); setStep(0); return; }
            const mintResponse = await fetch('/api/mint-from-collection', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                privateKeyHex: Buffer.from(walletData.privateKey).toString('hex'),
                pkh: getPkhHex(walletData),
                address: walletData.address,
                tokenAddress: walletData.tokenAddress,
                mintingToken: {
                  txid: selectedMintingToken.txid,
                  vout: selectedMintingToken.vout,
                  satoshis: selectedMintingToken.satoshis.toString(),
                  category: selectedMintingToken.category,
                  commitment: selectedMintingToken.commitment,
                },
                newCommitment: metadataResult.ipfsHash,
              }),
            });
            mintResult = await mintResponse.json();
          }
        }

        // ── Standard genesis mint ─────────────────────────────────────────────
        else if (connectionType === 'walletconnect') {
          // Check if the wallet has a genesis-capable UTXO (vout=0).
          // If not, build and sign a self-send prep tx first.
          try {
            const utxoRes = await fetch(`/api/utxos?address=${encodeURIComponent(wallet.address)}`);
            const utxoData = await utxoRes.json();
            const allUtxos: Array<{ vout: number; token?: unknown }> = utxoData.utxos || [];
            const hasGenesis = allUtxos.some(u => u.vout === 0 && !u.token);
            if (!hasGenesis) {
              const prepParams = await buildWcPrepTransaction(wallet.address);
              if ('error' in prepParams) {
                setError(prepParams.error);
                setStep(0);
                return;
              }
              const wcPrepRequest = wcPayloadMode === 'raw'
                ? { transaction: prepParams.transaction, sourceOutputs: prepParams.sourceOutputs as any }
                : { transaction: prepParams.transactionHex, sourceOutputs: prepParams.sourceOutputsJson as any };
              setStepNote('Step 1 of 2 — Approve "Prepare wallet for NFT minting" in your wallet app, then the actual mint will follow.');
              const prepResult = await signTransaction({
                ...wcPrepRequest,
                broadcast: true,
                userPrompt: prepParams.userPrompt,
              });
              setStepNote('');
              if (!prepResult) {
                setError('Wallet prep was cancelled. Open your wallet app, approve the "Prepare wallet for NFT minting" request, then click Create & List NFT again.');
                setStep(0);
                return;
              }
              // Wait for the prep UTXO to appear
              const prepTxid = prepResult.signedTransactionHash;
              let prepConfirmed = false;
              for (let i = 0; i < 12; i++) {
                await new Promise(r => setTimeout(r, 2500));
                const check = await fetch(`/api/utxos?address=${encodeURIComponent(wallet.address)}`);
                const checkData = await check.json();
                const checkUtxos: Array<{ txid: string; vout: number }> = checkData.utxos || [];
                if (checkUtxos.some(u => u.txid === prepTxid && u.vout === 0)) {
                  prepConfirmed = true;
                  break;
                }
              }
              if (!prepConfirmed) {
                setError('Prep transaction not confirmed. Please try again.');
                setStep(0);
                return;
              }
            }
          } catch (prepErr) {
            // Non-fatal: let buildWcMintParams try and surface its own error if needed
            if (wcDebug) console.warn('[Create] Genesis UTXO check failed:', prepErr);
          }

          // WalletConnect Minting - build tx params, then sign via context
          const wcParams = await buildWcMintParams(
            wallet.address,
            metadataResult.ipfsHash,
            { name: name.trim(), description: description.trim(), image: imageResult.ipfsUri },
            mintAsCollection ? 'minting' : 'none'
          );

          if ('error' in wcParams) {
            const msg = wcParams.error === 'NO_GENESIS_UTXO'
              ? 'No genesis-capable UTXO found. Please send a small BCH payment to yourself (any amount) from your wallet app, then try again.'
              : wcParams.error;
            setError(msg);
            setStep(0);
            return;
          }

          if (wcDebug) {
            console.log('[Create] Calling signTransaction from context...');
            console.log('[Create] signTransaction available:', typeof signTransaction === 'function');
          }

          try {
            const wcRequest = wcPayloadMode === 'raw'
              ? {
                  transaction: wcParams.transaction,
                  sourceOutputs: wcParams.sourceOutputs as any,
                }
              : {
                  transaction: wcParams.transactionHex,
                  sourceOutputs: wcParams.sourceOutputsJson as any,
                };

            if (wcDebug) {
              console.log('[Create] Sending signTransaction with mode:', wcPayloadMode);
            }
            const signPromise = signTransaction({
              ...wcRequest,
              broadcast: true,
              userPrompt: wcParams.userPrompt,
            });

            const timeoutPromise = new Promise<undefined>((_, reject) =>
              setTimeout(() => reject(new Error('Signing request timed out after 90 seconds. The wallet may not have received the request.')), 90000)
            );

            const signResult = await Promise.race([signPromise, timeoutPromise]);

            if (!signResult) {
              mintResult = { success: false, error: 'Transaction signing was rejected by wallet.' };
            } else {
              mintResult = {
                success: true,
                txid: signResult.signedTransactionHash,
                tokenCategory: wcParams.category,
              };
            }
          } catch (signError: unknown) {
            if (wcDebug) {
              console.error('[Create] signTransaction error:', signError);
              console.error('[Create] signTransaction error type:', typeof signError);
              if (signError && typeof signError === 'object') {
                console.error('[Create] signTransaction error keys:', Object.keys(signError as object));
                try { console.error('[Create] signTransaction error JSON:', JSON.stringify(signError)); } catch { }
              }
            }
            const msg = signError instanceof Error
              ? signError.message
              : 'Wallet did not respond. Make sure your wallet app is open and connected.';
            mintResult = { success: false, error: msg };
          }
        } else {
          // Generated Wallet Minting — delegated to server-side /api/mint
          const walletData = loadWallet();
          if (!walletData) { setError('Wallet not found. Please reconnect.'); setStep(0); return; }

          const walletPkh = getPkhHex(walletData);
          const privateKeyHex = Buffer.from(walletData.privateKey).toString('hex');

          const mintResponse = await fetch('/api/mint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              privateKeyHex,
              pkh: walletPkh,
              address: walletData.address,
              tokenAddress: walletData.tokenAddress,
              commitment: metadataResult.ipfsHash,
              capability: mintAsCollection ? 'minting' : 'none',
            }),
          });
          mintResult = await mintResponse.json();
        }

        if (!mintResult.success) { setError(mintResult.error || 'Minting failed'); setStep(0); return; }

        setMintTxid(mintResult.txid || '');

        const tokenCategory = mintResult.tokenCategory || '';
        // Internal wallet mints to tokenAddress (z… prefix); WalletConnect wallet manages its own address.
        const pollAddress = connectionType !== 'walletconnect' && wallet.tokenAddress
          ? wallet.tokenAddress
          : wallet.address;
        // When minting from collection, filter by txid so we get the child NFT, not the minting token
        const nftUtxo = await waitForTokenUtxo(
          pollAddress, tokenCategory, addToCollection ? (mintResult.txid || undefined) : undefined
        );
        if (!nftUtxo || !nftUtxo.token?.nft) {
          setError('NFT not found in wallet yet. Please refresh and try listing again.');
          setStep(0);
          return;
        }

        setStep(3);

        const royaltyBp = royaltyPercent * 100;
        const commitment = nftUtxo.token.nft.commitment || '';
        const endTime = Math.floor(Date.now() / 1000) + parseInt(auctionHours, 10) * 3600;
        const priceSats = listingMode === 'fixed' ? bchToSatoshis(parseFloat(price)) : 0n;
        const minBidSats = listingMode === 'auction' ? bchToSatoshis(parseFloat(minBid)) : 0n;

        let listingResult: { success: boolean; txid?: string; error?: string; contractAddress?: string };
        let sellerPkh = '';
        let creatorPkh = '';

        if (connectionType === 'walletconnect') {
          const decoded = decodeCashAddress(wallet.address);
          if (typeof decoded === 'string') {
            setError('Invalid wallet address');
            setStep(0);
            return;
          }
          sellerPkh = Buffer.from(decoded.payload).toString('hex');
          creatorPkh = sellerPkh;

          let listingParams = await buildWcListingParams({
            address: wallet.address,
            tokenCategory,
            listingType: listingMode,
            price: listingMode === 'fixed' ? priceSats : undefined,
            minBid: listingMode === 'auction' ? minBidSats : undefined,
            endTime: listingMode === 'auction' ? BigInt(endTime) : undefined,
            royaltyBasisPoints: BigInt(royaltyBp),
            sellerPkh,
            creatorPkh,
            minBidIncrement: BigInt(MARKETPLACE_CONFIG.minBidIncrement),
          });

          if ('error' in listingParams && listingParams.needsPrep) {
            const prepParams = await buildWcPrepTransaction(wallet.address);
            if ('error' in prepParams) {
              setError(prepParams.error);
              setStep(0);
              return;
            }
            const wcPrepRequest = wcPayloadMode === 'raw'
              ? { transaction: prepParams.transaction, sourceOutputs: prepParams.sourceOutputs as any }
              : { transaction: prepParams.transactionHex, sourceOutputs: prepParams.sourceOutputsJson as any };
            setStepNote('Step 1 of 2 — Approve "Prepare wallet for auction listing" in your wallet app, then the listing will follow.');
            const prepResult = await signTransaction({
              ...wcPrepRequest,
              broadcast: true,
              userPrompt: prepParams.userPrompt,
            });
            setStepNote('');
            if (!prepResult) {
              setError('Wallet prep was cancelled. Open your wallet app, approve the "Prepare wallet for auction listing" request, then click Create & List NFT again.');
              setStep(0);
              return;
            }
            const prepTxid = prepResult.signedTransactionHash;
            let prepConfirmed = false;
            for (let i = 0; i < 12; i++) {
              await new Promise(r => setTimeout(r, 2500));
              const check = await fetch(`/api/utxos?address=${encodeURIComponent(wallet.address)}`);
              const checkData = await check.json();
              const checkUtxos: Array<{ txid: string; vout: number }> = checkData.utxos || [];
              if (checkUtxos.some(u => u.txid === prepTxid && u.vout === 0)) {
                prepConfirmed = true;
                break;
              }
            }
            if (!prepConfirmed) {
              setError('Prep transaction not confirmed. Please try again.');
              setStep(0);
              return;
            }
            listingParams = await buildWcListingParams({
              address: wallet.address,
              tokenCategory,
              listingType: listingMode,
              price: listingMode === 'fixed' ? priceSats : undefined,
              minBid: listingMode === 'auction' ? minBidSats : undefined,
              endTime: listingMode === 'auction' ? BigInt(endTime) : undefined,
              royaltyBasisPoints: BigInt(royaltyBp),
              sellerPkh,
              creatorPkh,
              minBidIncrement: BigInt(MARKETPLACE_CONFIG.minBidIncrement),
            });
          }

          if ('error' in listingParams) {
            setError(listingParams.error);
            setStep(0);
            return;
          }

          try {
            const wcRequest = wcPayloadMode === 'raw'
              ? {
                  transaction: listingParams.transaction,
                  sourceOutputs: listingParams.sourceOutputs as any,
                }
              : {
                  transaction: listingParams.transactionHex,
                  sourceOutputs: listingParams.sourceOutputsJson as any,
                };

            const signResult = await signTransaction({
              ...wcRequest,
              broadcast: true,
              userPrompt: listingParams.userPrompt,
            });

            if (!signResult) {
              listingResult = { success: false, error: 'Listing transaction rejected by wallet' };
            } else {
              listingResult = {
                success: true,
                txid: signResult.signedTransactionHash,
                contractAddress: listingParams.contractAddress,
              };
            }
          } catch (signError: unknown) {
            const msg = signError instanceof Error
              ? signError.message
              : 'Wallet did not respond to listing request.';
            listingResult = { success: false, error: msg };
          }
        } else {
          // Internal wallet listing — delegated to server-side /api/list
          const walletData = loadWallet();
          if (!walletData) { setError('Wallet not found. Please reconnect.'); setStep(0); return; }

          sellerPkh = getPkhHex(walletData);
          creatorPkh = sellerPkh;

          const privateKeyHex = Buffer.from(walletData.privateKey).toString('hex');
          const listResponse = await fetch('/api/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              privateKeyHex,
              sellerPkh,
              sellerAddress: walletData.address,
              creatorPkh,
              tokenCategory,
              nftUtxo: {
                txid: nftUtxo.txid,
                vout: nftUtxo.vout,
                satoshis: nftUtxo.satoshis.toString(),
                commitment,
                capability: nftUtxo.token.nft.capability,
              },
              listingType: listingMode,
              price: listingMode === 'fixed' ? priceSats.toString() : '0',
              minBid: listingMode === 'auction' ? minBidSats.toString() : '0',
              endTime: listingMode === 'auction' ? endTime.toString() : '0',
              royaltyBasisPoints: royaltyBp.toString(),
              minBidIncrement: MARKETPLACE_CONFIG.minBidIncrement.toString(),
            }),
          });
          listingResult = await listResponse.json();
        }

        if (!sellerPkh || !creatorPkh) {
          setError('Failed to resolve seller/creator PKH');
          setStep(0);
          return;
        }

        if (!listingResult.success) {
          setError(listingResult.error || 'Listing failed');
          setStep(0);
          return;
        }

        const contractAddress = listingResult.contractAddress
          || (listingMode === 'fixed'
            ? buildMarketplaceContract(
                sellerPkh,
                priceSats,
                creatorPkh,
                BigInt(royaltyBp)
              ).address
            : buildAuctionContract(
                sellerPkh,
                minBidSats,
                BigInt(endTime),
                creatorPkh,
                BigInt(royaltyBp),
                BigInt(MARKETPLACE_CONFIG.minBidIncrement)
              ).address);

        setListingTxid(listingResult.txid || '');
        setStep(4);
      }
    } catch (err: unknown) {
      let msg = 'Unknown error occurred';
      if (err instanceof Error) {
        msg = err.message;
      } else if (typeof err === 'string') {
        msg = err;
      } else if (err && typeof err === 'object') {
        const e = err as Record<string, unknown>;
        msg = (e.message as string) || JSON.stringify(err) || msg;
        if (msg === '{}') msg = 'Request expired or was rejected by wallet. Please try again.';
      }
      setError(msg);
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
                {stepNote ? (
                  <p className="text-xs mb-6 font-medium px-4 py-2 rounded-lg" style={{ color: 'var(--accent)', background: 'rgba(0,229,69,0.07)', border: '1px solid rgba(0,229,69,0.2)' }}>
                    {stepNote}
                  </p>
                ) : (
                  <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
                    Please wait while your NFT is being created on Chipnet
                  </p>
                )}
                <div className="flex justify-center gap-2">
                  {steps.map((s, i) => (
                    <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${i + 1 < step ? 'badge-green' : i + 1 === step ? 'badge-blue animate-pulse' : ''
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
                {(mintTxid || listingTxid) && (
                  <div className="p-3 rounded-lg mb-6" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                    <div className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Mint TX</div>
                    <div className="text-xs font-mono break-all mb-2" style={{ color: 'var(--accent)' }}>{mintTxid || '—'}</div>
                    <div className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Listing TX</div>
                    <div className="text-xs font-mono break-all" style={{ color: 'var(--accent)' }}>{listingTxid || '—'}</div>
                  </div>
                )}
                <div className="flex gap-3">
                  {listingTxid && (
                    <a href={getExplorerTxUrl(listingTxid)} target="_blank" rel="noopener noreferrer"
                      className="btn-secondary flex-1 flex items-center justify-center gap-2 text-xs">
                      <ExternalLink className="h-3.5 w-3.5" /> View on Explorer
                    </a>
                  )}
                  <button onClick={() => { setStep(0); setName(''); setDescription(''); setCollectionName(''); setMintAsCollection(false); setAddToCollection(false); setSelectedMintingToken(null); removeMedia(); setPrice(''); setMinBid(''); setAttributes([]); setMintTxid(''); setListingTxid(''); }}
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
                Add PINATA_JWT to .env.local to enable IPFS uploads.
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${mediaType === 'image' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                  }`}
                style={mediaType === 'image' ? { background: 'var(--bg-hover)', border: '1px solid var(--border-light)' } : { border: '1px solid var(--border)' }}
              >
                <ImageIcon className="h-3.5 w-3.5" /> Image
              </button>
              <button
                onClick={() => { setMediaType('video'); removeMedia(); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${mediaType === 'video' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
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

            {/* Collection */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                <Library className="h-3.5 w-3.5" /> Collection <span style={{ color: 'var(--text-muted)' }}>(optional)</span>
              </label>
              <input type="text" value={collectionName} onChange={(e) => setCollectionName(e.target.value)}
                placeholder="e.g. Chipnet Creatures" className="input-field" maxLength={100} />
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Groups this NFT under a named collection in the marketplace
              </p>
            </div>

            {/* Mint as Collection toggle — hidden when adding to existing collection */}
            {!addToCollection && (
              <div
                onClick={() => setMintAsCollection(!mintAsCollection)}
                className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all"
                style={{
                  borderColor: mintAsCollection ? 'var(--accent)' : 'var(--border)',
                  background: mintAsCollection ? 'rgba(0,229,69,0.04)' : 'transparent',
                }}
              >
                <div className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 transition-colors ${mintAsCollection ? 'border-[var(--accent)]' : 'border-[var(--text-muted)]'}`}
                  style={{ background: mintAsCollection ? 'var(--accent)' : 'transparent' }}>
                  {mintAsCollection && <Check className="h-3 w-3 text-black" />}
                </div>
                <div>
                  <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                    Mint as Collection Token
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Creates a minting-capability NFT — use it to mint more items under the same token category (on-chain collection)
                  </div>
                </div>
              </div>
            )}

            {/* Add to existing on-chain collection */}
            {wallet?.isConnected && (loadingMintingTokens || mintingTokens.length > 0) && (
              <div>
                <div
                  onClick={() => { setAddToCollection(!addToCollection); setSelectedMintingToken(null); setMintAsCollection(false); }}
                  className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all"
                  style={{
                    borderColor: addToCollection ? 'var(--accent-blue)' : 'var(--border)',
                    background: addToCollection ? 'rgba(59,130,246,0.05)' : 'transparent',
                  }}
                >
                  <div className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 transition-colors`}
                    style={{
                      borderColor: addToCollection ? 'var(--accent-blue)' : 'var(--text-muted)',
                      background: addToCollection ? 'var(--accent-blue)' : 'transparent',
                    }}>
                    {addToCollection && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                      Add to existing on-chain collection
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {loadingMintingTokens
                        ? 'Loading your collections...'
                        : `Mint under an existing minting token (${mintingTokens.length} available)`}
                    </div>
                  </div>
                </div>

                {addToCollection && mintingTokens.length > 0 && (
                  <div className="mt-2">
                    <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
                      Select collection
                    </label>
                    <div className="space-y-1.5">
                      {mintingTokens.map((token) => (
                        <button
                          key={token.category}
                          onClick={() => setSelectedMintingToken(token)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all"
                          style={{
                            borderColor: selectedMintingToken?.category === token.category ? 'var(--accent-blue)' : 'var(--border)',
                            background: selectedMintingToken?.category === token.category ? 'rgba(59,130,246,0.08)' : 'var(--bg-secondary)',
                          }}
                        >
                          <div className="w-7 h-7 rounded shrink-0 flex items-center justify-center text-[10px] font-bold"
                            style={{ background: 'var(--bg-hover)', color: 'var(--accent-blue)' }}>
                            {token.collectionName.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{token.collectionName}</div>
                            <div className="text-[10px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>{token.category.slice(0, 16)}…</div>
                          </div>
                          {selectedMintingToken?.category === token.category && (
                            <Check className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--accent-blue)' }} />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

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
