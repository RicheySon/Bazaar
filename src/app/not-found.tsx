import Link from 'next/link';
import { Search, Home, Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-8xl font-black mb-4 tabular-nums"
          style={{ color: 'var(--accent)', opacity: 0.15, lineHeight: 1 }}>
          404
        </div>
        <h1 className="text-2xl font-bold mb-2 -mt-8" style={{ color: 'var(--text-primary)' }}>
          Page not found
        </h1>
        <p className="text-sm mb-8 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          The collection, NFT, or page you&apos;re looking for doesn&apos;t exist or may have been removed.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/explore"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white w-full sm:w-auto justify-center"
            style={{ background: 'var(--accent)' }}
          >
            <Compass className="h-4 w-4" />
            Explore Market
          </Link>
          <Link
            href="/collections"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border transition-colors hover:border-[var(--accent)] w-full sm:w-auto justify-center"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <Search className="h-4 w-4" />
            Browse Collections
          </Link>
          <Link
            href="/"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border transition-colors hover:border-[var(--accent)] w-full sm:w-auto justify-center"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <Home className="h-4 w-4" />
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
