import Link from 'next/link';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'About the workshop',
  description:
    'Harbour & Pine designs, builds and fits bespoke joinery for older homes in Bristol and Bath, from first measure to final fitting by our own team.',
  path: '/about',
});

export default function About() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="font-heading text-5xl">Designed, built and fitted by us</h1>
      <p className="text-muted mt-6 text-lg">
        Every piece starts with a visit and a tape measure. We draw it, build it in our workshop and fit it ourselves.
      </p>
      <Link href="/contact" className="text-primary mt-8 inline-block underline">
        Talk to the workshop
      </Link>
    </section>
  );
}
