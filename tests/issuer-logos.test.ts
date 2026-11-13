import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { schemas } from '../src/content/schemas';

const root = fileURLToPath(new URL('..', import.meta.url));
const page = { slug: 'credentials', title: 'Credentials', profile: 'example', description_short: 'Education and training.' };
const logo = { issuer: 'TRM Labs', image: 'trm-labs.png', alt: 'TRM Labs logo' };

test('issuer logos are optional local images, with one accessible logo per normalized issuer', () => {
  assert.deepEqual(schemas.pages.parse(page).issuer_logos, []);
  for (const image of ['issuer.png', 'issuer.jpg', 'issuer.jpeg', 'issuer.webp']) {
    assert.deepEqual(schemas.pages.parse({ ...page, issuer_logos: [{ ...logo, image }] }).issuer_logos,
      [{ ...logo, image }]);
  }
  for (const image of ['../issuer.png', '/issuer.png', 'organizations/issuer.png', 'https://example.com/logo.png', '..%2fissuer.png', 'Issuer.png', 'issuer.svg', 'issuer.exe']) {
    assert.equal(schemas.pages.safeParse({ ...page, issuer_logos: [{ ...logo, image }] }).success, false, image);
  }
  for (const issuerLogos of [
    [logo, { ...logo, issuer: ' trm   LABS ' }],
    [{ ...logo, issuer: ' ' }],
    [{ issuer: logo.issuer, image: logo.image }],
    [{ ...logo, alt: ' ' }],
    [{ ...logo, source_url: 'https://example.com/logo.png' }],
  ]) assert.equal(schemas.pages.safeParse({ ...page, issuer_logos: issuerLogos }).success, false);
});

test('issuer headings render one matching optimized logo and leave other groups without a tile', { timeout: 60_000 }, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'issuer-logo-render-'));
  try {
    for (const directory of ['src/pages', 'src/components', 'src/lib', 'assets/organizations']) {
      await mkdir(path.join(temporary, directory), { recursive: true });
    }
    await symlink(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    await cp(path.join(root, 'src/components/CredentialGroups.astro'), path.join(temporary, 'src/components/CredentialGroups.astro'));
    for (const name of ['credentials.ts', 'image-privacy.ts']) {
      await cp(path.join(root, 'src/lib', name), path.join(temporary, 'src/lib', name));
    }
    await cp(path.join(root, 'tests/fixtures/image-privacy/gps-photo.png'), path.join(temporary, 'assets/organizations/trm-labs.png'));
    await writeFile(path.join(temporary, 'package.json'), '{"type":"module"}');
    await writeFile(path.join(temporary, 'astro.config.mjs'), `
import { defineConfig } from 'astro/config';
export default defineConfig({
  output: 'static',
  cacheDir: './.astro-cache',
  vite: { resolve: { alias: { '@site-assets': ${JSON.stringify(path.join(temporary, 'assets'))} } } },
});
`);
    // The group renderer is under test; individual credential cards have their
    // own renderer and do not affect issuer matching or logo placement.
    await writeFile(path.join(temporary, 'src/components/ContentEntry.astro'), `---
const { entry } = Astro.props;
---
<article id={entry.id}>{entry.data.name}</article>
`);
    await writeFile(path.join(temporary, 'src/pages/index.astro'), `---
import CredentialGroups from '../components/CredentialGroups.astro';
const entries = [
  { id: 'first', data: { issuer: 'TRM Labs', name: 'First credential', issued_year: 2024 } },
  { id: 'second', data: { issuer: ' trm   labs ', name: 'Second credential', issued_year: 2025 } },
  { id: 'other', data: { issuer: 'Other Authority', name: 'Other credential', issued_year: 2026 } },
];
const issuerLogos = [
  { issuer: ' TRM  LABS ', image: 'trm-labs.png', alt: 'TRM Labs logo' },
  { issuer: 'Unused Authority', image: 'not-used.png', alt: 'Unused authority logo' },
];
---
<CredentialGroups entries={entries} issuerOrder={['TRM Labs']} issuerLogos={issuerLogos} />
`);
    const build = spawnSync(process.execPath, [await realpath(path.join(root, 'node_modules/.bin/astro')), 'build'], {
      cwd: temporary, encoding: 'utf8', timeout: 55_000, env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
    });
    assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
    const html = await readFile(path.join(temporary, 'dist/index.html'), 'utf8');
    const trm = html.match(/<section[^>]*aria-labelledby="credential-issuer-trm-labs-\d+"[^>]*>[\s\S]*?<\/section>/)?.[0];
    const other = html.match(/<section[^>]*aria-labelledby="credential-issuer-other-authority-\d+"[^>]*>[\s\S]*?<\/section>/)?.[0];
    assert.ok(trm);
    assert.ok(other);
    assert.equal((trm.match(/class="credential-issuer-logo"/g) ?? []).length, 1);
    assert.match(trm, /<img[^>]+src="\/_astro\/trm-labs\.[^"]+"[^>]+alt="TRM Labs logo"/);
    assert.match(trm, /<h3[^>]*>TRM Labs<\/h3>/);
    assert.match(trm, /2 credentials/);
    assert.match(trm, /id="first"/);
    assert.match(trm, /id="second"/);
    assert.doesNotMatch(other, /credential-issuer-logo|has-issuer-logo|<img/);
    assert.match(other, /Other credential/);
    assert.doesNotMatch(html, /Unused Authority|not-used\.png/);
    assert.doesNotMatch(html, new RegExp(temporary));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
