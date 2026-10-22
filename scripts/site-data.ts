import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const builderRoot = fileURLToPath(new URL('../', import.meta.url));
export const defaultDataDirectory = 'examples/site-data';

export function resolveSiteData(value = process.env.SITE_DATA_DIR, root = builderRoot) {
  const selected = path.resolve(root, value?.trim() || defaultDataDirectory);
  if (!existsSync(selected) || !statSync(selected).isDirectory()) {
    throw new Error(`SITE_DATA_DIR is not a directory: ${selected}`);
  }
  const dataDir = realpathSync(selected);
  const contentDir = path.join(dataDir, 'content');
  if (!existsSync(contentDir) || !statSync(contentDir).isDirectory()) {
    throw new Error(`Missing content directory: ${contentDir}. See docs/external-content.md.`);
  }
  const configFile = path.join(dataDir, 'site.json');
  if (!existsSync(configFile)) throw new Error(`Missing site settings: ${configFile}`);
  const config = JSON.parse(readFileSync(configFile, 'utf8'));
  if (!config || config.version !== 1 || typeof config.url !== 'string'
    || Object.keys(config).some((key) => !['version', 'url', 'indexing', 'case_networks'].includes(key))) {
    throw new Error(`${configFile}: expected version, url, and optional indexing/case_networks settings.`);
  }
  if (config.indexing !== undefined && typeof config.indexing !== 'boolean') {
    throw new Error(`${configFile}: indexing must be true or false.`);
  }
  if (config.case_networks !== undefined && (!Array.isArray(config.case_networks)
    || !config.case_networks.length
    || config.case_networks.some((id: unknown) => typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))
    || new Set(config.case_networks).size !== config.case_networks.length)) {
    throw new Error(`${configFile}: case_networks must contain unique lowercase hyphenated network IDs.`);
  }
  let url: URL;
  try { url = new URL(config.url); }
  catch { throw new Error(`${configFile}: url must be an absolute HTTP(S) website URL.`); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password
    || url.search || url.hash || url.pathname !== '/') {
    throw new Error(`${configFile}: use an HTTP(S) origin without credentials, a path, query, or fragment.`);
  }
  for (const name of ['assets', 'public']) {
    const directory = path.join(dataDir, name);
    if (existsSync(directory) && !statSync(directory).isDirectory()) throw new Error(`Expected a directory: ${directory}`);
  }
  // Different sources must not reuse identical Markdown digests with old file paths.
  const cacheKey = createHash('sha256').update(dataDir).digest('hex').slice(0, 16);
  return { dataDir, contentDir, assetsDir: path.join(dataDir, 'assets'), publicDir: path.join(dataDir, 'public'), url: url.origin, cacheKey,
    indexing: config.indexing === true, caseNetworks: config.case_networks as string[] | undefined };
}
