import type { Metadata } from 'next';
import { Cormorant_Garamond, Manrope } from 'next/font/google';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { SITE, siteUrl } from '@/lib/seo';
import { siteConfig } from '@/config/site';
import './globals.css';

const heading = Cormorant_Garamond({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-heading', display: 'swap' });
const body = Manrope({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl('/')),
  title: { default: SITE.name, template: `%s · ${SITE.name}` },
  description: siteConfig.description,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`} style={{ backgroundColor: '#f8f5ef' }}>
      <body className="font-body bg-background text-foreground antialiased" style={{ backgroundColor: '#f8f5ef' }}>
        <Header />
        <main className="min-h-screen overflow-x-clip">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
