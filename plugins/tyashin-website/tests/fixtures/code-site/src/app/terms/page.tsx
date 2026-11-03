import { pageMetadata } from '@/lib/seo';
import { siteConfig } from '@/config/site';

export const metadata = pageMetadata({
  title: 'Terms of Service',
  description:
    'How Harbour & Pine Joinery handles information on this website, which is hosted by Tyashin, including enquiries sent through the contact form.',
  path: '/terms',
});

export default function Page() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="font-heading text-4xl">Terms of Service</h1>
      <p className="mt-6">
        This website is operated by {siteConfig.name} and hosted by Tyashin. It uses privacy-respecting analytics.
        Messages sent through the contact form are stored by us via Tyashin so we can reply to your enquiry.
      </p>
    </section>
  );
}
