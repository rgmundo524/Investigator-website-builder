import assert from 'node:assert/strict';
import { test } from 'node:test';
import { schemas, type ContentRecord } from '../src/content/schemas';
import { loadContent, validateRecords } from '../scripts/content';
import { categoryUrl, formatShare, summarizeCases } from '../src/lib/charts';
import { caseRoutes, caseTitle, chartCategories, caseStatistics, eligibleCases } from '../src/lib/cases';
import { caseVisuals, type CaseNode } from '../src/lib/case-visuals';
import { caseSunburst, sunburstNodes, sunburstSelection } from '../src/lib/case-sunburst';
import { classificationKeys, chartSearchSelection, createCaseSearchController, type CaseFilters, type PagefindCaseInstance } from '../src/lib/case-search-filters';
import { sortExperience, isCurrentPosition, plotExperience } from '../src/lib/experience';
import { careerTimeline, careerTooltip, monthTimestamp, timelineWindow } from '../src/lib/career-timeline';
import { groupCredentials } from '../src/lib/credentials';
import { orderAboutEntries, skillLevelLabel } from '../src/lib/about';
import { timelineSchema } from '../src/content/schemas';
import { formatPeriods } from '../src/lib/dates';
import { visibleArticles } from '../src/lib/articles';
import { groupResources } from '../src/lib/resources';
import { caseSearchRecords } from '../src/lib/search';
import { OFF_CHAIN_LEAD_TYPES, offChainLeadLabels } from '../src/lib/off-chain-leads';
import { createSearchCache } from '../scripts/search-index';
import { mdxSearchText } from '../src/lib/mdx-text';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { resolveSiteData, builderRoot } from '../scripts/site-data';

const base = { slug: 'example', description_short: 'A short description.' };

test('off-chain leads accept unique types and never identifying values', () => {
  const study = { ...base, title: 'Example case', chart: 'example', category: 'fraud' };
  assert.deepEqual(schemas.cases.parse(study).off_chain_leads, []);
  const ids = OFF_CHAIN_LEAD_TYPES.map(({ id }) => id);
  assert.deepEqual(schemas.cases.parse({ ...study, off_chain_leads: ids }).off_chain_leads, ids);
  assert.deepEqual(offChainLeadLabels(['ip-addresses', 'urls']), ['IP addresses', 'URLs']);
  for (const leads of [
    ['ip-addresses', 'ip-addresses'], ['cipherbait'], ['192.0.2.1'], ['person@example.com'],
    ['+19035550123'], ['https://example.com/profile'], ['@person'], [{ type: 'email-addresses', value: 'person@example.com' }],
  ]) assert.equal(schemas.cases.safeParse({ ...study, off_chain_leads: leads }).success, false);
});

test('case search includes only the selected off-chain lead type labels', async () => {
  const records = await loadContent(path.resolve('examples/site-data/content'));
  const study = records.find((record) => record.collection === 'cases')!;
  assert.equal(study.collection, 'cases');
  if (study.collection !== 'cases') return;
  const before = caseSearchRecords(records, true).find(({ url }) => url.endsWith(`#${study.data.slug}`))!.content;
  study.data.off_chain_leads = ['ip-addresses', 'email-addresses'];
  const after = caseSearchRecords(records, true).find(({ url }) => url.endsWith(`#${study.data.slug}`))!.content;
  assert.match(after, /IP addresses\nEmail addresses/);
  assert.equal(after.replace('IP addresses\nEmail addresses\n', ''), before);
});

test('each page owns an optional portrait with an ordered image list and slideshow settings', () => {
  const page = { ...base, title: 'Example page', profile: 'person' };
  const first = { image: 'portrait-main.jpg', alt: 'A professional headshot.' };
  const second = { image: 'portrait-second.webp', alt: 'Speaking at an event.' };
  assert.equal(schemas.pages.parse(page).portrait, undefined);
  assert.deepEqual(schemas.pages.parse({ ...page, portrait: { images: [first] } }).portrait,
    { enabled: true, images: [first], autoplay: true, interval_ms: 6000 });
  assert.deepEqual(schemas.pages.parse({ ...page, portrait: { images: [first, second] } }).portrait,
    { enabled: true, images: [first, second], autoplay: true, interval_ms: 6000 });
  assert.ok(schemas.pages.safeParse({ ...page, portrait: { images: [first], autoplay: false, interval_ms: 2000 } }).success);
  assert.deepEqual(schemas.pages.parse({ ...page, portrait: { enabled: false } }).portrait?.images, []);
  assert.deepEqual(schemas.pages.parse({ ...page, portrait: { enabled: false, images: [first, second] } }).portrait?.images, [first, second]);
  for (const portrait of [
    first,
    { images: [] }, { images: [first, first] }, { images: [first], ...first },
    { images: [{ image: '../portrait.jpg', alt: 'Invalid path.' }] },
    { images: [{ image: 'portrait.jpg' }] },
    { images: [first], interval_ms: 1999 }, { images: [first], interval_ms: 60001 },
    { images: [first], autoplay: 'true' },
    { enabled: 'false', images: [first] },
  ]) assert.equal(schemas.pages.safeParse({ ...page, portrait }).success, false);
});

test('the complete starter is self-contained and keeps fictional work out of published results', async () => {
  const records = await loadContent(path.resolve('examples/site-data/content'));
  assert.ok(records.every(({ data }) => data.publication_status === 'draft'));
  assert.deepEqual(records.filter(({ collection }) => collection === 'pages').map(({ data }) => data.slug).sort(),
    ['about', 'casework', 'contact', 'credentials', 'home', 'resources', 'work-history']);
  const charts = records.filter((entry) => entry.collection === 'charts').map((entry) => ({ id: entry.data.slug, data: entry.data }));
  const cases = records.filter((entry) => entry.collection === 'cases').map((entry) => ({ id: entry.data.slug, data: entry.data }));
  assert.ok(cases.length > 0 && cases.every(({ data }) => data.content_kind === 'example'));
  assert.deepEqual(caseSearchRecords(records, false), []);
  assert.equal(caseSearchRecords(records, true).length, cases.length);
  for (const group of caseVisuals(charts, cases, 'example', true).groups) {
    assert.ok(group.categories.filter(({ count }) => count > 0).length >= 2, 'Each chart demonstrates multiple categories');
    assert.ok(sunburstNodes(caseSunburst(group)).some((node) => node.path.length >= 2 && (node.children?.length ?? 0) > 1), 'Each chart demonstrates sibling subcategories');
  }
  assert.equal(caseVisuals(charts, cases, 'case_study', true).groups.every(({ total }) => total === 0), true);
  const about = records.find((entry) => entry.collection === 'pages' && entry.data.slug === 'about');
  assert.ok(about?.collection === 'pages');
  assert.ok(about.data.github_groups.every(({ enabled }) => !enabled), 'Placeholder GitHub accounts stay disabled');
});

test('external site directories resolve consistently and invalid configuration never falls back', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'site data #'));
  try {
    for (const name of ['person-a', 'person-b']) {
      await mkdir(path.join(root, name, 'content'), { recursive: true });
      await writeFile(path.join(root, name, 'site.json'), JSON.stringify({ version: 1, url: `https://${name}.example` }));
    }
    const a = resolveSiteData('person-a', root);
    const b = resolveSiteData(path.join(root, 'person-b'));
    assert.equal(a.contentDir, path.join(root, 'person-a/content'));
    assert.equal(a.assetsDir, path.join(root, 'person-a/assets'));
    assert.equal(a.publicDir, path.join(root, 'person-a/public'));
    assert.equal(a.url, 'https://person-a.example');
    assert.notEqual(a.cacheKey, b.cacheKey);
    assert.equal(resolveSiteData(a.dataDir).cacheKey, a.cacheKey);
    assert.equal(resolveSiteData('', builderRoot).dataDir, path.join(builderRoot, 'templates/investigator-site'));
    assert.throws(() => resolveSiteData('missing', root), /SITE_DATA_DIR is not a directory/);
    await rm(path.join(root, 'person-a/content'), { recursive: true });
    assert.throws(() => resolveSiteData('person-a', root), /Missing content directory/);
    await mkdir(path.join(root, 'person-a/content'));
    for (const url of ['not-a-url', 'javascript:alert(1)', 'https://a.example/subpath', 'https://user:pass@a.example', 'https://a.example/?secret=yes']) {
      await writeFile(path.join(root, 'person-a/site.json'), JSON.stringify({ version: 1, url }));
      assert.throws(() => resolveSiteData('person-a', root), /HTTP\(S\)/);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('external source supplies command-line validation and export without modifying either existing directory', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'site-export-'));
  const source = path.join(root, 'source');
  const destination = path.join(root, 'exported');
  try {
    await mkdir(path.join(source, 'content/profile'), { recursive: true });
    await mkdir(path.join(source, 'assets'));
    await writeFile(path.join(source, 'site.json'), JSON.stringify({ version: 1, url: 'https://example.com' }));
    const markdown = '---\nslug: external\nname: External Person\nheadline: Investigator\ndescription_short: External content sentinel.\n---\n\nExternal biography.\n';
    await writeFile(path.join(source, 'content/profile/external.md'), markdown);
    await writeFile(path.join(source, 'assets/fixture.txt'), 'asset sentinel');
    const env = { ...process.env, SITE_DATA_DIR: source };
    const check = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/check-content.ts'], { cwd: builderRoot, env, encoding: 'utf8' });
    assert.equal(check.status, 0, check.stderr);
    assert.match(check.stdout, /Content valid: 1 entries/);
    const runExport = () => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/export-content.ts', destination], { cwd: builderRoot, env, encoding: 'utf8' });
    const first = runExport();
    assert.equal(first.status, 0, first.stderr);
    assert.equal(await readFile(path.join(destination, 'content/profile/external.md'), 'utf8'), markdown);
    assert.equal(await readFile(path.join(source, 'content/profile/external.md'), 'utf8'), markdown);
    assert.equal(await readFile(path.join(destination, 'assets/fixture.txt'), 'utf8'), 'asset sentinel');
    await writeFile(path.join(destination, 'site.json'), 'Existing destination sentinel');
    assert.equal(runExport().status, 1);
    assert.equal(await readFile(path.join(destination, 'site.json'), 'utf8'), 'Existing destination sentinel');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('theme restores before paint, survives navigation and history, and resets for a new tab session', async () => {
  const source = await readFile('src/scripts/theme-init.js', 'utf8');
  const values = new Map<string, string>();
  const boot = (storage = values, blocked = false, defaultTheme = 'dark') => {
    const events: Record<string, () => void> = {};
    const attributes: Record<string, string> = {};
    let ready = false;
    const toggle = { hidden: true, setAttribute: (key: string, value: string) => { attributes[key] = value; }, addEventListener: (name: string, action: () => void) => { events[name] = action; } };
    const root = { dataset: { theme: defaultTheme } };
    const window = { addEventListener: (name: string, action: () => void) => { events[name] = action; }, get sessionStorage() {
      if (blocked) throw new Error('Storage disabled');
      return { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) };
    }, get localStorage() { throw new Error('Persistent storage must not be used'); } };
    const document = { documentElement: root, querySelector: () => ready ? toggle : null, addEventListener: (name: string, action: () => void) => { events[name] = action; } };
    runInNewContext(source, { document, window });
    return { root, attributes, toggle, events, mount: () => { ready = true; events.DOMContentLoaded(); } };
  };
  const first = boot();
  assert.equal(first.root.dataset.theme, 'dark');
  first.mount();
  assert.equal(first.toggle.hidden, false);
  first.events.click();
  assert.equal(first.root.dataset.theme, 'light');
  assert.equal(values.get('personal-site-theme'), 'light');
  const next = boot();
  assert.equal(next.root.dataset.theme, 'light'); // Head script runs before the button exists.
  next.mount();
  assert.equal(next.attributes['aria-pressed'], 'false');
  assert.equal(next.attributes.title, 'Switch to dark mode');
  next.events.click();
  first.events.pageshow();
  assert.equal(first.root.dataset.theme, 'dark');
  assert.equal(first.attributes['aria-pressed'], 'true');
  assert.equal(boot(new Map()).root.dataset.theme, 'dark');
  assert.equal(boot(new Map(), false, 'light').root.dataset.theme, 'light');
  assert.equal(boot(new Map([['personal-site-theme', 'invalid']])).root.dataset.theme, 'dark');
  const unavailable = boot(new Map(), true);
  unavailable.mount();
  assert.doesNotThrow(() => unavailable.events.click());
  assert.equal(unavailable.root.dataset.theme, 'light');
});

test('resources require attribution and review, group in page order, and exclude drafts', () => {
  const resource = { ...base, title: 'An outside guide', category: 'first-steps', source: { url: 'https://example.com/guide', publisher: 'Publisher' } };
  const draft = schemas.resources.parse(resource);
  assert.equal(draft.source.published_on, null);
  assert.equal(draft.reviewed_on, null);
  assert.equal(schemas.resources.safeParse({ ...resource, source: { url: 'https://example.com' } }).success, false);
  assert.equal(schemas.resources.safeParse({ ...resource, source: { ...resource.source, url: 'javascript:alert(1)' } }).success, false);
  assert.equal(schemas.resources.safeParse({ ...resource, category: 'misspelled' }).success, false);
  assert.equal(schemas.resources.safeParse({ ...resource, display_order: -1 }).success, false);
  assert.equal(schemas.resources.safeParse({ ...resource, publication_status: 'published' }).success, false);
  const reviewed = { ...resource, publication_status: 'published', reviewed_on: '2026-09-08' };
  assert.equal(schemas.resources.safeParse(reviewed).success, true);
  const entries = [
    { id: 'draft', data: draft },
    { id: 'report', data: schemas.resources.parse({ ...reviewed, category: 'reports' }) },
    { id: 'later', data: schemas.resources.parse({ ...reviewed, display_order: 20 }) },
    { id: 'first', data: schemas.resources.parse({ ...reviewed, display_order: 10 }) },
  ];
  const groups = groupResources(entries, ['reports', 'first-steps', 'reporting'], false);
  assert.deepEqual(groups.map(({ category }) => category), ['reports', 'first-steps']);
  assert.deepEqual(groups[1].entries.map(({ id }) => id), ['first', 'later']);
  assert.deepEqual(groupResources(entries, ['first-steps'], true)[0].entries.map(({ id }) => id), ['first', 'later', 'draft']);
  assert.equal(groupResources([], ['reports'], true).length, 0);
  const page = { ...base, title: 'Resources', profile: 'example', section_order: ['resources'] };
  assert.equal(schemas.pages.safeParse({ ...page, resource_group_order: ['reports', 'reports'] }).success, false);
});

test('Organizations has one page section with two uniquely ordered subgroup kinds', () => {
  const page = { ...base, title: 'About', profile: 'example', section_order: ['organizations'] };
  assert.deepEqual(schemas.pages.parse(page).organization_group_order, ['memberships', 'daos']);
  assert.equal(schemas.pages.safeParse({ ...page, organization_group_order: ['daos', 'memberships'] }).success, true);
  assert.equal(schemas.pages.safeParse({ ...page, organization_group_order: ['daos', 'daos'] }).success, false);
  assert.equal(schemas.pages.safeParse({ ...page, section_order: ['memberships', 'daos'] }).success, false);
});

test('About ratings distinguish unknown levels and keep illustrative entries out of publication', () => {
  const skill = { ...base, title: 'Python' };
  assert.equal(schemas.skills.parse(skill).proficiency, null);
  for (const value of [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, null]) assert.equal(schemas.skills.safeParse({ ...skill, proficiency: value }).success, true);
  for (const value of [0, 0.5, 6, 2.25, '3']) assert.equal(schemas.skills.safeParse({ ...skill, proficiency: value }).success, false);
  assert.equal(skillLevelLabel(2.5), 'Between Developing and Proficient');
  assert.equal(skillLevelLabel(5), 'Expert');
  assert.equal(schemas.skills.safeParse({ ...skill, icon: 'nonexistent-icon' }).success, false);
  assert.equal(schemas.skills.safeParse({ ...skill, content_kind: 'example', publication_status: 'published' }).success, false);
  const activity = { ...base, title: 'Example membership', kind: 'memberships', content_kind: 'example' };
  assert.equal(schemas.activities.safeParse(activity).success, true);
  assert.equal(schemas.activities.safeParse({ ...activity, publication_status: 'published' }).success, false);
  assert.equal(schemas.activities.safeParse({ ...activity, periods: [{ start: '2025-10', end: '2025-01' }] }).success, false);
  const entries = [
    { id: 'later', data: { display_order: 100 } },
    { id: 'first-tie', data: { display_order: 10 } },
    { id: 'second-tie', data: { display_order: 10 } },
  ];
  assert.deepEqual(orderAboutEntries(entries).map(({ id }) => id), ['first-tie', 'second-tie', 'later']);
  assert.equal(entries[0].id, 'later');
});

test('About selection rejects missing, misclassified, and unpublished activity records', () => {
  const profile: ContentRecord = { collection: 'profile', data: schemas.profile.parse({ ...base, name: 'Example', headline: 'Investigator', publication_status: 'published' }), body: 'Biography', file: 'profile/example.md' };
  const page: ContentRecord = { collection: 'pages', data: schemas.pages.parse({ ...base, title: 'About', profile: 'example', memberships: ['example'] }), body: 'About', file: 'pages/about.md' };
  const activity: ContentRecord = { collection: 'activities', data: schemas.activities.parse({ ...base, title: 'Community work', kind: 'volunteering' }), body: 'Details', file: 'activities/example.md' };
  assert.throws(() => validateRecords([profile, page]), /missing activities\/example/);
  assert.throws(() => validateRecords([profile, page, activity]), /belongs to volunteering/);
  activity.data.kind = 'memberships';
  assert.doesNotThrow(() => validateRecords([profile, page, activity]));
  page.data.publication_status = 'published';
  assert.throws(() => validateRecords([profile, page, activity]), /published content references draft activities\/example/);
  activity.data.publication_status = 'published';
  assert.doesNotThrow(() => validateRecords([profile, page, activity]));
});

test('repository records validate identity, unique owner/name pairs, and selected group ownership', () => {
  const input = { ...base, title: 'Website', contribution: 'Maintainer', owner: 'rgmundo524', repository: 'Reymundo-Gomez-info', group: 'personal' };
  for (const repository of ['../hidden', '..', '.', 'owner/name']) assert.equal(schemas.repositories.safeParse({ ...input, repository }).success, false);
  assert.equal(schemas.repositories.safeParse({ ...input, owner: 'https://github.com/rgmundo524' }).success, false);
  const repository: ContentRecord = { collection: 'repositories', data: schemas.repositories.parse(input), body: 'Description', file: 'repositories/example.md' };
  const profile: ContentRecord = { collection: 'profile', data: schemas.profile.parse({ ...base, name: 'Example', headline: 'Investigator' }), body: 'Biography', file: 'profile/example.md' };
  const page: ContentRecord = { collection: 'pages', data: schemas.pages.parse({ ...base, title: 'About', profile: 'example', repositories: ['example'] }), body: 'About', file: 'pages/about.md' };
  assert.throws(() => validateRecords([profile, page]), /missing repositories\/example/);
  assert.throws(() => validateRecords([profile, page, repository]), /missing GitHub group personal/);
  page.data.github_groups = [{ id: 'personal', title: 'Personal', account: 'wrong-owner', enabled: true }];
  assert.throws(() => validateRecords([profile, page, repository]), /owner does not match/);
  page.data.github_groups[0].account = 'RGMUNDO524';
  assert.doesNotThrow(() => validateRecords([profile, page, repository]));
  const duplicate: ContentRecord = { ...repository, data: { ...repository.data, slug: 'another-slug', owner: 'RGMUNDO524', repository: 'reymundo-gomez-info' }, file: 'repositories/duplicate.md' };
  assert.throws(() => validateRecords([repository, duplicate]), /duplicate GitHub repository/);
});

test('startup installs once, refreshes after a changed lockfile, and propagates installation failure', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'site-startup-'));
  try {
    await mkdir(path.join(root, 'scripts'));
    await mkdir(path.join(root, 'bin'));
    await copyFile('scripts/ensure-dependencies.mjs', path.join(root, 'scripts/ensure-dependencies.mjs'));
    await copyFile('scripts/npm-runtime.mjs', path.join(root, 'scripts/npm-runtime.mjs'));
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ dependencies: { example: '1.0.0' } }));
    await writeFile(path.join(root, 'package-lock.json'), 'lock-one');
    await writeFile(path.join(root, 'bin/npm-cli.js'), `#!/usr/bin/env node\nconst fs = require('node:fs');\nif (process.argv[2] !== 'ci' || process.argv[3] !== '--include=dev') process.exit(9);\nif (fs.existsSync('fail-install')) process.exit(7);\nfs.mkdirSync('node_modules', {recursive:true});\nfs.appendFileSync('install-count', '1');\n`, { mode: 0o755 });
    const run = () => spawnSync(process.execPath, [path.join(root, 'scripts/ensure-dependencies.mjs')], { cwd: root, env: { ...process.env, npm_execpath: path.join(root, 'bin/npm-cli.js'), PATH: `${path.join(root, 'bin')}${path.delimiter}${process.env.PATH}` }, encoding: 'utf8' });
    assert.equal(run().status, 0);
    assert.equal(run().status, 0);
    assert.equal(await readFile(path.join(root, 'install-count'), 'utf8'), '1');
    await writeFile(path.join(root, 'package-lock.json'), 'lock-two');
    assert.equal(run().status, 0);
    assert.equal(await readFile(path.join(root, 'install-count'), 'utf8'), '11');
    await writeFile(path.join(root, 'package-lock.json'), 'lock-three');
    await writeFile(path.join(root, 'fail-install'), '');
    assert.equal(run().status, 7);
    await rm(path.join(root, 'fail-install'));
    assert.equal(run().status, 0);
    assert.equal(await readFile(path.join(root, 'install-count'), 'utf8'), '111');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('dependency preparation refuses shared links without running an installer or changing the shared directory', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'site-shared-dependencies-'));
  try {
    const checkout = path.join(root, 'checkout');
    const shared = path.join(root, 'shared');
    await mkdir(path.join(checkout, 'scripts'), { recursive: true });
    await mkdir(path.join(checkout, 'bin'));
    await mkdir(shared);
    await copyFile('scripts/ensure-dependencies.mjs', path.join(checkout, 'scripts/ensure-dependencies.mjs'));
    await copyFile('scripts/npm-runtime.mjs', path.join(checkout, 'scripts/npm-runtime.mjs'));
    await writeFile(path.join(checkout, 'package.json'), '{"dependencies":{}}');
    await writeFile(path.join(checkout, 'package-lock.json'), '{}');
    await writeFile(path.join(shared, '.site-dependencies'), 'original marker');
    await writeFile(path.join(shared, 'keep.txt'), 'original dependency');
    await symlink(shared, path.join(checkout, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    await writeFile(path.join(checkout, 'bin/npm'), '#!/usr/bin/env node\nrequire("node:fs").writeFileSync("installer-called", "yes");\n', { mode: 0o755 });
    for (const flags of [[], ['--record']]) {
      const run = spawnSync(process.execPath, [path.join(checkout, 'scripts/ensure-dependencies.mjs'), ...flags], {
        cwd: checkout, encoding: 'utf8', env: { ...process.env, PATH: `${path.join(checkout, 'bin')}${path.delimiter}${process.env.PATH}` },
      });
      assert.notEqual(run.status, 0);
      assert.match(run.stderr, /Refusing a symlinked node_modules/);
    }
    assert.equal(await readFile(path.join(shared, '.site-dependencies'), 'utf8'), 'original marker');
    assert.equal(await readFile(path.join(shared, 'keep.txt'), 'utf8'), 'original dependency');
    await assert.rejects(readFile(path.join(checkout, 'installer-called')), { code: 'ENOENT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('MDX shares Markdown validation and cannot hide duplicate IDs behind a new extension', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'site-mdx-'));
  const source = '---\nslug: example\ntitle: Example\ndescription_short: Summary\n---\n\nimport Callout from "@components/Callout.astro";\n\n<Callout>Visible prose</Callout>\n';
  try {
    await mkdir(path.join(root, 'articles'));
    await writeFile(path.join(root, 'articles/example.mdx'), source);
    const [entry] = await loadContent(root);
    assert.equal(entry.data.publication_status, 'draft');
    assert.equal(entry.file.endsWith('.mdx'), true);
    await writeFile(path.join(root, 'articles/example.md'), source);
    await assert.rejects(loadContent(root), /duplicate slug articles\/example/);
    await rm(path.join(root, 'articles/example.md'));
    await writeFile(path.join(root, 'articles/example.mdx'), source + '\n<Callout>Unclosed');
    await assert.rejects(loadContent(root), /closing tag|Expected/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('MDX search indexes prose inside components without imports, expressions, or hidden attributes', () => {
  const body = 'import Callout from "internal-module-name";\n\nexport const notes = "private-variable";\n\n# Visible heading\n\n<Callout title="component-attribute">\n\nSearchable **investigation** prose.\n\n</Callout>\n\n{notes}\n';
  const text = mdxSearchText(body);
  assert.match(text, /Visible heading/);
  assert.match(text, /Searchable investigation prose/);
  assert.doesNotMatch(text, /internal-module-name|private-variable|component-attribute|notes|Callout/);
});

test('articles validate dates, sort newest first, and exclude drafts from publication', () => {
  const article = { ...base, title: 'Article' };
  assert.equal(schemas.articles.safeParse({ ...article, publication_status: 'published' }).success, false);
  assert.equal(schemas.articles.safeParse({ ...article, published_on: '2026-05-01', updated_on: '2026-04-30' }).success, false);
  const entries = [
    { id: 'draft', data: schemas.articles.parse(article) },
    { id: 'older', data: schemas.articles.parse({ ...article, publication_status: 'published', published_on: '2026-01-01' }) },
    { id: 'newer', data: schemas.articles.parse({ ...article, publication_status: 'published', published_on: '2026-06-01' }) },
  ];
  assert.deepEqual(visibleArticles(entries, false).map(({ id }) => id), ['newer', 'older']);
  assert.deepEqual(visibleArticles(entries, true).map(({ id }) => id), ['newer', 'older', 'draft']);
});

test('article case references cannot silently break or publish a draft case', () => {
  const article: ContentRecord = { collection: 'articles', data: schemas.articles.parse({ ...base, title: 'Article', publication_status: 'published', published_on: '2026-01-01', related_cases: ['missing'] }), body: 'Article', file: 'articles/test.md' };
  assert.throws(() => validateRecords([article]), /related_cases references missing cases\/missing/);
  const study: ContentRecord = { collection: 'cases', data: schemas.cases.parse({ ...base, slug: 'missing', title: 'Draft case', chart: 'example', category: 'fraud' }), body: 'Draft', file: 'cases/missing.md' };
  assert.throws(() => validateRecords([article, study]), /published content references draft cases\/missing/);
});

test('search respects case visibility, exact anchors, and per-case filters without indexing editorial notes', async () => {
  const records = await loadContent(path.resolve('examples/site-data/content'));
  const previews = caseSearchRecords(records, true);
  assert.equal(previews.length, 7);
  assert.equal(new Set(previews.map(({ url }) => url)).size, 7);
  assert.deepEqual(caseSearchRecords(records, false), []);
  for (const record of records) {
    if (record.collection === 'cases') {
      record.data.editorial_note = 'EDITORIAL_SECRET_SENTINEL';
      record.data.blocks.unused_private_block = 'UNUSED_BLOCK_SENTINEL';
      const found = previews.find(({ url }) => url.endsWith(`#${record.data.slug}`))!;
      assert.equal(found.url, `${categoryUrl(record.data.chart, record.data.category)}#${record.data.slug}`);
      assert.deepEqual(found.filters.Network, record.data.networks.length ? record.data.networks.map((value) => value.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ')) : ['Not recorded']);
    }
  }
  assert.doesNotMatch(JSON.stringify(caseSearchRecords(records, true)), /EDITORIAL_SECRET_SENTINEL|UNUSED_BLOCK_SENTINEL/);
  const publicRecords = structuredClone(records);
  for (const record of publicRecords) if (record.collection !== 'cases') record.data.publication_status = 'published';
  const study = publicRecords.find((record) => record.collection === 'cases')!;
  assert.equal(study.collection, 'cases');
  if (study.collection !== 'cases') return;
  study.data.content_kind = 'case_study';
  study.data.publication_status = 'published';
  study.data.case_number = '04837';
  study.data.scope_summary = 'Trace the transfers in the engagement period.';
  assert.equal(caseSearchRecords(publicRecords, false).length, 1);
  assert.deepEqual(caseSearchRecords(publicRecords, false)[0].filters.Dataset, ['Case studies']);
  assert.equal(caseSearchRecords(publicRecords, false)[0].meta.title, 'Case 04837');
  assert.match(caseSearchRecords(publicRecords, false)[0].content, /04837/);
  assert.match(caseSearchRecords(publicRecords, false)[0].content, /Trace the transfers in the engagement period/);
  assert.equal('Status' in caseSearchRecords(publicRecords, false)[0].filters, false);
  study.data.category = publicRecords.filter((record) => record.collection === 'charts').find(({ data }) => data.slug === study.data.chart)!.data.categories.find(({ id }) => id !== study.data.category)!.id;
  assert.equal(caseSearchRecords(publicRecords, false)[0].url, `${categoryUrl(study.data.chart, study.data.category)}#${study.data.slug}`);
  publicRecords.splice(publicRecords.indexOf(study), 1);
  assert.equal(caseSearchRecords(publicRecords, false).length, 0);
});

test('development search discards superseded builds and refuses stale content after errors', async () => {
  let builds = 0;
  let release: (() => void) | undefined;
  let fail = false;
  const cache = createSearchCache(async () => {
    const number = ++builds;
    if (number === 1) await new Promise<void>((resolve) => { release = resolve; });
    if (fail) throw new Error('Invalid content');
    return [{ path: 'pagefind.js', content: new TextEncoder().encode(String(number)) }];
  });
  const first = cache.files();
  const concurrent = cache.files();
  cache.invalidate();
  release!();
  assert.equal(new TextDecoder().decode((await first).get('pagefind.js')), '2');
  assert.equal(await concurrent, await cache.files());
  assert.equal(builds, 2);
  fail = true;
  cache.invalidate();
  await assert.rejects(cache.files(), /Invalid content/);
  fail = false;
  assert.equal(new TextDecoder().decode((await cache.files()).get('pagefind.js')), '4');
});
const job = { ...base, organization: 'Example', role: 'Investigator', periods: [{ start: '2022-09', end: '2025-06' }, { start: '2026-01', end: null }] };

test('a resumed role preserves the gap and defaults to draft', () => {
  const data = schemas.experience.parse(job);
  assert.equal(data.publication_status, 'draft');
  assert.deepEqual(data.periods, job.periods);
});

test('contradictory employment periods and misspelled fields are rejected', () => {
  assert.equal(schemas.experience.safeParse({ ...job, periods: [{ start: '2026-02', end: '2026-01' }] }).success, false);
  assert.equal(schemas.experience.safeParse({ ...job, periods: [{ start: '2025-01', end: null }, { start: '2026-01', end: null }] }).success, false);
  assert.equal(schemas.experience.safeParse({ ...job, Active_position: true }).success, false);
});

test('achievement IDs cannot collide', () => {
  assert.equal(schemas.experience.safeParse({ ...job, highlights: [{ id: 'tracing', text: 'One' }, { id: 'tracing', text: 'Two' }] }).success, false);
});

test('missing references and duplicate slugs report the affected entry', () => {
  const entry: ContentRecord = { collection: 'experience', data: schemas.experience.parse({ ...job, expertise: ['missing'] }), body: 'Text', file: 'experience/example.md' };
  assert.throws(() => validateRecords([entry]), /experience\/example.md.*missing expertise\/missing/);
  assert.throws(() => validateRecords([entry, entry]), /duplicate slug experience\/example/);
});

test('published entries cannot pull in draft references', () => {
  const expertise: ContentRecord = { collection: 'expertise', data: schemas.expertise.parse({ ...base, title: 'Tracing' }), body: 'Text', file: 'expertise/example.md' };
  const experience: ContentRecord = { collection: 'experience', data: schemas.experience.parse({ ...job, publication_status: 'published', expertise: ['example'] }), body: 'Text', file: 'experience/example.md' };
  assert.throws(() => validateRecords([expertise, experience]), /published content references draft/);
  expertise.data.publication_status = 'published';
  assert.doesNotThrow(() => validateRecords([expertise, experience]));
});

test('the selected Markdown collection has valid fields and relationships', async () => {
  const records = await loadContent();
  assert.ok(records.length > 0);
  assert.ok(records.some((record) => record.collection === 'pages' && record.data.slug === 'home'));
});

test('contact records validate public destinations and optional contact details', () => {
  const service = { id: 'agency', name: 'Agency', description: 'Investigations.', action: { label: 'Contact Agency', url: 'https://example.com/contact/' } };
  const contact = { ...base, services_heading: 'Services', services: [service], social: { title: 'Connect', name: 'Example', description: 'Professional enquiries.', email: null, phone: null, links: [] } };
  const parsed = schemas.contacts.parse(contact);
  assert.equal(parsed.services[0].enabled, true);
  assert.equal(parsed.services[0].display_order, 100);
  assert.equal(parsed.social?.email, null);
  assert.equal(schemas.contacts.safeParse({ ...contact, services: [service, service] }).success, false);
  assert.equal(schemas.contacts.safeParse({ ...contact, services: [{ ...service, action: { label: 'Unsafe', url: 'javascript:alert(1)' } }] }).success, false);
  assert.equal(schemas.contacts.safeParse({ ...contact, services: [{ ...service, display_order: -1 }] }).success, false);
  assert.equal(schemas.contacts.safeParse({ ...contact, social: { ...contact.social, email: 'not-an-email' } }).success, false);
  assert.equal(schemas.contacts.safeParse({ ...contact, social: { ...contact.social, links: [{ label: 'Unsafe', url: 'data:text/html,hello' }] } }).success, false);
  assert.equal(schemas.contacts.safeParse({ ...contact, social: { ...contact.social, phone: { label: 'Office', number: '+19035550123' } } }).success, true);
  assert.equal(schemas.contacts.safeParse({ ...contact, social: { ...contact.social, phone: { label: 'Office', number: '+1 903 555 0123' } } }).success, false);
});

test('the contact name override is optional and preserves an explicit display name', () => {
  const contact = { ...base, services_heading: 'Services', social: { title: 'Connect', description: 'Professional enquiries.', links: [] } };
  assert.equal(schemas.contacts.parse(contact).social?.name, undefined);
  assert.equal(schemas.contacts.parse({ ...contact, social: { ...contact.social, name: '   ' } }).social?.name, '');
  assert.equal(schemas.contacts.parse({ ...contact, social: { ...contact.social, name: 'Different public name' } }).social?.name, 'Different public name');
});

test('contact selection rejects missing or draft records on published pages', () => {
  const profile: ContentRecord = { collection: 'profile', data: schemas.profile.parse({ ...base, name: 'Example', headline: 'Investigator', publication_status: 'published' }), body: 'Biography', file: 'profile/example.md' };
  const page: ContentRecord = { collection: 'pages', data: schemas.pages.parse({ ...base, title: 'Contact', profile: 'example', contact: 'example', publication_status: 'published' }), body: 'Contact', file: 'pages/contact.md' };
  const contact: ContentRecord = { collection: 'contacts', data: schemas.contacts.parse({ ...base, services_heading: 'Services' }), body: 'Contact information', file: 'contacts/example.md' };
  assert.throws(() => validateRecords([profile, page]), /missing contacts\/example/);
  assert.throws(() => validateRecords([profile, page, contact]), /published content references draft contacts\/example/);
  contact.data.publication_status = 'published';
  assert.doesNotThrow(() => validateRecords([profile, page, contact]));
  delete page.data.contact;
  assert.doesNotThrow(() => validateRecords([profile, page]));
});

const chart = {
  ...base, title: 'Case types',
  categories: [{ id: 'fraud', label: 'Fraud' }, { id: 'other', label: 'Other' }],
};

test('chart definitions reject manual counts, duplicate categories, and stored percentages', () => {
  assert.equal(schemas.charts.safeParse({ ...chart, categories: [{ ...chart.categories[0], count: 3 }] }).success, false);
  assert.equal(schemas.charts.safeParse({ ...chart, categories: [chart.categories[0], chart.categories[0]] }).success, false);
  assert.equal(schemas.charts.safeParse({ ...chart, categories: [{ ...chart.categories[0], percentage: 75 }] }).success, false);
  assert.equal(schemas.charts.safeParse({ ...chart, publication_status: 'published' }).success, true);
});

test('examples cannot be published as actual work and case facts are validated', () => {
  const data = { ...base, title: 'Case', chart: 'example', category: 'fraud' };
  assert.equal(schemas.cases.safeParse({ ...data, publication_status: 'published' }).success, false);
  assert.equal(schemas.cases.safeParse({ ...data, publication_status: 'published', content_kind: 'case_study' }).success, true);
  assert.equal(schemas.cases.safeParse({ ...data, networks: ['bitcoin', 'bitcoin'] }).success, false);
  assert.equal(schemas.cases.safeParse({ ...data, opened_on: '2026-02-01', closed_on: '2026-01-01' }).success, false);
  assert.equal(schemas.cases.safeParse({ ...data, closed_on: '2026-01-01' }).success, true);
  assert.equal(schemas.cases.safeParse({ ...data, metrics: { reported_loss_usd: 100 } }).success, true);
});

test('transaction-time USD amounts allow omitted notes, preserve zero, and reject obsolete valuation fields', () => {
  const data = { ...base, title: 'Case', chart: 'example', category: 'fraud' };
  for (const field of ['reported_loss_usd', 'assets_reviewed_usd']) {
    for (const amount of [0, 100.25]) {
      const parsed = schemas.cases.parse({ ...data, metrics: { [field]: amount } });
      assert.equal(parsed.metrics[field as keyof typeof parsed.metrics], amount);
      assert.equal(parsed.metrics.amount_note, undefined);
      assert.equal('valuation_date' in parsed.metrics, false);
    }
    for (const amount of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(schemas.cases.safeParse({ ...data, metrics: { [field]: amount } }).success, false);
    }
  }
  const metrics = { reported_loss_usd: 100, amount_note: 'USD equivalent at 2024-04-01 prices, as specified by the client.' };
  assert.deepEqual(schemas.cases.parse({ ...data, metrics }).metrics, { ...metrics, assets_reviewed_usd: null });
  for (const valuation_date of [null, '2024-04-01']) {
    assert.equal(schemas.cases.safeParse({ ...data, metrics: { ...metrics, valuation_date } }).success, false);
  }
});

test('completed casebook records omit status and identifying activity counts', () => {
  const data = { ...base, title: 'An anonymized investigation', chart: 'example', category: 'fraud' };
  for (const case_status of ['completed', 'active', 'on_hold', 'unspecified']) {
    assert.equal(schemas.cases.safeParse({ ...data, case_status }).success, false);
  }
  for (const field of ['wallets_reviewed', 'transactions_reviewed']) {
    assert.equal(schemas.cases.safeParse({ ...data, metrics: { [field]: 3 } }).success, false);
  }
  const parsed = schemas.cases.parse({ ...data, case_number: '04837', scope_summary: 'Trace the transfers specified in the engagement.' });
  assert.equal(parsed.case_number, '04837');
  assert.equal(caseTitle(parsed), 'Case 04837');
  assert.equal(caseTitle({ title: data.title }), data.title);
  assert.equal('case_status' in parsed, false);
  assert.equal('wallets_reviewed' in parsed.metrics, false);
  assert.equal('transactions_reviewed' in parsed.metrics, false);
  assert.equal(schemas.cases.safeParse({ ...data, case_number: '' }).success, false);
});

test('category shares use the full count total and do not normalize incomplete data', () => {
  const source = [21, 13, 5, 5, 4, 3].map((count, index) => ({ id: `type-${index}`, label: `Type ${index}`, count }));
  const summary = summarizeCases(source);
  assert.equal(summary.total, 51);
  assert.equal(formatShare(summary.slices[1].percentage), '25.5%');
  assert.ok(Math.abs(summary.slices.reduce((sum, slice) => sum + slice.percentage!, 0) - 100) < 1e-10);
  const pending = summarizeCases([{ id: 'a', label: 'A', count: 3 }, { id: 'b', label: 'B', count: null }]);
  assert.equal(pending.canPlot, false);
  assert.equal(pending.total, null);
  assert.ok(pending.slices.every(({ percentage }) => percentage === null));
  const single = summarizeCases([{ id: 'a', label: 'A', count: 2 }, { id: 'b', label: 'B', count: 0 }]);
  assert.deepEqual(single.slices.map(({ percentage }) => percentage), [100, 0]);
  assert.equal(summarizeCases([]).canPlot, false);
});

test('four sample cases produce exact quarter slices and matching category links', () => {
  const categories = ['divorce', 'corporate-civil-lawsuits', 'bankruptcy', 'other']
    .map((id) => ({ id, label: id, count: 1 }));
  const result = summarizeCases(categories);
  assert.equal(result.total, 4);
  assert.deepEqual(result.slices.map(({ percentage }) => percentage), [25, 25, 25, 25]);
  assert.deepEqual(result.slices.map(({ offset }) => offset), [0, 25, 50, 75]);
  assert.equal(categoryUrl('professional-investigations', categories[0].id), '/investigations/professional-investigations/divorce/');
});

test('case summaries validate their chart and category references', () => {
  const chartEntry: ContentRecord = { collection: 'charts', data: schemas.charts.parse(chart), body: 'Chart', file: 'charts/example.md' };
  const study: ContentRecord = { collection: 'cases', data: schemas.cases.parse({ ...base, title: 'Case', chart: 'example', category: 'fraud' }), body: 'Case', file: 'cases/example.md' };
  assert.doesNotThrow(() => validateRecords([chartEntry, study]));
  study.data.category = 'missing';
  assert.throws(() => validateRecords([chartEntry, study]), /category references missing charts\/example\/missing/);
  study.data.category = 'fraud';
  study.data.chart = 'missing';
  assert.throws(() => validateRecords([chartEntry, study]), /references missing charts\/missing/);
});

const makeChart = (published = true) => ({ id: 'example', data: schemas.charts.parse({ ...chart, publication_status: published ? 'published' : 'draft' }) });
const makeCase = (id: string, overrides: Record<string, unknown> = {}) => ({ id, data: schemas.cases.parse({ ...base, slug: id, title: id, chart: 'example', category: 'fraud', content_kind: 'case_study', publication_status: 'published', ...overrides }) });

const descendantCases = (node: CaseNode): CaseNode[] => node.type === 'case' ? [node] : (node.children ?? []).flatMap(descendantCases);

test('sunbursts filter each depth independently, preserve exact counts, and reset to all cases', () => {
  const second = { id: 'professional', data: schemas.charts.parse({ ...chart, slug: 'professional', title: 'Professional', publication_status: 'published' }) };
  const records = [makeCase('one', { subcategory: ['platform', 'exchange', 'fee'] }),
    makeCase('two', { subcategory: ['platform', 'exchange', 'freeze'] }),
    makeCase('three', { subcategory: ['platform'] }), makeCase('four', { category: 'other' }),
    makeCase('five', { chart: 'professional', subcategory: ['platform', 'exchange', 'fee'] })];
  const data = caseVisuals([makeChart(), second], records, 'case_study');
  const original = JSON.stringify(data);
  const [criminal, professional] = data.groups.map(caseSunburst);
  assert.deepEqual([criminal.count, professional.count], [4, 1]);
  const selected = (id?: string) => sunburstSelection(criminal, id);
  assert.deepEqual([...selected('example/fraud').caseIds], ['one', 'three', 'two']);
  assert.deepEqual([...selected('example/fraud/platform/exchange').caseIds], ['one', 'two']);
  const leaf = selected('example/fraud/platform/exchange/fee');
  assert.deepEqual([...leaf.caseIds], ['one']);
  assert.equal(leaf.focus.id, 'example/fraud/platform/exchange', 'Leaf filters keep the parent in view');
  assert.deepEqual(leaf.ancestors.map(({ label }) => label), ['All categories', 'Fraud', 'Platform', 'Exchange', 'Fee']);
  assert.deepEqual([...selected('example/fraud/platform/@unclassified').caseIds], ['three']);
  assert.equal(selected(criminal.id).caseIds.size, 4, 'Reset restores this investigation');
  assert.equal(sunburstSelection(professional).caseIds.size, 1, 'The other investigation is unchanged');
  assert.equal(selected('professional/fraud/platform/exchange/fee').node, criminal, 'Unknown or foreign selections reset safely');
  for (const root of [criminal, professional]) {
    const nodes = sunburstNodes(root);
    assert.equal(new Set(nodes.map(({ id }) => id)).size, nodes.length);
    for (const node of nodes) {
      const selection = sunburstSelection(root, node.id);
      assert.equal(selection.caseIds.size, node.count);
      assert.equal(node.value, node.children ? undefined : node.count);
      if (node.children) {
        assert.equal(node.children.reduce((sum, child) => sum + child.count, 0), node.count);
        assert.deepEqual(node.children.flatMap(({ caseIds }) => caseIds).sort(), [...node.caseIds].sort());
      }
    }
    assert.equal(nodes.reduce((sum, node) => sum + (node.value ?? 0), 0), root.count);
  }
  assert.equal(JSON.stringify(data), original, 'Selections must not mutate shared data');
});

test('subcategory paths use arrays, retain unspecified cases, and follow Markdown reclassification', () => {
  assert.deepEqual(makeCase('unspecified').data.subcategory, []);
  assert.equal(schemas.cases.safeParse({ ...makeCase('empty').data, subcategory: [] }).success, true);
  for (const subcategory of [null, 'bridge-exploit', ['valid', null], ['valid', ''], ['UPPER'], [['nested']]]) {
    assert.equal(schemas.cases.safeParse({ ...makeCase('bad').data, subcategory }).success, false);
  }
  assert.equal(schemas.cases.safeParse({ ...makeCase('bad').data, subcategory: ['bridge-exploit', 'protocol-exploit'] }).success, true);
  assert.equal(schemas.cases.safeParse({ ...makeCase('bad').data, subcategory: 'Bridge Exploit' }).success, false);
  const records = [makeCase('one', { subcategory: ['bridge-exploit'] }), makeCase('two'), makeCase('three', { category: 'other', subcategory: ['bridge-exploit'] })];
  const initial = caseVisuals([makeChart()], records, 'case_study').groups[0];
  assert.deepEqual(initial.categories[0].subcategories.map(({ id, count }) => [id, count]), [['bridge-exploit', 1], ['unspecified', 1]]);
  assert.equal(initial.categories[1].subcategories[0].count, 1, 'The same subcategory in another category stays separate');
  assert.equal(initial.categories[0].subcategories[0].url, '/investigations/example/fraud/#subcategory-case_study-bridge-exploit');
  records[1].data.subcategory = ['bridge-exploit'];
  let changed = caseVisuals([makeChart()], records, 'case_study').groups[0];
  assert.deepEqual(changed.categories[0].subcategories.map(({ id, count }) => [id, count]), [['bridge-exploit', 2]]);
  records[0].data.category = 'other';
  changed = caseVisuals([makeChart()], records, 'case_study').groups[0];
  assert.deepEqual(changed.categories.map(({ subcategories }) => subcategories[0].count), [1, 2]);
  records.push(makeCase('new', { subcategory: ['newly-discovered-type'] }));
  changed = caseVisuals([makeChart()], records, 'case_study').groups[0];
  assert.ok(changed.categories[0].subcategories.some(({ id }) => id === 'newly-discovered-type'));
  assert.equal(changed.total, 4);
});

test('sunbursts exclude drafts and examples in production and handle empty or single-case charts', () => {
  const records = [makeCase('public-case', { subcategory: ['public-type'] }), makeCase('draft-case', { publication_status: 'draft', subcategory: ['draft-type'] }),
    makeCase('sample-case', { content_kind: 'example', publication_status: 'draft', subcategory: ['sample-type'] })];
  const publicData = caseVisuals([makeChart()], records, 'case_study').groups[0];
  const root = caseSunburst(publicData);
  assert.deepEqual(root.caseIds, ['public-case']);
  assert.deepEqual(root.children?.[0].children?.map(({ label, count }) => [label, count]), [['Public Type', 1]]);
  assert.doesNotMatch(JSON.stringify(root), /draft-type|sample-type/);
  assert.deepEqual(caseSunburst(caseVisuals([makeChart()], records, 'example').groups[0]).caseIds, []);
  assert.deepEqual(caseVisuals([makeChart(false)], records, 'case_study').groups, []);
  const empty = caseSunburst(caseVisuals([makeChart()], [], 'case_study').groups[0]);
  assert.equal(empty.count, 0);
  assert.equal(empty.children, undefined);
  assert.equal(sunburstSelection(empty).caseIds.size, 0);
  const examples = caseVisuals([makeChart()], records, 'example', true).groups[0];
  assert.deepEqual(caseSunburst(examples).caseIds, ['sample-case']);
  assert.equal(examples.categories[0].subcategories[0].url, '/investigations/example/fraud/#subcategory-example-sample-type');
});

test('example Markdown subcategories appear in search and remain isolated to their parent chart', async () => {
  const records = await loadContent(path.resolve('examples/site-data/content'));
  const charts = records.filter((entry) => entry.collection === 'charts').map((entry) => ({ id: entry.data.slug, data: entry.data }));
  const studies = records.filter((entry) => entry.collection === 'cases').map((entry) => ({ id: entry.data.slug, data: entry.data }));
  const data = caseVisuals(charts, studies, 'example', true);
  assert.deepEqual(data.groups.map(({ total }) => total), [4, 3]);
  const hacks = data.groups[0].categories.find(({ id }) => id === 'hacks')!;
  assert.deepEqual(hacks.subcategories.map(({ id, count }) => [id, count]), [['bridge-exploit', 1]]);
  const divorce = data.groups[1].categories.find(({ id }) => id === 'divorce')!;
  assert.deepEqual(divorce.subcategories.map(({ id, count }) => [id, count]), [['asset-disclosure', 2]]);
  const found = caseSearchRecords(records, true).find(({ url }) => url.endsWith('#case-003'))!;
  assert.deepEqual(found.filters.CasePath, classificationKeys('criminal-investigations', ['hacks', 'bridge-exploit', 'contract-vulnerability']));
  assert.match(found.content, /Bridge Exploit/);
  const deepSearch = caseSearchRecords(records, true).find(({ url }) => url.endsWith('#case-001'))!;
  assert.deepEqual(deepSearch.filters.CasePath, classificationKeys('criminal-investigations', ['pig-butchering', 'investment-platform', 'fake-exchange', 'withdrawal-fee']));
  const criminal = caseSunburst(data.groups[0]);
  assert.equal(sunburstSelection(criminal, 'criminal-investigations/pig-butchering').caseIds.size, 2);
  assert.deepEqual([...sunburstSelection(criminal, 'criminal-investigations/pig-butchering/investment-platform/fake-exchange/withdrawal-fee').caseIds], ['case-001']);

});

test('Pagefind path filters select exactly the same descendants as each sunburst level', async () => {
  const content = await loadContent(path.resolve('examples/site-data/content'));
  const charts = content.filter((entry) => entry.collection === 'charts').map((entry) => ({ id: entry.data.slug, data: entry.data }));
  const studies = content.filter((entry) => entry.collection === 'cases').map((entry) => ({ id: entry.data.slug, data: entry.data }));
  const search = caseSearchRecords(content, true);
  for (const chart of caseVisuals(charts, studies, 'example', true).groups) {
    for (const node of sunburstNodes(caseSunburst(chart))) {
      const matches = search.filter(({ filters }) => filters.Investigation.includes(chart.title) && filters.CasePath.includes(node.id));
      assert.deepEqual(matches.map(({ url }) => url.split('#')[1]).sort(), [...node.caseIds].sort());
    }
  }
  const full = classificationKeys('criminal', ['fraud', 'platform', 'exchange']);
  assert.ok(full.includes('criminal/fraud/platform'));
  assert.ok(!full.includes('criminal/fraud/exchange'), 'A grandchild is never promoted to an equal sibling');
  assert.ok(!full.includes('criminal/other/platform'), 'Identical labels in another branch cannot match');
  assert.ok(!full.includes('criminal/fraud/platform/@unclassified'), 'Deeper cases do not enter a parent-only bucket');
});

function fakePagefind() {
  const listeners: ((term: string, filters: CaseFilters) => void)[] = [];
  const requests: { term: string; filters: CaseFilters }[] = [];
  const instance: PagefindCaseInstance = {
    searchTerm: '', searchFilters: {},
    on(_event, listener) { listeners.push(listener); },
    triggerSearchWithFilters(term, filters) {
      this.searchTerm = term; this.searchFilters = structuredClone(filters);
      // Match Pagefind's synchronous notification before the request starts.
      for (const listener of listeners) listener(term, structuredClone(filters));
      requests.push({ term, filters: structuredClone(filters) });
    },
  };
  return { instance, requests };
}

test('one Pagefind controller handles queued chart clicks, sibling paths, switching investigations, and global reset', async () => {
  const litigation = { id: 'litigation', data: schemas.charts.parse({ ...chart, slug: 'litigation', title: 'Litigation Support Investigations', publication_status: 'published' }) };
  const groups = caseVisuals([makeChart(), litigation], [makeCase('one', { subcategory: ['platform', 'exchange'] }), makeCase('two', { chart: 'litigation', subcategory: ['platform'] })], 'case_study').groups;
  const [criminal, civil] = groups;
  const root = caseSunburst(criminal), civilRoot = caseSunburst(civil);
  const deep = sunburstNodes(root).find(({ id }) => id.endsWith('/platform/exchange'))!;
  const controller = createCaseSearchController();
  controller.select(criminal, deep);
  const { instance, requests } = fakePagefind();
  const disconnect = controller.connect(instance);
  assert.deepEqual(requests.at(-1)?.filters.CasePath, [deep.id], 'A pre-load click is applied when Pagefind connects');
  instance.triggerSearchWithFilters('wallet', { ...instance.searchFilters, Network: ['Ethereum'] });
  assert.equal(chartSearchSelection(criminal, root, controller.snapshot().filters).node.id, deep.id);
  controller.select(criminal, root.children![0]);
  assert.deepEqual(instance.searchFilters.Network, ['Ethereum'], 'Refining the same investigation retains other filters');
  controller.select(civil, civilRoot.children![0]);
  assert.deepEqual(instance.searchFilters.Investigation, ['Litigation Support Investigations']);
  assert.equal(instance.searchFilters.Network, undefined);
  assert.ok(instance.searchFilters.CasePath[0].startsWith('litigation/'));
  assert.equal(instance.searchTerm, 'wallet', 'Investigation switches preserve the typed search');
  assert.equal(chartSearchSelection(criminal, root, controller.snapshot().filters).node, root);
  assert.equal(chartSearchSelection(criminal, root, controller.snapshot().filters).active, false);
  controller.reset();
  assert.equal(instance.searchTerm, ''); assert.deepEqual(instance.searchFilters, {});
  assert.equal(chartSearchSelection(civil, civilRoot, controller.snapshot().filters).active, false);
  disconnect();
  instance.triggerSearchWithFilters('ignored after cleanup', {});
  assert.equal(controller.snapshot().term, '');
});

test('native Pagefind dropdown changes clear stale paths without recursive or superseded searches', async () => {
  const data = caseVisuals([makeChart()], [makeCase('one', { subcategory: ['platform', 'exchange'] })], 'case_study').groups[0];
  const root = caseSunburst(data), deep = sunburstNodes(root).at(-1)!;
  const controller = createCaseSearchController();
  const { instance, requests } = fakePagefind();
  controller.connect(instance); controller.select(data, deep);
  instance.triggerSearchWithFilters('funds', { ...instance.searchFilters, Category: ['Other'], Network: ['Bitcoin'] });
  await Promise.resolve();
  assert.equal(requests.at(-1)?.filters.CasePath, undefined);
  assert.deepEqual(requests.at(-1)?.filters.Network, ['Bitcoin']);
  controller.select(data, deep);
  instance.triggerSearchWithFilters('funds', { ...instance.searchFilters, Investigation: ['Litigation Support Investigations'] });
  await Promise.resolve();
  assert.deepEqual(requests.at(-1)?.filters, { Dataset: ['Case studies'], Investigation: ['Litigation Support Investigations'] });
  controller.select(data, deep);
  instance.triggerSearchWithFilters('old', { ...instance.searchFilters, Investigation: ['Litigation Support Investigations'] });
  controller.reset();
  await Promise.resolve();
  assert.deepEqual(requests.at(-1), { term: '', filters: {} }, 'Queued cleanup cannot overwrite a newer user action');
});

test('pie groups and tree count each case once and follow category changes without duplicating parent values', () => {
  const records = [makeCase('one'), makeCase('two'), makeCase('three', { category: 'other' })];
  const before = caseVisuals([makeChart()], records, 'case_study');
  assert.equal(before.total, 3);
  assert.deepEqual(before.groups[0].categories.map(({ count }) => count), [2, 1]);
  assert.deepEqual(before.groups[0].categories.map(({ percentage }) => percentage), [2 / 3 * 100, 1 / 3 * 100]);
  function check(node: CaseNode) {
    assert.equal(node.count, descendantCases(node).length);
    assert.equal(node.value, node.type === 'case' ? 1 : undefined);
    node.children?.forEach(check);
  }
  check(before.tree);
  assert.equal(new Set(descendantCases(before.tree).map(({ id }) => id)).size, 3);
  records[1].data.category = 'other';
  const after = caseVisuals([makeChart()], records, 'case_study');
  assert.deepEqual(after.groups[0].categories.map(({ count }) => count), [1, 2]);
  assert.deepEqual(after.tree.children![0].children!.map(({ count }) => count), [1, 2]);
  assert.equal(descendantCases(after.tree).find(({ id }) => id === 'case:two')?.url, '/investigations/example/other/#two');
  check(after.tree);
});

test('case visuals separate examples, drafts, and hidden investigations and project only display fields', () => {
  const hidden = { ...makeChart(false), id: 'hidden' };
  const records = [
    makeCase('public-case', { title: 'A [literal] title', description_short: 'Scope <detail>', networks: ['bitcoin'], case_number: '04837',
      blocks: { chart_label: 'Case 001', private_note: 'UNUSED_BLOCK_SENTINEL' }, editorial_note: 'EDITORIAL_SECRET_SENTINEL' }),
    makeCase('draft-case', { publication_status: 'draft' }),
    makeCase('sample-case', { content_kind: 'example', publication_status: 'draft' }),
    makeCase('hidden-case', { chart: 'hidden', publication_status: 'draft' }),
  ];
  const published = caseVisuals([makeChart(), hidden], records, 'case_study');
  assert.equal(published.total, 1);
  assert.equal(published.groups.length, 1);
  const leaf = descendantCases(published.tree)[0];
  assert.equal(leaf.label, '04837');
  assert.equal(leaf.title, 'Case 04837');
  assert.equal(leaf.url, '/investigations/example/fraud/#public-case');
  assert.match(leaf.tooltip, /A \[literal\] title\nScope <detail>/);
  assert.match(leaf.tooltip, /Case 04837/);
  assert.doesNotMatch(leaf.tooltip, /Active|Status|Not recorded/);
  assert.match(leaf.tooltip, /Networks: Bitcoin/);
  assert.equal(published.groups[0].categories[0].url, '/investigations/example/fraud/#dataset-case_study');
  assert.doesNotMatch(JSON.stringify(published), /EDITORIAL_SECRET_SENTINEL|UNUSED_BLOCK_SENTINEL/);
  assert.equal(caseVisuals([makeChart(), hidden], records, 'case_study', true).total, 3);
  const examples = caseVisuals([makeChart(), hidden], records, 'example', true);
  assert.deepEqual(descendantCases(examples.tree).map(({ id }) => id), ['case:sample-case']);
  assert.equal(examples.groups[0].categories[0].url, '/investigations/example/fraud/#dataset-example');
  assert.equal(caseVisuals([makeChart()], records, 'example').total, 0);
});

test('empty case visuals preserve navigable zero categories without inventing branches or shares', () => {
  const empty = caseVisuals([makeChart()], [], 'case_study');
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.tree.children, []);
  assert.equal(empty.groups[0].total, 0);
  assert.deepEqual(empty.groups[0].categories.map(({ count, percentage }) => [count, percentage]), [[0, null], [0, null]]);
  assert.equal(empty.groups[0].categories[1].url, '/investigations/example/other/#dataset-case_study');
});

test('adding and reclassifying a case updates counts, shares, statistics, and routes together', () => {
  const definition = makeChart();
  const records = [makeCase('one'), makeCase('two', { category: 'other' })];
  const before = summarizeCases(chartCategories(definition, records));
  assert.equal(before.total, 2);
  assert.deepEqual(before.slices.map(({ percentage }) => percentage), [50, 50]);
  records.push(makeCase('three'));
  const after = summarizeCases(chartCategories(definition, records));
  assert.equal(after.total, 3);
  assert.equal(caseStatistics(records).total, 3);
  assert.deepEqual(after.slices.map(({ count }) => count), [2, 1]);
  assert.equal(after.slices[0].percentage, 2 / 3 * 100);
  assert.equal(caseRoutes([definition], records)[0].category.count, 2);
  records[2].data.category = 'other';
  assert.deepEqual(chartCategories(definition, records).map(({ count }) => count), [1, 2]);
});

test('production excludes drafts and examples; preview keeps datasets separate', () => {
  const definition = makeChart();
  const records = [makeCase('public-case'), makeCase('draft-case', { publication_status: 'draft' }), makeCase('sample-case', { content_kind: 'example', publication_status: 'draft' })];
  assert.deepEqual(eligibleCases([definition], records).map(({ id }) => id), ['public-case']);
  const routes = caseRoutes([definition], records, true);
  assert.equal(routes[0].primaryKind, 'case_study');
  assert.equal(routes[0].category.count, 2);
  assert.equal(routes[0].studies.length, 3);
  assert.deepEqual(routes[0].datasets.map(({ kind, category, studies }) => [kind, category.count, studies.length]), [['case_study', 2, 2], ['example', 1, 1]]);
  const examplesOnly = caseRoutes([definition], [records[2]], true);
  assert.equal(examplesOnly[0].primaryKind, 'example');
  assert.equal(examplesOnly[0].category.count, 1);
  assert.deepEqual(caseRoutes([makeChart(false)], records), []);
});

test('empty datasets have known zero totals and no plotted proportions', () => {
  const routes = caseRoutes([makeChart()], []);
  assert.deepEqual(routes.map(({ category }) => category.count), [0, 0]);
  const summary = summarizeCases(routes[0].categories);
  assert.equal(summary.total, 0);
  assert.equal(summary.canPlot, false);
  assert.equal(caseStatistics([]).total, 0);
});

test('unknown metrics remain unknown and financial coverage distinguishes zero from missing', () => {
  const records = [makeCase('unknown'), makeCase('known', { opened_on: '2025-03-01', networks: ['bitcoin', 'ethereum'], metrics: { reported_loss_usd: 2500 } }), makeCase('zero', { metrics: { reported_loss_usd: 0 }, networks: ['bitcoin'] })];
  const stats = caseStatistics(records);
  assert.deepEqual(stats.reportedLoss, { total: 2500, coverage: 2 });
  assert.deepEqual(stats.assetsReviewed, { total: 0, coverage: 0 });
  assert.equal('active' in stats, false);
  assert.equal('statuses' in stats, false);
  assert.equal(stats.networks.find(({ label }) => label === 'bitcoin')?.count, 2);
  assert.equal(stats.years.find(({ label }) => label === 'Undated')?.count, 2);
});

test('job frontmatter controls order and supports a confirmed current role with unknown dates', () => {
  const position = (id: string, overrides: Record<string, unknown> = {}) => ({ id, data: schemas.experience.parse({ ...job, slug: id, ...overrides }) });
  const past = position('past', { periods: [{ start: '2024-01', end: '2025-01' }] });
  const current = position('current');
  const adc = position('adc', { periods: [], active_position: true, display_order: 10 });
  assert.equal(isCurrentPosition(adc, '2026-09'), true);
  assert.deepEqual(sortExperience([past, current, adc], '2026-09').map(({ id }) => id), ['adc', 'current', 'past']);
  past.data.display_order = 5;
  assert.deepEqual(sortExperience([current, adc, past], '2026-09').map(({ id }) => id), ['past', 'adc', 'current']);
  assert.equal(schemas.experience.safeParse({ ...job, periods: [] }).success, false);
});

test('employment plot uses a shared month scale and preserves gaps and overlapping roles', () => {
  const entries = [
    { id: 'resumed', data: { display_order: 10, periods: [{ start: '2020-01', end: '2020-06' }, { start: '2021-09', end: null }] } },
    { id: 'concurrent', data: { display_order: 20, periods: [{ start: '2020-04', end: '2021-05' }] } },
  ];
  const result = plotExperience(entries, '2021-12');
  assert.equal(result.span, 24);
  assert.deepEqual(result.ticks.map(({ year }) => year), [2020, 2021]);
  assert.equal(result.present, 100);
  const [resumed, concurrent] = result.rows;
  assert.equal(resumed.periods.length, 2);
  assert.equal(resumed.periods[0].left, 0);
  assert.equal(resumed.periods[0].width, 25); // Six inclusive months of 24.
  assert.equal(resumed.periods[1].left, 20 / 24 * 100);
  assert.equal(resumed.periods[1].width, 4 / 24 * 100);
  assert.ok(concurrent.periods[0].left < resumed.periods[0].left + resumed.periods[0].width);
  assert.equal(concurrent.periods[0].width, 14 / 24 * 100);
  assert.ok(resumed.periods[1].left > resumed.periods[0].left + resumed.periods[0].width);
  entries[0].data.display_order = 30;
  const reordered = plotExperience(entries, '2021-12');
  assert.equal(reordered.rows[0].entry.id, 'concurrent');
  assert.deepEqual(reordered.rows[1].periods, resumed.periods);
});

test('unknown and future start dates do not create fictitious employment bars', () => {
  const undated = { id: 'adc', data: { active_position: true, periods: [] } };
  assert.equal(plotExperience([undated], '2026-09').rows.length, 0);
  assert.deepEqual(plotExperience([undated], '2026-09').undated.map(({ id }) => id), ['adc']);
  const planned = plotExperience([{ id: 'future', data: { periods: [{ start: '2027-01', end: null }] } }], '2026-09');
  assert.equal(planned.rows[0].periods[0].planned, true);
  assert.equal(planned.rows[0].periods[0].scheduled, true);
  assert.equal(formatPeriods([{ start: '2027-01', end: null }], '2026-09'), 'Starts Jan 2027');
  assert.equal(formatPeriods([{ start: '2027-01', end: '2027-06' }], '2026-09'), 'Scheduled Jan 2027 to Jun 2027');
  assert.equal(planned.rows[0].periods[0].current, false);
  assert.equal(planned.rows[0].periods[0].width, 0);
  assert.ok(planned.rows[0].periods[0].left < 100);
  assert.ok(planned.present < planned.rows[0].periods[0].left);
});

test('open roles extend with the build month and single-month roles retain duration', () => {
  const entries = [{ id: 'current', data: { periods: [{ start: '2026-01', end: null }] } }];
  const september = plotExperience(entries, '2026-09');
  const october = plotExperience(entries, '2026-10');
  assert.equal(september.span, 9);
  assert.equal(october.span, 10);
  assert.equal(september.rows[0].periods[0].width, 100);
  assert.equal(october.rows[0].periods[0].width, 100);
  const single = plotExperience([{ id: 'one-month', data: { periods: [{ start: '2026-03', end: '2026-03' }] } }], '2026-09');
  assert.equal(single.rows[0].periods[0].width, 1 / 9 * 100);
});

test('serpentine date spans include whole end months and preserve gaps, concurrency, and unknown dates', () => {
  const position = (id: string, periods: { start: string; end: string | null }[], active_position?: boolean) => ({
    id, data: { organization: id, role: 'Investigator', blocks: {}, periods, active_position },
  });
  const entries = [
    position('resumed', [{ start: '2020-01', end: '2020-02' }, { start: '2020-05', end: null }]),
    position('overlap', [{ start: '2020-02', end: '2020-04' }]),
    position('adjacent', [{ start: '2020-03', end: '2020-03' }]),
    position('unknown', [], true),
  ];
  const result = careerTimeline(entries, timelineSchema.parse({ start: '2019-07' }), '2020-06');
  assert.equal(result.from, Date.UTC(2019, 6, 1));
  assert.equal(result.to, Date.UTC(2020, 6, 1));
  assert.equal(result.present, result.to);
  assert.deepEqual(result.undated.map(({ id }) => id), ['unknown']);
  const [first, second] = result.spans.filter(({ id }) => id === 'resumed');
  assert.equal(first.to, Date.UTC(2020, 2, 1)); // Includes leap-year February.
  assert.equal(second.from, Date.UTC(2020, 4, 1));
  assert.equal(second.to, result.to);
  assert.ok(second.from > first.to);
  assert.equal(result.lanes.length, 2);
  assert.equal(result.spans.find(({ id }) => id === 'adjacent')?.category, first.category);
  for (const a of result.spans) for (const b of result.spans) {
    if (a !== b && a.category === b.category) assert.ok(a.to <= b.from || b.to <= a.from);
  }
  assert.equal(monthTimestamp('2020-02', 1) - monthTimestamp('2020-02'), 29 * 86400000);
});

test('serpentine scheduled starts stay points and bounds advance for open roles', () => {
  const entries = [{ id: 'role', data: { organization: 'Organization', role: 'Investigator', blocks: {}, periods: [{ start: '2027-01', end: null }] } }];
  const before = careerTimeline(entries, timelineSchema.parse({}), '2026-09');
  assert.equal(before.spans[0].from, before.spans[0].to);
  assert.equal(before.spans[0].planned, true);
  assert.ok(before.present < before.spans[0].from);
  assert.ok(before.to > before.spans[0].from);
  const after = careerTimeline(entries, timelineSchema.parse({}), '2027-02');
  assert.equal(after.spans[0].planned, false);
  assert.equal(after.spans[0].current, true);
  assert.equal(after.spans[0].to, Date.UTC(2027, 2, 1));
});

test('timeline settings reject clipping recorded history and invalid bend counts', () => {
  const entry = { id: 'role', data: { organization: 'Organization', role: 'Investigator', blocks: {}, periods: [{ start: '2020-01', end: '2020-02' }] } };
  assert.throws(() => careerTimeline([entry], timelineSchema.parse({ start: '2021-01' }), '2026-09'), /on or before the earliest role/);
  assert.equal(timelineSchema.safeParse({ start: '2020-13' }).success, false);
  assert.equal(timelineSchema.safeParse({ levels: { desktop: 1, mobile: 5 } }).success, false);
  assert.equal(timelineSchema.safeParse({ levels: { desktop: 3, mobile: 9 } }).success, false);
  assert.deepEqual(timelineSchema.parse(undefined), { start: null, scale: 1.2, levels: { desktop: 3, mobile: 5 } });
  assert.equal(careerTimeline([], timelineSchema.parse({}), '2026-09').spans.length, 0);
});

test('timeline navigation clamps zoom and chronological shifts at both ends', () => {
  assert.deepEqual(timelineWindow(0, 1, 0.5), { start: 0.25, end: 0.75 });
  assert.deepEqual(timelineWindow(0.1, 0.6, 1, -1), { start: 0, end: 0.5 });
  assert.deepEqual(timelineWindow(0.4, 0.9, 1, 1), { start: 0.5, end: 1 });
  assert.deepEqual(timelineWindow(0.25, 0.75, 3), { start: 0, end: 1 });
  const smallest = timelineWindow(0.4, 0.5, 0.01, 0, 0.1);
  assert.ok(Math.abs(smallest.end - smallest.start - 0.1) < 1e-12);
});

test('timeline hover content belongs to the actual role and period, with a reusable summary override', () => {
  const entries: Parameters<typeof careerTimeline>[0] = [
    { id: 'first', data: { organization: 'First firm', role: 'Analyst', description_short: 'First job summary.', blocks: {}, periods: [{ start: '2020-01', end: '2021-01' }] } },
    { id: 'second', data: { organization: 'Second firm', role: 'Investigator', description_short: 'Default second summary.', blocks: { timeline_summary: 'Specialized investigation work.' }, periods: [{ start: '2022-01', end: null }] } },
  ];
  const timeline = careerTimeline(entries, timelineSchema.parse({}), '2026-09');
  assert.equal(timeline.spans[0].category, timeline.spans[1].category); // Reused lane, different jobs.
  for (const span of timeline.spans) {
    const role = timeline.roles.find(({ id }) => id === span.id)!;
    const text = careerTooltip(role, span);
    assert.ok(text.includes(role.organization) && text.includes(role.role) && text.includes(span.dates));
    if (span.id === 'second') {
      assert.ok(text.includes('Specialized investigation work.') && text.includes('Current role'));
      assert.ok(!text.includes('First firm') && !text.includes('Default second summary.'));
    } else assert.ok(text.includes('First job summary.') && text.includes('Past role'));
  }
});

test('credentials group new issuers automatically and order awards by year then name', () => {
  const credential = (id: string, issuer: string, issued_year: number, name = id) => ({ id, data: { issuer, issued_year, name } });
  const entries = [credential('ci', 'TRM Labs', 2025), credential('crc', 'Chainalysis', 2022),
    credential('aci', ' trm   labs ', 2026), credential('cci', 'ACAMS', 2024), credential('cfc', 'TRM Labs', 2025)];
  const groups = groupCredentials(entries);
  assert.deepEqual(groups.map(({ issuer }) => issuer), ['ACAMS', 'Chainalysis', 'TRM Labs']);
  assert.deepEqual(groups[2].entries.map(({ id }) => id), ['aci', 'cfc', 'ci']);
  assert.equal(new Set(groups.map(({ id }) => id)).size, groups.length);
  assert.equal(entries[0].id, 'ci'); // Input order is not mutated.
  assert.deepEqual(groupCredentials([]), []);
  const ordered = groupCredentials(entries, [' trm   labs ', 'Future issuer']);
  assert.deepEqual(ordered.map(({ issuer }) => issuer), ['TRM Labs', 'ACAMS', 'Chainalysis']);
  assert.deepEqual(ordered[0].entries.map(({ id }) => id), ['aci', 'cfc', 'ci']);
  assert.equal(ordered[0].id, groups[2].id, 'Reordering groups preserves their existing anchors');
  const page = { ...base, title: 'Credentials', profile: 'reymundo' };
  assert.deepEqual(schemas.pages.parse(page).issuer_order, []);
  assert.deepEqual(schemas.pages.parse({ ...page, issuer_order: ['TRM Labs', 'Chainalysis'] }).issuer_order, ['TRM Labs', 'Chainalysis']);
  assert.equal(schemas.pages.safeParse({ ...page, issuer_order: ['TRM Labs', ' trm   labs '] }).success, false);
  assert.equal(schemas.pages.safeParse({ ...page, issuer_order: [' '] }).success, false);
});

test('credential program links, verification, and optional badge assets remain distinct', () => {
  const base = { slug: 'credential', description_short: 'Description', name: 'Training', issuer: 'Issuer', issued_year: 2026 };
  const record = schemas.credentials.parse({ ...base, course_url: 'https://issuer.example/course',
    verification_url: 'https://issuer.example/award/123', badge: { image: 'training-badge.svg', alt: 'Training badge', source_url: 'https://issuer.example/course' } });
  assert.notEqual(record.course_url, record.verification_url);
  assert.equal(record.credential_type, undefined);
  assert.equal(schemas.credentials.parse(base).badge, undefined);
  assert.equal(schemas.credentials.safeParse({ ...base, course_url: 'javascript:alert(1)' }).success, false);
  assert.equal(schemas.credentials.safeParse({ ...base, badge: { image: '../badge.svg', alt: 'Badge' } }).success, false);
  assert.equal(schemas.credentials.safeParse({ ...base, badge: { image: 'badge.png' } }).success, false);
});
