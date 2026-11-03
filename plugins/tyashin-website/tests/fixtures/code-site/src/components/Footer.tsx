import Link from 'next/link';
import { siteConfig } from '@/config/site';

export function Footer() {
  return (
    <footer className="bg-ink mt-24 px-6 py-12 text-white/80">
      <div className="mx-auto flex max-w-6xl flex-wrap gap-6 text-sm">
        <Link href="/about">About</Link>
        <Link href="/contact">Contact</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </div>
      <p className="mt-8 text-center text-xs text-white/60">
        © {siteConfig.name}. Powered by{' '}
        <a href="https://tyashin.com" target="_blank" rel="noopener" className="hover:underline">
          Tyashin
        </a>
      </p>
    </footer>
  );
}
