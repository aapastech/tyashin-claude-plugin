import type { Metadata } from 'next';
import { siteConfig } from '@/config/site';

export const SITE = {
  name: siteConfig.name,
  domain: process.env.NEXT_PUBLIC_SITE_DOMAIN || 'harbour-and-pine.sites.tyashin.com',
  defaultOgImage: '/og.svg',
  locale: 'en_GB',
};

export function siteUrl(path = '/'): string {
  const base = `https://${SITE.domain}`;
  const p = path === '/' ? '' : `/${path.replace(/^\/+/, '')}`;
  return `${base}${p}`;
}

export function pageMetadata(opts: {
  title?: string;
  description: string;
  path: string;
  type?: 'website' | 'article';
}): Metadata {
  const url = siteUrl(opts.path);
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url },
    openGraph: {
      type: opts.type || 'website',
      url,
      siteName: SITE.name,
      title: opts.title || SITE.name,
      description: opts.description,
      locale: SITE.locale,
      images: [{ url: SITE.defaultOgImage }],
    },
    twitter: { card: 'summary_large_image', title: opts.title || SITE.name, description: opts.description },
  };
}
