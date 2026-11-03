import { getSiteRoutes } from '@/lib/site-routes';
import { siteUrl } from '@/lib/seo';

export const dynamic = 'force-static';

export function GET() {
  const urls = getSiteRoutes()
    .map((r) => `<url><loc>${siteUrl(r.path)}</loc><priority>${r.priority.toFixed(1)}</priority></url>`)
    .join('');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    { headers: { 'Content-Type': 'application/xml' } }
  );
}
