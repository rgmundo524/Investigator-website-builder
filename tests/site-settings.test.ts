import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveSiteData, resolveSiteSettings, robotsDirective } from '../scripts/site-data';

const basic = { version: 1, url: 'https://investigator.example' };

test('version 1 settings provide focused defaults for an investigator site', () => {
  assert.deepEqual(resolveSiteSettings(basic, {}), {
    url: 'https://investigator.example', language: 'en', locale: 'en-US', ogLocale: 'en_US',
    appearance: { defaultTheme: 'dark', particles: true },
  });
});

test('site settings select language, formatting locale and the shared appearance controls', () => {
  const settings = resolveSiteSettings({ ...basic, language: 'fr-ca', locale: 'fr-ca',
    appearance: { defaultTheme: 'light', particles: false } }, {});
  assert.equal(settings.language, 'fr-CA');
  assert.equal(settings.locale, 'fr-CA');
  assert.equal(settings.ogLocale, 'fr_CA');
  assert.deepEqual(settings.appearance, { defaultTheme: 'light', particles: false });
  assert.equal(resolveSiteSettings({ ...basic, language: 'es-MX' }, {}).locale, 'es-MX');
});

test('SITE_URL overrides the deployment origin without modifying the site file', () => {
  const config = { ...basic, language: 'fr', locale: 'fr-FR', appearance: { particles: false } };
  const original = structuredClone(config);
  const settings = resolveSiteSettings(config, { SITE_URL: ' https://another.example/ ' });
  assert.equal(settings.url, 'https://another.example');
  assert.equal(settings.language, 'fr');
  assert.equal(settings.locale, 'fr-FR');
  assert.equal(settings.appearance.particles, false);
  assert.deepEqual(config, original);
  assert.equal(resolveSiteSettings(config, { SITE_URL: '  ' }).url, basic.url);
});

test('invalid settings fail visibly instead of silently falling back or being masked by an origin override', () => {
  const invalid: unknown[] = [null, [], { ...basic, version: 2 }, { ...basic, typo: true },
    { ...basic, appearance: null }, { ...basic, appearance: { color: 'red' } },
    { ...basic, appearance: { defaultTheme: 'automatic' } }, { ...basic, appearance: { particles: 'false' } },
    { ...basic, language: '' }, { ...basic, language: 'en_US' }, { ...basic, locale: 'not_a_locale' },
  ];
  for (const config of invalid) assert.throws(() => resolveSiteSettings(config, {}));
  for (const url of ['not-a-url', 'javascript:alert(1)', 'https://user:pass@example.com',
    'https://investigator.example/path', 'https://investigator.example/?query=yes', 'https://investigator.example/#fragment']) {
    assert.throws(() => resolveSiteSettings({ ...basic, url }, { SITE_URL: basic.url }), /HTTP\(S\)/);
    assert.throws(() => resolveSiteSettings(basic, { SITE_URL: url }), /SITE_URL.*HTTP\(S\)/);
  }
});

test('normal builds permit indexing while development and draft previews do not', () => {
  assert.equal(robotsDirective(), 'index, follow');
  assert.equal(robotsDirective({ includeDrafts: false, development: false }), 'index, follow');
  assert.equal(robotsDirective({ includeDrafts: true }), 'noindex, nofollow');
  assert.equal(robotsDirective({ development: true }), 'noindex, nofollow');
  assert.equal(robotsDirective({ includeDrafts: true, development: true }), 'noindex, nofollow');
});

test('the default selector uses the investigator template and explicit invalid selections never fall back', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'investigator-settings-'));
  try {
    for (const name of ['templates/investigator-site', 'another-investigator']) {
      await mkdir(path.join(root, name, 'content'), { recursive: true });
      await writeFile(path.join(root, name, 'site.json'), JSON.stringify({ ...basic, locale: 'en-GB' }));
    }
    const template = path.join(root, 'templates/investigator-site');
    assert.equal(resolveSiteData(undefined, root, {}).dataDir, template);
    assert.equal(resolveSiteData('', root, {}).dataDir, template);
    assert.equal(resolveSiteData(undefined, root, { SITE_DATA_DIR: '  ' }).dataDir, template);
    const selected = resolveSiteData(undefined, root, { SITE_DATA_DIR: 'another-investigator', SITE_URL: 'https://selected.example' });
    assert.equal(selected.dataDir, path.join(root, 'another-investigator'));
    assert.equal(selected.url, 'https://selected.example');
    assert.equal(selected.settings.locale, 'en-GB');
    assert.notEqual(selected.cacheKey, resolveSiteData(undefined, root, {}).cacheKey);
    assert.equal(JSON.parse(await readFile(path.join(selected.dataDir, 'site.json'), 'utf8')).url, basic.url);
    assert.throws(() => resolveSiteData('missing', root, {}), /SITE_DATA_DIR is not a directory/);
    assert.throws(() => resolveSiteData('.', root, {}), /Missing content directory/);
    await writeFile(path.join(root, 'another-investigator/site.json'), '{invalid');
    assert.throws(() => resolveSiteData('another-investigator', root, {}), /another-investigator[/\\]site.json: expected valid JSON/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
