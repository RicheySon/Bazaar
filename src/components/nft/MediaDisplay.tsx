'use client';

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
  /** If true, renders as a plain <img> instead of next/image (for non-fill usage without fixed dimensions) */
  plain?: boolean;
}

/**
 * Renders a <video> for video URLs (.mp4 / .webm / etc.) and <Image> otherwise.
 */
export function MediaDisplay({ src, alt, fill, width, height, className, sizes, plain }: MediaDisplayProps) {
  if (isVideoUrl(src)) {
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

  if (plain) {
    return <img src={src} alt={alt} className={className} />;
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
