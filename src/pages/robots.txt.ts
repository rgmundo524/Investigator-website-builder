import { site } from 'astro:config/server';
import { includeDrafts } from '../lib/content';

export function GET() {
  // Allow crawling so engines can read the HTML noindex directive while staged.
  const sitemap = import.meta.env.SITE_INDEXING_ENABLED === true && !includeDrafts ? `Sitemap: ${site!.replace(/\/$/, '')}/sitemap-index.xml\n` : '';
  return new Response(`User-agent: *\nAllow: /\n${sitemap}`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
