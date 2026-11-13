import { defineConfig } from 'astro/config';
import caseSearch from './integrations/case-search';
import imagePrivacy from './integrations/image-privacy';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import icon from 'astro-icon';
import { resolveSiteData, builderRoot } from './scripts/site-data';
import { astroWorkspace, prepareAstroWorkspace } from './scripts/astro-workspace';
import path from 'node:path';

const data = resolveSiteData();
const workspace = astroWorkspace(data.cacheKey);
prepareAstroWorkspace(workspace);

const allowedHosts = (process.env.TAILSCALE_HOSTNAME ?? '')
  .split(',').map((host) => host.trim()).filter(Boolean);

export default defineConfig({
  // Astro dev writes generated content below root/.astro, independently of
  // cacheDir. A site-specific root prevents one running preview replacing
  // another site's content; source files and output remain in the builder.
  ...workspace,
  site: data.url,
  publicDir: data.publicDir,
  vite: {
    define: { __SITE_SETTINGS__: JSON.stringify(data.settings) },
    resolve: { alias: { '@site-assets': data.assetsDir, '@components': path.join(builderRoot, 'src/components') } },
    server: { fs: { allow: [builderRoot, data.contentDir, data.assetsDir] } },
  },
  output: 'static',
  integrations: [mdx(), ...(process.env.CONTENT_PREVIEW === 'drafts' ? [] : [sitemap({ filter: page => !['/404/', '/404.html'].includes(new URL(page).pathname) })]), icon({ include: { lucide: ['*'] } }), caseSearch(), imagePrivacy()],
  trailingSlash: 'always',
  server: { host: '127.0.0.1', port: 4321, allowedHosts },
});
