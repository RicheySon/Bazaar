'use client';

import { ShieldCheck } from 'lucide-react';

interface VerifiedBadgeProps {
  size?: 'sm' | 'md';
  className?: string;
}

export function VerifiedBadge({ size = 'sm', className = '' }: VerifiedBadgeProps) {
  const isSmall = size === 'sm';
  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold rounded px-1.5 py-0.5 ${className}`}
      style={{
        background: 'color-mix(in srgb, var(--accent-blue) 12%, transparent)',
        color: 'var(--accent-blue)',
        fontSize: isSmall ? '10px' : '11px',
      }}
      title="Verified by BCMR (Bitcoin Cash Metadata Registry)"
    >
      <ShieldCheck className={isSmall ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      Verified
    </span>
  );
}
