import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { imagePrivacyInfo, pruneUnusedBuildImages } from '../src/lib/image-privacy';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = (name: string) => path.join(root, 'tests/fixtures/image-privacy', name);

test('builds remove unused imported photos and scrub selected and public images while preserving private originals and animation', { timeout: 60_000 }, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'image-privacy-test-'));
  try {
    for (const directory of ['src/pages', 'src/components', 'src/content/credentials', 'src/lib', 'src/scripts', 'integrations', 'assets/images/personal', 'assets/credentials', 'public/_astro']) {
      await mkdir(path.join(temporary, directory), { recursive: true });
    }
    await symlink(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    for (const name of ['Portrait.astro', 'PersonalPhotos.astro', 'ContentEntry.astro']) {
      await cp(path.join(root, 'src/components', name), path.join(temporary, 'src/components', name));
    }
    await cp(path.join(root, 'src/scripts/portrait-restore.js'), path.join(temporary, 'src/scripts/portrait-restore.js'));
    for (const name of ['content.ts', 'experience.ts', 'dates.ts', 'portrait-carousel.ts', 'site-settings.ts', 'public-profile.ts', 'education.ts', 'image-privacy.ts']) {
      await cp(path.join(root, 'src/lib', name), path.join(temporary, 'src/lib', name));
    }
    await cp(path.join(root, 'integrations/image-privacy.ts'), path.join(temporary, 'integrations/image-privacy.ts'));
    await writeFile(path.join(temporary, 'package.json'), '{"type":"module","dependencies":{"@iconify-json/lucide":"1.2.129"}}');
    await writeFile(path.join(temporary, 'astro.config.mjs'), `
import { defineConfig } from 'astro/config';
import icon from 'astro-icon';
import imagePrivacy from './integrations/image-privacy';
export default defineConfig({
  cacheDir: './.astro-cache',
  vite: { cacheDir: './.vite-cache', define: { __SITE_SETTINGS__: JSON.stringify({ locale: 'en-US' }) }, resolve: { alias: { '@site-assets': ${JSON.stringify(path.join(temporary, 'assets'))} } } },
  integrations: [icon({ include: { lucide: ['play', 'pause', 'chevron-left', 'chevron-right'] } }), imagePrivacy()],
});
`);
    await writeFile(path.join(temporary, 'src/content.config.ts'), `
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
export const collections = { credentials: defineCollection({ loader: glob({ pattern: '*.md', base: './src/content/credentials', generateId: ({ data }) => String(data.slug) }) }) };
`);
    await writeFile(path.join(temporary, 'src/content/credentials/test.md'), `---
slug: test
name: Credential
issuer: Example
credential_type: training
issued_year: 2026
description_short: Credential summary
links: []
blocks: {}
badge:
  image: badge.jpg
  alt: Credential badge
---
Credential body.
`);
    await writeFile(path.join(temporary, 'src/pages/index.astro'), `---
import Portrait from '../components/Portrait.astro';
import PersonalPhotos from '../components/PersonalPhotos.astro';
import ContentEntry from '../components/ContentEntry.astro';
import { getEntry } from 'astro:content';
const portrait = { enabled: true, images: [{ image: 'portrait.jpg', alt: 'Portrait' }, { image: 'animation.webp', alt: 'Animation' }], autoplay: true, interval_ms: 6000 };
const page = { data: { blocks: {}, personal_photos: [{ image: 'personal.png', alt: 'Personal', caption: 'Personal photo' }] } };
const credential = await getEntry('credentials', 'test');
---
<Portrait portrait={portrait} name="Fixture" /><PersonalPhotos page={page} /><ContentEntry entry={credential} /><ContentEntry entry={credential} grouped />
`);
    const jpeg = await readFile(fixture('gps-photo.jpg'));
    const png = await readFile(fixture('gps-photo.png'));
    const animation = await readFile(fixture('gps-animation.webp'));
    // A distinct, unused imported file must not publish its image or filename.
    const comment = Buffer.from('UNSELECTED_PRIVATE_COMMENT');
    const marker = Buffer.from([0xff, 0xfe, 0, comment.length + 2]);
    const unused = Buffer.concat([jpeg.subarray(0, 2), marker, comment, jpeg.subarray(2)]);
    const originals = new Map([
      ['assets/portrait.jpg', jpeg], ['assets/animation.webp', animation],
      ['assets/images/personal/personal.png', png], ['assets/credentials/badge.jpg', jpeg],
      ['assets/unused.jpg', unused], ['public/public-photo.jpg', jpeg], ['public/_astro/retained-photo.jpg', jpeg],
    ]);
    for (const [name, bytes] of originals) {
      assert.equal(imagePrivacyInfo(bytes).metadata, true, name);
      await writeFile(path.join(temporary, name), bytes);
    }
    assert.equal(imagePrivacyInfo(animation).frames, 2);
    const build = spawnSync(process.execPath, [await realpath(path.join(root, 'node_modules/.bin/astro')), 'build'], {
      cwd: temporary, encoding: 'utf8', timeout: 55_000,
    });
    assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
    const output = path.join(temporary, 'dist');
    const images = (await readdir(path.join(output, '_astro'))).filter((name) => /\.(?:jpe?g|png|webp)$/.test(name));
    assert.ok(!images.some((name) => name.startsWith('unused.')), 'unused imported image is removed');
    assert.ok(images.length > 0, 'selected images are still emitted');
    assert.ok(images.includes('retained-photo.jpg'), 'an intentionally public image in _astro is retained');
    assert.ok(images.some((name) => name.startsWith('animation.')), 'selected animation is retained');
    assert.ok(!images.some((name) => name.startsWith('portrait.') && name.endsWith('.jpg')), 'selected original is not published');
    for (const name of [...images.map((name) => `_astro/${name}`), 'public-photo.jpg']) {
      const bytes = await readFile(path.join(output, name));
      const info = imagePrivacyInfo(bytes);
      assert.equal(info.metadata, false, name);
      assert.equal(bytes.includes(Buffer.from('PRIVATE_GPS_FIXTURE')), false, name);
      if (name.includes('animation.')) assert.equal(info.frames, 2, 'animation retains both frames');
    }
    const html = await readFile(path.join(output, 'index.html'), 'utf8');
    for (const [, url] of html.matchAll(/\bsrc="(\/_astro\/[^\"]+)"/g)) {
      assert.ok((await readFile(path.join(output, url.slice(1)))).length > 0, `rendered image exists: ${url}`);
    }
    assert.match(html, /alt="Portrait"[^>]*width="24"[^>]*height="16"/);
    assert.match(html, /alt="Credential badge"[^>]*width="24"[^>]*height="16"/);
    assert.match(html, /<p class="meta">Example · 2026<\/p>/, 'standalone credential shows issuer and year only');
    assert.match(html, /<p class="meta">2026<\/p>/, 'grouped credential shows year without repeating issuer');
    assert.doesNotMatch(html, /2026 · training/, 'credential classification is not displayed');
    for (const [name, bytes] of originals) assert.deepEqual(await readFile(path.join(temporary, name)), bytes, name);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('pruning preserves static references across pages, srcset, encoded URLs, styles and scripts, and keeps public files', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'image-reference-test-'));
  const output = path.join(temporary, 'dist');
  const publicDirectory = path.join(temporary, 'public');
  const files = new Map<string, string>([
    ['index.html', `<img src="/_astro/selected.123.jpg"><img srcset="/_astro/small.123.webp 224w, /_astro/large.123.webp 448w">`],
    ['about/index.html', '<img src="../../_astro/nested/shared.123.png?size=2#photo">'],
    ['_astro/styles.css', String.raw`a { background: url('./nested/css.123.png?theme=dark'); } b { background: url('./css\2e 456\2e png'); } c { background: url('./e\scaped.123.png'); }`],
    ['_astro/script.js', String.raw`const image="\/_astro\/js\u002e123\x2ejpg";`],
    ['images.json', '{"photo":"/_astro/%65ncoded%2e123%2ewebp","second":"/_astro/double%252e123%252eavif"}'],
    ['feed.xml', '<image href="/_astro/xml&#46;123&#x2e;gif"/>'],
    ['_astro/selected.123.jpg', 'selected'],
    ['_astro/small.123.webp', 'small'],
    ['_astro/large.123.webp', 'large'],
    ['_astro/nested/shared.123.png', 'shared by another page'],
    ['_astro/shared.123.png', 'same basename retained conservatively'],
    ['_astro/nested/css.123.png', 'css'],
    ['_astro/css.456.png', 'escaped css'],
    ['_astro/escaped.123.png', 'escaped css character'],
    ['_astro/js.123.jpg', 'escaped script'],
    ['_astro/encoded.123.webp', 'encoded json'],
    ['_astro/double.123.avif', 'double encoded json'],
    ['_astro/xml.123.gif', 'entity encoded xml'],
    ['_astro/unused.123.jpg', 'unused original'],
    ['_astro/nested/unused.456.png', 'unused nested original'],
    ['_astro/public-unselected.123.jpg', 'deliberately public'],
    ['_astro/unusual name.123.png', 'unusual filename retained conservatively'],
    ['_astro/vector.svg', '<svg/>'],
    ['unreferenced-public.png', 'deliberately public outside asset directory'],
    ['open-graph/home.png', 'generated social image outside asset directory'],
  ]);
  try {
    for (const [relative, content] of files) {
      const destination = path.join(output, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, content);
    }
    await mkdir(path.join(publicDirectory, '_astro'), { recursive: true });
    await writeFile(path.join(publicDirectory, '_astro/public-unselected.123.jpg'), 'private source retained');
    assert.equal(await pruneUnusedBuildImages(output, publicDirectory), 2);
    for (const [relative, content] of files) {
      const destination = path.join(output, relative);
      if (relative.includes('/unused.')) await assert.rejects(readFile(destination), { code: 'ENOENT' });
      else assert.equal(await readFile(destination, 'utf8'), content, relative);
    }
    assert.equal(await readFile(path.join(publicDirectory, '_astro/public-unselected.123.jpg'), 'utf8'), 'private source retained');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('pruning retains images when runtime URLs or unreadable reference text make usage uncertain', async (t) => {
  const uncertain = [
    ['asset directory prefix', "const url = '/_astro/' + filename;"],
    ['image suffix', "const url = stem + '.webp';"],
    ['template image URL', 'const url = `./${name}.jpg`;'],
    ['template asset URL', 'const url = `/_astro/${name}`;'],
    ['non-UTF8 text', Buffer.from([0xff, 0xfe, 0x00])],
  ] as const;
  for (const [name, script] of uncertain) await t.test(name, async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'image-reference-uncertain-'));
    try {
      await mkdir(path.join(temporary, '_astro'));
      await writeFile(path.join(temporary, '_astro/photo.123.webp'), 'retain');
      await writeFile(path.join(temporary, '_astro/script.js'), script);
      assert.equal(await pruneUnusedBuildImages(temporary), 0);
      assert.equal(await readFile(path.join(temporary, '_astro/photo.123.webp'), 'utf8'), 'retain');
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
});

test('pruning does not follow output or public symbolic links', { skip: process.platform === 'win32' }, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'image-reference-link-'));
  try {
    const output = path.join(temporary, 'dist');
    const publicDirectory = path.join(temporary, 'public');
    await mkdir(path.join(output, '_astro'), { recursive: true });
    await mkdir(publicDirectory);
    await writeFile(path.join(output, '_astro/photo.123.jpg'), 'retain');
    await writeFile(path.join(temporary, 'references.html'), '<img src="/_astro/photo.123.jpg">');
    await symlink(path.join(temporary, 'references.html'), path.join(output, 'linked.html'));
    assert.equal(await pruneUnusedBuildImages(output), 0);
    await rm(path.join(output, 'linked.html'));
    await symlink(path.join(temporary, 'references.html'), path.join(publicDirectory, 'linked.html'));
    assert.equal(await pruneUnusedBuildImages(output, publicDirectory), 0);
    assert.equal(await readFile(path.join(output, '_astro/photo.123.jpg'), 'utf8'), 'retain');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
