import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { schemas } from '../src/content/schemas';

const root = fileURLToPath(new URL('..', import.meta.url));
const employment = {
  slug: 'example', organization: 'Example organization', role: 'Investigator',
  description_short: 'Investigative work.', periods: [{ start: '2020-01', end: '2021-12' }],
};
const education = {
  slug: 'example', institution: 'Example University', program: 'Computer Science',
  description_short: 'Academic studies.', credential_type: 'degree', start: '2010-08', end: '2014-05',
};

test('employment logos are optional local images with required alternative text', () => {
  assert.equal(schemas.experience.parse(employment).logo, undefined);
  for (const image of ['organization.png', 'organization.jpg', 'organization.jpeg', 'organization.webp']) {
    assert.deepEqual(schemas.experience.parse({ ...employment, logo: { image, alt: 'Organization emblem' } }).logo,
      { image, alt: 'Organization emblem' });
  }
  for (const image of ['../organization.png', '/organization.png', 'organizations/organization.png', 'https://example.com/logo.png', '..%2forganization.png', 'Organization.png', 'organization.svg', 'organization.exe']) {
    assert.equal(schemas.experience.safeParse({ ...employment, logo: { image, alt: 'Organization emblem' } }).success, false, image);
  }
  for (const logo of [
    { image: 'organization.png' },
    { image: 'organization.png', alt: '   ' },
    { image: 'organization.png', alt: 'Organization emblem', source_url: 'https://example.com/logo.png' },
  ]) assert.equal(schemas.experience.safeParse({ ...employment, logo }).success, false);
});

test('education logos use the same optional local-image validation as employment logos', () => {
  assert.equal(schemas.education.parse(education).logo, undefined);
  for (const image of ['university.png', 'university.jpg', 'university.jpeg', 'university.webp']) {
    assert.deepEqual(schemas.education.parse({ ...education, logo: { image, alt: 'University logo' } }).logo,
      { image, alt: 'University logo' });
  }
  for (const image of ['../university.png', '/university.png', 'organizations/university.png', 'https://example.com/logo.png', '..%2funiversity.png', 'University.png', 'university.svg', 'university.exe']) {
    assert.equal(schemas.education.safeParse({ ...education, logo: { image, alt: 'University logo' } }).success, false, image);
  }
  for (const logo of [
    { image: 'university.png' },
    { image: 'university.png', alt: '   ' },
    { image: 'university.png', alt: 'University logo', source_url: 'https://example.com/logo.png' },
  ]) assert.equal(schemas.education.safeParse({ ...education, logo }).success, false);
});

test('employment and education logos build as local optimized images without empty tiles or education status labels', { timeout: 60_000 }, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'employment-logo-render-'));
  try {
    for (const directory of ['src/pages', 'src/components', 'src/content/experience', 'src/content/education', 'src/lib', 'assets/organizations']) {
      await mkdir(path.join(temporary, directory), { recursive: true });
    }
    await symlink(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    await cp(path.join(root, 'src/components/ContentEntry.astro'), path.join(temporary, 'src/components/ContentEntry.astro'));
    for (const name of ['content.ts', 'experience.ts', 'dates.ts', 'site-settings.ts', 'public-profile.ts', 'education.ts', 'image-privacy.ts']) {
      await cp(path.join(root, 'src/lib', name), path.join(temporary, 'src/lib', name));
    }
    await cp(path.join(root, 'tests/fixtures/image-privacy/gps-photo.png'), path.join(temporary, 'assets/organizations/emblem.png'));
    await writeFile(path.join(temporary, 'package.json'), '{"type":"module","dependencies":{"@iconify-json/lucide":"1.2.129"}}');
    await writeFile(path.join(temporary, 'astro.config.mjs'), `
import { defineConfig } from 'astro/config';
import icon from 'astro-icon';
export default defineConfig({
  output: 'static',
  cacheDir: './.astro-cache',
  vite: { define: { __SITE_SETTINGS__: JSON.stringify({ locale: 'en-US' }) }, resolve: { alias: { '@site-assets': ${JSON.stringify(path.join(temporary, 'assets'))} } } },
  integrations: [icon()],
});
`);
    await writeFile(path.join(temporary, 'src/content.config.ts'), `
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
export const collections = {
  experience: defineCollection({ loader: glob({ pattern: '*.md', base: './src/content/experience', generateId: ({ data }) => String(data.slug) }) }),
  education: defineCollection({ loader: glob({ pattern: '*.md', base: './src/content/education', generateId: ({ data }) => String(data.slug) }) }),
};
`);
    for (const [name, logo] of [['with-logo', '\nlogo:\n  image: emblem.png\n  alt: Example organization emblem'], ['without-logo', '']]) {
      await writeFile(path.join(temporary, `src/content/experience/${name}.md`), `---
slug: ${name}
organization: Example organization
role: Investigator
description_short: Investigative work.
periods:
  - start: 2020-01
    end: 2021-12
highlights: []
links: []
blocks: {}${logo}
---
Employment description.
`);
    }
    for (const [name, logo] of [['education-with-logo', '\nlogo:\n  image: emblem.png\n  alt: Example University logo'], ['education-without-logo', '']]) {
      await writeFile(path.join(temporary, `src/content/education/${name}.md`), `---
slug: ${name}
institution: Example University
program: Computer Science
description_short: Academic studies.
credential_type: attendance
completion_status: not_completed
start: 2010-08
end: 2014-05
links: []
blocks: {}${logo}
---
Education description.
`);
    }
    await writeFile(path.join(temporary, 'src/pages/index.astro'), `---
import ContentEntry from '../components/ContentEntry.astro';
import { getEntry } from 'astro:content';
const withLogo = await getEntry('experience', 'with-logo');
const withoutLogo = await getEntry('experience', 'without-logo');
const educationWithLogo = await getEntry('education', 'education-with-logo');
const educationWithoutLogo = await getEntry('education', 'education-without-logo');
---
<ContentEntry entry={withLogo} /><ContentEntry entry={withoutLogo} />
<ContentEntry entry={educationWithLogo} /><ContentEntry entry={educationWithoutLogo} />
`);
    const build = spawnSync(process.execPath, [await realpath(path.join(root, 'node_modules/.bin/astro')), 'build'], {
      cwd: temporary, encoding: 'utf8', timeout: 55_000, env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
    });
    assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
    const html = await readFile(path.join(temporary, 'dist/index.html'), 'utf8');
    const withLogo = html.match(/<article[^>]*id="with-logo"[^>]*>[\s\S]*?<\/article>/)?.[0];
    const withoutLogo = html.match(/<article[^>]*id="without-logo"[^>]*>[\s\S]*?<\/article>/)?.[0];
    assert.ok(withLogo);
    assert.ok(withoutLogo);
    assert.match(withLogo, /class="employment-logo"/);
    assert.match(withLogo, /<img[^>]+src="\/_astro\/emblem\.[^"]+"[^>]+alt="Example organization emblem"/);
    assert.match(withLogo, /<h3>Investigator<\/h3>/);
    assert.match(withLogo, /Example organization/);
    assert.doesNotMatch(withoutLogo, /employment-logo|<img/);
    assert.match(withoutLogo, /<h3>Investigator<\/h3>/);
    const educationWithLogo = html.match(/<article[^>]*id="education-with-logo"[^>]*>[\s\S]*?<\/article>/)?.[0];
    const educationWithoutLogo = html.match(/<article[^>]*id="education-without-logo"[^>]*>[\s\S]*?<\/article>/)?.[0];
    assert.ok(educationWithLogo);
    assert.ok(educationWithoutLogo);
    assert.match(educationWithLogo, /class="employment-logo"/);
    assert.match(educationWithLogo, /<img[^>]+src="\/_astro\/emblem\.[^"]+"[^>]+alt="Example University logo"/);
    for (const entry of [educationWithLogo, educationWithoutLogo]) {
      assert.match(entry, /<h3>Computer Science<\/h3>/);
      assert.match(entry, /Example University · Aug 2010 to May 2014/);
      assert.doesNotMatch(entry, /Attendance|not_completed|Not completed|Completion|Studies/);
    }
    assert.doesNotMatch(educationWithoutLogo, /employment-logo|<img/);
    assert.doesNotMatch(html, new RegExp(temporary));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
