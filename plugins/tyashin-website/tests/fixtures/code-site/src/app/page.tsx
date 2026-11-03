import Link from 'next/link';
import { pageMetadata } from '@/lib/seo';
import { siteConfig } from '@/config/site';

export const metadata = pageMetadata({
  title: 'Fitted joinery for older homes',
  description:
    'Made-to-measure wardrobes, alcove shelving and kitchens in solid oak and tulipwood, built in our workshop and fitted in Bristol and Bath homes.',
  path: '/',
});

export default function Home() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <p className="text-accent text-xs tracking-[0.3em] uppercase">{siteConfig.areas}</p>
      <h1 className="font-heading hero-in mt-4 text-6xl">Joinery that fits the house you have</h1>
      <p className="text-muted mt-6 max-w-xl text-lg">{siteConfig.description}</p>
      <div className="mt-10 flex gap-4">
        <a href={siteConfig.phoneHref} className="bg-primary text-primary-contrast rounded-md px-5 py-3">
          Call the workshop
        </a>
        <Link href="/about" className="border-border rounded-md border px-5 py-3">
          About the workshop
        </Link>
      </div>
    </section>
  );
}
