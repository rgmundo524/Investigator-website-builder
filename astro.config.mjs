import { defineConfig } from 'astro/config';
import caseSearch from './integrations/case-search';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import icon from 'astro-icon';
import { resolveSiteData, builderRoot } from './scripts/site-data';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const data = resolveSiteData();
const outDir = process.env.CONTENT_PREVIEW === 'drafts' ? './dist-drafts' : './dist';
let resolvedOutputDirectory = new URL(`${outDir}/`, import.meta.url);
const sitemapOutput = { name: 'sitemap-output-directory', hooks: {
  'astro:config:done': ({ config }) => { resolvedOutputDirectory = config.outDir; },
} };

const sitemapIntegration = sitemap({
  filter: (page) => {
    const pathname = new URL(page).pathname;
    if (!['/expertise/', '/articles/'].includes(pathname)) return true;
    // Astro.redirect() inside a page produces HTML rather than a redirect route.
    // Inspect these legacy URLs after rendering so a future real Articles page stays listed.
    const html = readFileSync(fileURLToPath(new URL(`${pathname.slice(1)}index.html`, resolvedOutputDirectory)), 'utf8');
    return !/<meta\b[^>]*\bhttp-equiv\s*=\s*["']refresh["']/i.test(html);
  },
});

const allowedHosts = (process.env.TAILSCALE_HOSTNAME ?? '')
  .split(',').map((host) => host.trim()).filter(Boolean);

export default defineConfig({
  site: data.url,
  publicDir: data.publicDir,
  cacheDir: `./.astro/cache/${data.cacheKey}/${process.env.CONTENT_PREVIEW === 'drafts' ? 'drafts' : 'published'}/`,
  vite: {
    define: { 'import.meta.env.SITE_INDEXING_ENABLED': JSON.stringify(data.indexing) },
    resolve: { alias: { '@site-assets': data.assetsDir, '@components': path.join(builderRoot, 'src/components') } },
    server: { fs: { allow: [builderRoot, data.contentDir, data.assetsDir] } },
  },
  output: 'static',
  integrations: [mdx(), sitemapOutput, sitemapIntegration, icon({ include: { lucide: ['house', 'briefcase-business', 'search', 'badge-check', 'fingerprint', 'book-open', 'mail', 'moon', 'sun', 'arrow-right', 'arrow-up-right', 'external-link', 'lightbulb', 'circle-alert', 'chevron-down', 'chevron-left', 'chevron-right', 'pause', 'play', 'circle', 'star', 'code', 'database', 'terminal', 'network', 'chart-no-axes-combined', 'chart-pie', 'hand-heart', 'users', 'landmark', 'bike', 'beer', 'box', 'mountain-snow', 'server', 'puzzle', 'shield-check'] } }), caseSearch()],
  trailingSlash: 'always',
  outDir,
  server: { host: '127.0.0.1', port: 4321, allowedHosts },
});
