import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { builderRoot, type SiteEnvironment } from './site-data';

/** Keep Astro's generated modules and dev content store separate for every site. */
export function astroWorkspace(cacheKey: string, root = builderRoot, env: SiteEnvironment = process.env) {
  const mode = env.CONTENT_PREVIEW === 'drafts' ? 'drafts' : 'published';
  const workspace = path.join(root, '.astro', 'sites', cacheKey, mode);
  return {
    root: workspace,
    srcDir: path.join(root, 'src'),
    cacheDir: path.join(workspace, 'cache'),
    outDir: path.join(root, mode === 'drafts' ? 'dist-drafts' : 'dist'),
  };
}

/** Root-aware integrations inspect package metadata; mirror it without sharing caches. */
export function prepareAstroWorkspace(workspace: ReturnType<typeof astroWorkspace>, root = builderRoot) {
  mkdirSync(workspace.root, { recursive: true });
  const filename = path.join(workspace.root, 'package.json');
  const source = readFileSync(path.join(root, 'package.json'), 'utf8');
  let previous: string | undefined;
  try { previous = readFileSync(filename, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (previous !== source) writeFileSync(filename, source);
}
