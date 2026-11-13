import { site } from 'astro:config/server';
import { includeDrafts } from '../lib/content';

export function GET() {
  const sitemap = includeDrafts || import.meta.env.DEV ? '' : `Sitemap: ${site!.replace(/\/$/, '')}/sitemap-index.xml\n`;
  return new Response(`User-agent: *\nAllow: /\n${sitemap}`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
