'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { isVideoUrl } from '@/lib/utils';

interface MediaDisplayProps {
  src: string;
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  className?: string;
  sizes?: string;
  /** Explicit MIME type from metadata (e.g. "video/mp4") — skips probe if provided */
  mimeType?: string;
}

// Module-level cache so probes survive re-renders and are shared across component instances
const ctCache = new Map<string, 'video' | 'image'>();

function guessFromMimeType(mimeType?: string): 'video' | 'image' | null {
  if (!mimeType) return null;
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('image/')) return 'image';
  return null;
}

/**
 * Renders a <video> for video content and <Image> for images.
 * Detection order:
 *   1. mimeType prop (from NFT metadata)
 *   2. URL file extension (.mp4 / .webm / etc.)
 *   3. HTTP HEAD content-type probe (handles bare IPFS CID URLs)
 */
export function MediaDisplay({ src, alt, fill, width, height, className, sizes, mimeType }: MediaDisplayProps) {
  const initial: 'video' | 'image' =
    guessFromMimeType(mimeType) ?? (isVideoUrl(src) ? 'video' : 'image');

  const [mediaKind, setMediaKind] = useState<'video' | 'image'>(initial);

  useEffect(() => {
    if (!src) return;
    // Already determined from mimeType prop or file extension
    if (guessFromMimeType(mimeType) !== null || isVideoUrl(src)) return;

    // Check cache first
    const cached = ctCache.get(src);
    if (cached) { setMediaKind(cached); return; }

    // Probe content-type via HEAD request (Pinata gateway supports CORS)
    const controller = new AbortController();
    fetch(src, { method: 'HEAD', signal: controller.signal })
      .then((r) => {
        const ct = r.headers.get('content-type') || '';
        const kind: 'video' | 'image' = ct.startsWith('video/') ? 'video' : 'image';
        ctCache.set(src, kind);
        setMediaKind(kind);
      })
      .catch(() => {
        ctCache.set(src, 'image');
      });

    return () => controller.abort();
  }, [src, mimeType]);

  if (mediaKind === 'video') {
    return (
      <video
        src={src}
        autoPlay
        loop
        muted
        playsInline
        className={className}
        style={fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' } : undefined}
        width={!fill ? (width ?? undefined) : undefined}
        height={!fill ? (height ?? undefined) : undefined}
      />
    );
  }

  if (fill) {
    return (
      <Image src={src} alt={alt} fill className={className} sizes={sizes} style={{ objectFit: 'cover' }} />
    );
  }

  return (
    <Image src={src} alt={alt} width={width ?? 40} height={height ?? 40} className={className} sizes={sizes} />
  );
}
