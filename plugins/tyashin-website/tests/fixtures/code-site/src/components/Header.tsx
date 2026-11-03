import Link from 'next/link';
import { siteConfig } from '@/config/site';

export function Header() {
  return (
    <header className="border-border bg-background/90 sticky top-0 z-50 border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-heading text-primary text-xl">
          {siteConfig.name}
        </Link>
        <nav className="flex gap-6 text-sm">
          <Link href="/about">About</Link>
          <Link href="/contact">Contact</Link>
        </nav>
      </div>
    </header>
  );
}
