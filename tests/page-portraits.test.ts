import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { stringify } from 'yaml';

const root = fileURLToPath(new URL('..', import.meta.url));
const photos = [{ image: 'first.jpg', alt: 'First page photo' }, { image: 'second.jpg', alt: 'Second page photo' }];
const portrait = (images = photos, extra: Record<string, unknown> = {}) => ({ enabled: true, images, autoplay: true, interval_ms: 6000, ...extra });
function page(slug: string, extra: Record<string, unknown> = {}) {
  return { slug, title: slug, profile: 'person', publication_status: 'published', description_short: 'A page introduction.', blocks: {},
    section_order: [], page_sections: [], experience_source: 'selected', credentials_source: 'selected', compact_sections: [],
    experience: [], expertise: [], projects: [], education: [], interests: [], callouts: [], charts: [], credentials: [], ...extra };
}

async function record(temporary: string, collection: string, data: Record<string, unknown>) {
  const directory = path.join(temporary, 'src/content', collection);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${data.slug}.md`), `---\n${stringify(data)}---\nAn introduction for this page.\n`);
}

function assertNoPortrait(html: string) {
  assert.doesNotMatch(html, /<img\b|<figure\b[^>]*\bdata-portrait-rotation\b|class="[^"]*\b(?:page-intro-with-portrait|hero-with-portrait)\b|<figcaption/);
  assert.doesNotMatch(html, /Global profile photo|Saved profile caption/);
}

function assertRotation(html: string, first: string, second: string, autoplay: boolean, interval: number) {
  assert.match(html, /<figure\b[^>]*\bdata-portrait-rotation\b/);
  assert.match(html, new RegExp(`data-autoplay="${autoplay}"`));
  assert.match(html, new RegExp(`data-interval="${interval}"`));
  assert.equal((html.match(/data-portrait-slide(?:\s|>)/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<button\b|data-portrait-(?:controls|prev|next|toggle|position|carousel)|aria-roledescription="carousel"/);
  assert.match(html, /draggable="false"/);
  assert.ok(html.indexOf(`alt="${first}"`) < html.indexOf(`alt="${second}"`), 'Page-specific image order is retained');
}

test('portraits belong to each page, rotate without controls, and inherit only from their parent page', { timeout: 60_000 }, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'page-portraits-'));
  try {
    for (const directory of ['src/pages/articles', 'src/pages/investigations/[chart]', 'src/components', 'src/layouts', 'src/lib', 'src/scripts', 'src/styles', 'assets']) {
      await mkdir(path.join(temporary, directory), { recursive: true });
    }
    await symlink(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    for (const file of ['index.astro', '[page].astro', 'articles/[slug].astro', 'investigations/[chart]/[category].astro']) {
      await cp(path.join(root, 'src/pages', file), path.join(temporary, 'src/pages', file));
    }
    // Exercise the actual homepage renderer against absent and disabled settings.
    const homeSource = await readFile(path.join(root, 'src/pages/index.astro'), 'utf8');
    for (const slug of ['none', 'disabled']) {
      await writeFile(path.join(temporary, `src/pages/home-${slug}.astro`), homeSource.replace("getEntry('pages', 'home')", `getEntry('pages', '${slug}')`));
    }
    for (const name of ['Portrait', 'PagePortrait', 'PageHeader']) {
      await cp(path.join(root, `src/components/${name}.astro`), path.join(temporary, `src/components/${name}.astro`));
    }
    await cp(path.join(root, 'src/scripts/portrait-restore.js'), path.join(temporary, 'src/scripts/portrait-restore.js'));
    for (const name of ['ContentEntry', 'CaseDashboard', 'ExperienceTimeline', 'ArticleList', 'ResourceList', 'CredentialGroups', 'ContactCards', 'GitHubProjects', 'SkillsSection', 'ActivitySection', 'OrganizationsSection', 'PersonalPhotos', 'PageContactCta', 'CaseRecord']) {
      await writeFile(path.join(temporary, `src/components/${name}.astro`), '<!-- Unused content fixture -->');
    }
    for (const name of ['content', 'experience', 'dates', 'portrait-carousel', 'site-settings', 'public-profile', 'page-markdown', 'articles', 'cases', 'charts', 'image-privacy', 'section-placement']) {
      await cp(path.join(root, `src/lib/${name}.ts`), path.join(temporary, `src/lib/${name}.ts`));
    }
    await cp(path.join(root, 'src/styles/global.css'), path.join(temporary, 'src/styles/global.css'));
    await writeFile(path.join(temporary, 'src/layouts/SiteLayout.astro'), '---\nimport "../styles/global.css";\nconst { title } = Astro.props;\n---\n<html><head><title>{title}</title></head><body><slot /></body></html>');
    await writeFile(path.join(temporary, 'package.json'), '{"type":"module","dependencies":{"@iconify-json/lucide":"1.2.129"}}');
    await writeFile(path.join(temporary, 'astro.config.mjs'), `
import { defineConfig } from 'astro/config';
import icon from 'astro-icon';
export default defineConfig({ output: 'static', cacheDir: './.astro-cache', integrations: [icon()],
  vite: { cacheDir: './.vite-cache', define: { __SITE_SETTINGS__: JSON.stringify({ locale: 'en-US' }) }, resolve: { alias: { '@site-assets': ${JSON.stringify(path.join(temporary, 'assets'))} } } },
});
`);
    await writeFile(path.join(temporary, 'src/content.config.ts'), `
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
const names = ['pages','profile','contacts','expertise','projects','experience','education','credentials','interests','callouts','charts','articles','cases'];
export const collections = Object.fromEntries(names.map((name) => [name, defineCollection({ loader: glob({ pattern: '*.md', base: './src/content/' + name }) })]));
`);
    await record(temporary, 'profile', { slug: 'person', publication_status: 'published', name: 'Example Person', headline: 'Investigator', blocks: { portrait_caption: 'Saved profile caption' },
      portrait: portrait([{ image: 'global-profile.jpg', alt: 'Global profile photo' }]) });
    await record(temporary, 'pages', page('home', { portrait: portrait(photos, { autoplay: true, interval_ms: 9000, caption: 'Homepage caption' }) }));
    await record(temporary, 'pages', page('about', { portrait: portrait([photos[0]]) }));
    await record(temporary, 'pages', page('work-history', { portrait: portrait([photos[1]]) }));
    await record(temporary, 'pages', page('gallery', { portrait: portrait([...photos].reverse(), { autoplay: false, interval_ms: 3500, caption: 'Gallery caption' }) }));
    await record(temporary, 'pages', page('none'));
    await record(temporary, 'pages', page('disabled', { portrait: portrait([{ image: 'not-present.jpg', alt: 'Disabled photo' }], { enabled: false, caption: 'Disabled caption' }) }));
    await record(temporary, 'pages', page('writing', { portrait: portrait([photos[1]]), section_order: ['articles'] }));
    await record(temporary, 'pages', page('casework', { portrait: portrait(photos, { enabled: false }), charts: ['disabled-chart'], section_order: ['charts'] }));
    await record(temporary, 'pages', page('other-casework', { portrait: portrait([photos[0]]), charts: ['enabled-chart'], section_order: ['charts'] }));
    await record(temporary, 'articles', { slug: 'example-article', publication_status: 'published', title: 'An article', description_short: 'An article introduction.', related_cases: [], tags: [], links: [], blocks: {} });
    for (const slug of ['disabled-chart', 'enabled-chart']) {
      await record(temporary, 'charts', { slug, publication_status: 'published', title: slug, categories: [{ id: 'category', label: 'Category' }] });
    }
    for (const image of ['first.jpg', 'second.jpg', 'global-profile.jpg']) {
      await cp(path.join(root, 'tests/fixtures/image-privacy/gps-photo.jpg'), path.join(temporary, 'assets', image));
    }
    const build = spawnSync(process.execPath, [await realpath(path.join(root, 'node_modules/.bin/astro')), 'build'], {
      cwd: temporary, encoding: 'utf8', timeout: 55_000, env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', CONTENT_PREVIEW: '' },
    });
    assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
    const output = (file: string) => readFile(path.join(temporary, 'dist', file, 'index.html'), 'utf8');
    const about = await output('about');
    const work = await output('work-history');
    assert.match(about, /alt="First page photo"/);
    assert.doesNotMatch(about, /alt="Second page photo"|<figcaption|<figure\b[^>]*\bdata-portrait-rotation\b/);
    assert.match(work, /alt="Second page photo"/);
    assert.doesNotMatch(work, /alt="First page photo"|<figcaption|<figure\b[^>]*\bdata-portrait-rotation\b/);
    assert.match(about, /page-intro-with-portrait/);
    assert.match(about, /class="portrait page-portrait"/);
    assert.match(about, /sizes="\(max-width: 640px\) 192px, 224px"/);
    for (const slug of ['none', 'disabled', 'home-none', 'home-disabled']) assertNoPortrait(await output(slug));
    const gallery = await output('gallery');
    assertRotation(gallery, 'Second page photo', 'First page photo', false, 3500);
    assert.match(gallery, /<figcaption>Gallery caption<\/figcaption>/);
    const home = await readFile(path.join(temporary, 'dist/index.html'), 'utf8');
    assertRotation(home, 'First page photo', 'Second page photo', true, 9000);
    assert.match(home, /hero-with-portrait/);
    assert.match(home, /<figcaption>Homepage caption<\/figcaption>/);
    assert.doesNotMatch(home, /class="portrait page-portrait"/);
    assert.match(await output('articles/example-article'), /alt="Second page photo"/);
    assert.match(await output('investigations/enabled-chart/category'), /alt="First page photo"/);
    assertNoPortrait(await output('investigations/disabled-chart/category'));
    for (const html of [about, work, gallery, home]) assert.doesNotMatch(html, /Global profile photo|Saved profile caption/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
