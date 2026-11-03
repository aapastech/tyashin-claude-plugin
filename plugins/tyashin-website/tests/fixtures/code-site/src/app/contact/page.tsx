import { pageMetadata } from '@/lib/seo';
import { siteConfig } from '@/config/site';
import { LeadForm } from '@/components/LeadForm';

export const metadata = pageMetadata({
  title: 'Contact the workshop',
  description:
    'Call or email Harbour & Pine Joinery about fitted wardrobes, shelving or kitchens in Bristol and Bath. Workshop hours Monday to Friday, 8:00 to 17:00.',
  path: '/contact',
});

export default function Contact() {
  const apiUrl = process.env.TYASHIN_API_URL ?? '';
  const apiKey = process.env.TYASHIN_API_KEY ?? '';
  return (
    <section className="mx-auto grid max-w-6xl gap-12 px-6 py-24 md:grid-cols-2">
      <div>
        <h1 className="font-heading text-5xl">Talk to the workshop</h1>
        <p className="mt-6">
          <a href={siteConfig.phoneHref}>{siteConfig.phoneDisplay}</a>
        </p>
        <p>
          <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>
        </p>
        <p className="text-muted">{siteConfig.hours}</p>
      </div>
      <LeadForm apiUrl={apiUrl} apiKey={apiKey} />
    </section>
  );
}
