import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const builderRoot = fileURLToPath(new URL('../', import.meta.url));

export type SiteEnvironment = Readonly<Record<string, string | undefined>>;

export type SiteSettings = {
  url: string;
  language: string;
  locale: string;
  ogLocale: string;
  appearance: { defaultTheme: 'dark' | 'light'; particles: boolean };
};

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function origin(value: unknown, source: string): string {
  let url: URL;
  try {
    if (typeof value !== 'string' || !value.trim()) throw new Error();
    url = new URL(value);
  } catch { throw new Error(`${source}: url must be an absolute HTTP(S) website URL.`); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password
    || url.search || url.hash || url.pathname !== '/') {
    throw new Error(`${source}: use an HTTP(S) origin without credentials, a path, query, or fragment.`);
  }
  return url.origin;
}

function localeTag(value: unknown, source: string): string {
  try {
    if (typeof value !== 'string' || !value.trim() || value.length > 128) throw new Error();
    const [canonical] = Intl.getCanonicalLocales(value);
    if (!canonical) throw new Error();
    return canonical;
  } catch { throw new Error(`${source}: expected a valid BCP 47 language tag, such as en or en-US.`); }
}

function choice<T extends string>(value: unknown, allowed: readonly T[], source: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`${source}: expected ${allowed.join(' or ')}.`);
  }
  return value as T;
}

function boolean(value: unknown, source: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${source}: expected true or false.`);
  return value;
}

// The deployed URL may differ from the origin in a local template.
export function resolveSiteSettings(config: unknown, env: SiteEnvironment = process.env, source = 'site.json'): SiteSettings {
  if (!object(config) || config.version !== 1
    || Object.keys(config).some((key) => !['version', 'url', 'language', 'locale', 'appearance'].includes(key))) {
    throw new Error(`${source}: expected version 1 site settings with a url and supported optional settings. See docs/site-configuration.md.`);
  }
  const appearance = config.appearance === undefined ? {} : config.appearance;
  if (!object(appearance) || Object.keys(appearance).some((key) => !['defaultTheme', 'particles'].includes(key))) {
    throw new Error(`${source}: appearance supports only defaultTheme and particles.`);
  }
  const configuredUrl = origin(config.url, source);
  const language = config.language === undefined ? 'en' : localeTag(config.language, `${source}: language`);
  const locale = config.locale === undefined ? (language === 'en' ? 'en-US' : language) : localeTag(config.locale, `${source}: locale`);
  const expandedLocale = new Intl.Locale(locale).maximize();
  const urlOverride = env.SITE_URL?.trim();
  return {
    url: urlOverride ? origin(urlOverride, 'SITE_URL') : configuredUrl,
    language,
    locale,
    ogLocale: expandedLocale.region ? `${expandedLocale.language}_${expandedLocale.region}` : expandedLocale.language,
    appearance: {
      defaultTheme: appearance.defaultTheme === undefined ? 'dark' : choice(appearance.defaultTheme, ['dark', 'light'], `${source}: appearance.defaultTheme`),
      particles: appearance.particles === undefined ? true : boolean(appearance.particles, `${source}: appearance.particles`),
    },
  };
}

export function robotsDirective(context: { includeDrafts?: boolean; development?: boolean } = {}): string {
  return context.includeDrafts || context.development ? 'noindex, nofollow' : 'index, follow';
}

export function resolveSiteData(value: string | undefined = undefined, root = builderRoot, env: SiteEnvironment = process.env) {
  const selected = path.resolve(root, (value ?? env.SITE_DATA_DIR)?.trim() || 'templates/investigator-site');
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
  let config: unknown;
  try { config = JSON.parse(readFileSync(configFile, 'utf8')); }
  catch { throw new Error(`${configFile}: expected valid JSON site settings.`); }
  const settings = resolveSiteSettings(config, env, configFile);
  for (const name of ['assets', 'public']) {
    const directory = path.join(dataDir, name);
    if (existsSync(directory) && !statSync(directory).isDirectory()) throw new Error(`Expected a directory: ${directory}`);
  }
  // Different sources must not reuse identical Markdown digests with old file paths.
  const cacheKey = createHash('sha256').update(dataDir).digest('hex').slice(0, 16);
  return { dataDir, contentDir, assetsDir: path.join(dataDir, 'assets'), publicDir: path.join(dataDir, 'public'), url: settings.url, settings, cacheKey };
}
