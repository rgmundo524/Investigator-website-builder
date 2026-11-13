import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { schemas } from '../src/content/schemas';

const root = fileURLToPath(new URL('..', import.meta.url));
const page = { slug: 'about', title: 'About', profile: 'example', description_short: 'A personal introduction.' };
const outdoors = { image: 'outdoors-placeholder.png', alt: 'An outdoor landscape.', caption: 'Generated placeholder — replace with a personal photo.' };
const making = { image: 'making-placeholder.webp', alt: 'A workshop.', caption: 'Generated placeholder — replace with a personal photo.' };

test('personal photos are optional and preserve the chosen order and visible captions', () => {
  assert.deepEqual(schemas.pages.parse(page).personal_photos, []);
  const parsed = schemas.pages.parse({ ...page, personal_photos: [outdoors, making], section_order: ['interests', 'personal_photos'] });
  assert.deepEqual(parsed.personal_photos, [outdoors, making]);
  assert.deepEqual(parsed.section_order, ['interests', 'personal_photos']);
});

test('personal photos require unique local image filenames and accessible descriptions', () => {
  for (const image of ['../portrait.png', '/portrait.png', 'images/portrait.png', 'https://example.com/photo.png', '..%2fphoto.png', 'photo.svg', 'photo.exe']) {
    assert.equal(schemas.pages.safeParse({ ...page, personal_photos: [{ ...outdoors, image }] }).success, false, image);
  }
  for (const photos of [
    [outdoors, outdoors],
    [{ ...outdoors, alt: '' }],
    [{ ...outdoors, caption: '   ' }],
    [{ image: outdoors.image, alt: outdoors.alt }],
  ]) assert.equal(schemas.pages.safeParse({ ...page, personal_photos: photos }).success, false);
  assert.equal(schemas.pages.safeParse({ ...page, personal_photos: [outdoors], section_order: ['personal_photos', 'personal_photos'] }).success, false);
});

test('pages render their own photo headings and introductions, and the homepage preserves photo order', { timeout: 60_000 }, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'homepage-photo-render-'));
  try {
    for (const directory of ['src/pages', 'src/components', 'src/layouts', 'src/content/pages', 'src/content/profile', 'src/lib', 'assets/images/personal']) {
      await mkdir(path.join(temporary, directory), { recursive: true });
    }
    await symlink(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    await cp(path.join(root, 'src/pages/index.astro'), path.join(temporary, 'src/pages/index.astro'));
    await cp(path.join(root, 'src/components/PersonalPhotos.astro'), path.join(temporary, 'src/components/PersonalPhotos.astro'));
    for (const name of ['content.ts', 'experience.ts', 'dates.ts', 'public-profile.ts', 'image-privacy.ts', 'section-placement.ts']) {
      await cp(path.join(root, 'src/lib', name), path.join(temporary, 'src/lib', name));
    }
    await cp(path.join(root, 'tests/fixtures/image-privacy/gps-photo.png'), path.join(temporary, 'assets/images/personal/first.png'));
    await cp(path.join(root, 'tests/fixtures/image-privacy/gps-photo.jpg'), path.join(temporary, 'assets/images/personal/second.jpg'));
    await writeFile(path.join(temporary, 'package.json'), '{"type":"module","dependencies":{"@iconify-json/lucide":"1.2.129"}}');
    await writeFile(path.join(temporary, 'astro.config.mjs'), `
import { defineConfig } from 'astro/config';
import icon from 'astro-icon';
export default defineConfig({
  output: 'static',
  cacheDir: './.astro-cache',
  vite: { resolve: { alias: { '@site-assets': ${JSON.stringify(path.join(temporary, 'assets'))} } } },
  integrations: [icon()],
});
`);
    await writeFile(path.join(temporary, 'src/content.config.ts'), `
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
export const collections = Object.fromEntries(['pages', 'profile'].map(name => [name,
  defineCollection({ loader: glob({ pattern: '*.md', base: './src/content/' + name, generateId: ({ data }) => String(data.slug) }) })]));
`);
    // Keep the actual homepage and photo component under test; unrelated layout
    // and portrait rendering have their own coverage.
    await writeFile(path.join(temporary, 'src/layouts/SiteLayout.astro'), '<!doctype html><html lang="en"><body><slot /></body></html>');
    await writeFile(path.join(temporary, 'src/components/Portrait.astro'), '<div data-profile-portrait></div>');
    await writeFile(path.join(temporary, 'src/content/profile/investigator.md'), `---
slug: investigator
name: Example Investigator
headline: Blockchain Investigator
publication_status: published
---
`);
    await writeFile(path.join(temporary, 'src/content/pages/home.md'), `---
slug: home
title: Home
profile: investigator
publication_status: published
description_short: An investigator introduction.
blocks:
  personal_photos_heading: Life beyond investigations
  personal_photos_intro: A few moments from my travels.
experience: []
expertise: []
projects: []
personal_photos:
  - image: first.png
    alt: First photograph description
    caption: First photograph caption
  - image: second.jpg
    alt: Second photograph description
    caption: Second photograph caption
---
Introduction.
`);
    await writeFile(path.join(temporary, 'src/pages/about.astro'), `---
import PersonalPhotos from '../components/PersonalPhotos.astro';
const page = { data: {
  blocks: { personal_photos_heading: 'About my hobbies', personal_photos_intro: 'My weekend projects and interests.' },
  personal_photos: [{ image: 'first.png', alt: 'A hobby photograph.', caption: 'About page photograph.' }],
} };
---
<main><PersonalPhotos page={page} /></main>
`);
    await writeFile(path.join(temporary, 'src/pages/default-photos.astro'), `---
import PersonalPhotos from '../components/PersonalPhotos.astro';
const page = { data: { blocks: {}, personal_photos: [{ image: 'first.png', alt: 'A photograph.', caption: 'A moment.' }] } };
---
<main><PersonalPhotos page={page} /></main>
`);
    await writeFile(path.join(temporary, 'src/pages/empty.astro'), `---
import PersonalPhotos from '../components/PersonalPhotos.astro';
const page = { data: { blocks: {}, personal_photos: [] } };
---
<main><PersonalPhotos page={page} /></main>
`);
    const build = spawnSync(process.execPath, [await realpath(path.join(root, 'node_modules/.bin/astro')), 'build'], {
      cwd: temporary, encoding: 'utf8', timeout: 55_000, env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
    });
    assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
    const html = await readFile(path.join(temporary, 'dist/index.html'), 'utf8');
    assert.match(html, /id="section-personal-photos"/);
    assert.match(html, /<h2[^>]*>Life beyond investigations<\/h2>/);
    assert.match(html, /<p[^>]*>A few moments from my travels\.<\/p>/);
    assert.doesNotMatch(html, /About my hobbies|My weekend projects and interests/);
    assert.match(html, /<img[^>]+src="\/_astro\/first\.[^"]+"[^>]+alt="First photograph description"/);
    assert.match(html, /<img[^>]+src="\/_astro\/second\.[^"]+"[^>]+alt="Second photograph description"/);
    assert.match(html, /<figcaption[^>]*>First photograph caption<\/figcaption>/);
    assert.match(html, /<figcaption[^>]*>Second photograph caption<\/figcaption>/);
    assert.ok(html.indexOf('First photograph caption') < html.indexOf('Second photograph caption'));
    assert.doesNotMatch(html, new RegExp(temporary));
    const about = await readFile(path.join(temporary, 'dist/about/index.html'), 'utf8');
    assert.match(about, /<h2[^>]*>About my hobbies<\/h2>/);
    assert.match(about, /<p[^>]*>My weekend projects and interests\.<\/p>/);
    assert.doesNotMatch(about, /Life beyond investigations|A few moments from my travels/);
    const defaults = await readFile(path.join(temporary, 'dist/default-photos/index.html'), 'utf8');
    assert.match(defaults, /<h2[^>]*>Photos<\/h2>/);
    assert.doesNotMatch(defaults, /reading-copy|Away from the screen/);
    const empty = await readFile(path.join(temporary, 'dist/empty/index.html'), 'utf8');
    assert.doesNotMatch(empty, /section-personal-photos|<figure|<img/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
