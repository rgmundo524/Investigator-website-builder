import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { stringify } from 'yaml';
import { schemas } from '../src/content/schemas';
import { caseVisuals, sunburstPayload, type CaseSunburstPayload } from '../src/lib/case-visuals';
import { caseSunburst, sunburstNodes, sunburstSelection } from '../src/lib/case-sunburst';
import { chartSearchSelection, filtersForChart } from '../src/lib/case-search-filters';
import { sectionDestination } from '../src/lib/section-placement';

const root = fileURLToPath(new URL('..', import.meta.url));
const common = { publication_status: 'published', description_short: 'Public summary.' };
const page = (id: string, extra: Record<string, unknown> = {}) => ({ id,
  data: schemas.pages.parse({ ...common, slug: id, profile: 'person', title: id, section_order: [], ...extra }) });
const entry = (id: string, publication_status: 'draft' | 'published' = 'published') => ({ id, data: { publication_status } });
const chart = { id: 'investigations', data: schemas.charts.parse({ ...common, slug: 'investigations', title: 'Investigations',
  categories: [{ id: 'fraud', label: 'Fraud' }, { id: 'theft', label: 'Theft' }] }) };
const study = (id: string, subcategory: string[], example = false) => ({ id,
  data: schemas.cases.parse({ ...common, slug: id, title: `Narrative title ${id}`, description_short: `Narrative summary ${id}`,
    chart: chart.id, category: 'fraud', subcategory, content_kind: example ? 'example' : 'case_study',
    publication_status: example ? 'draft' : 'published' }) });

test('homepage card destinations follow visible section selections and avoid nonexistent or hidden targets', () => {
  const records = [entry('tool'), entry('draft-tool', 'draft'), entry('focus'), entry('disabled-focus')];
  const research = page('research', { projects: ['tool'], expertise: ['focus'], section_order: ['projects', 'expertise'] });
  const pages = [page('home', { projects: ['tool'], expertise: ['focus'], section_order: ['projects', 'expertise'] }),
    page('casework', { projects: ['tool'], section_order: ['charts'] }),
    page('work-history', { expertise: ['disabled-focus'], section_order: ['experience'] }), research];
  assert.equal(sectionDestination(pages, 'projects', records, { recordId: 'tool' }), '/research/#tool');
  assert.equal(sectionDestination(pages, 'expertise', records), '/research/#section-expertise');
  assert.equal(sectionDestination(pages, 'projects', records, { recordId: 'missing' }), undefined);
  assert.equal(sectionDestination(pages.slice(0, 3), 'projects', records, { recordId: 'tool' }), undefined);
  assert.equal(sectionDestination(pages.slice(0, 3), 'expertise', records), undefined);
  assert.equal(sectionDestination([page('research', { projects: ['draft-tool'], section_order: ['projects'] })], 'projects', records), undefined);

  const draftPage = page('draft-work', { publication_status: 'draft', projects: ['draft-tool'], section_order: ['projects'] });
  assert.equal(sectionDestination([draftPage], 'projects', records, { recordId: 'draft-tool' }), undefined);
  assert.equal(sectionDestination([draftPage], 'projects', records, { recordId: 'draft-tool', includeDrafts: true }), '/draft-work/#draft-tool');
  assert.equal(sectionDestination([research, page('casework', { projects: ['tool'], section_order: ['projects'] })], 'projects', records, { recordId: 'tool' }), '/casework/#tool');
  assert.equal(sectionDestination([research, page('work-history', { expertise: ['focus'], section_order: ['expertise'] })], 'expertise', records), '/work-history/#section-expertise');
});

test('the public sunburst payload preserves mixed-depth hierarchy, exact membership, and search selections', () => {
  const studies = [study('deep', ['investment', 'online']), study('shallow', ['investment']), study('unclassified', []),
    { ...study('other-category', ['account']), data: { ...study('other-category', ['account']).data, category: 'theft' } }];
  const rich = caseVisuals([chart], studies, 'case_study').groups[0];
  const compact = sunburstPayload(rich);
  const richHierarchy = caseSunburst(rich);
  const compactHierarchy = caseSunburst(compact);
  assert.deepEqual(compactHierarchy, richHierarchy);
  assert.equal(compact.total, 4);
  assert.doesNotMatch(JSON.stringify(compact), /Narrative title|Narrative summary|\/investigations\/|subcategories|tooltip|percentage|offset/);
  assert.ok(Buffer.byteLength(JSON.stringify(compact)) < Buffer.byteLength(JSON.stringify(rich)) / 2);
  for (const node of sunburstNodes(richHierarchy)) {
    const selected = sunburstSelection(compactHierarchy, node.id);
    assert.deepEqual([...selected.caseIds].sort(), [...node.caseIds].sort());
    const filters = filtersForChart({ Network: ['Ethereum'] }, compact, selected.node);
    assert.deepEqual(filters, filtersForChart({ Network: ['Ethereum'] }, rich, node));
    assert.equal(chartSearchSelection(compact, compactHierarchy, filters).node.id, node.id);
  }
  const terminal = sunburstNodes(compactHierarchy).find(({ id }) => id.endsWith('/investment/@unclassified'));
  assert.deepEqual(terminal?.caseIds, ['shallow']);
  assert.deepEqual(chartSearchSelection(compact, compactHierarchy, { Investigation: ['Another investigation'] }).node, compactHierarchy);
});

test('the static homepage and mixed case dashboard retain links, fallbacks, and dataset totals with compact payloads', { timeout: 60_000 }, async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'public-content-cleanup-'));
  try {
    for (const directory of ['src/pages', 'src/components', 'src/layouts', 'src/content']) await mkdir(path.join(temporary, directory), { recursive: true });
    await symlink(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    for (const directory of ['lib', 'scripts', 'config']) await cp(path.join(root, 'src', directory), path.join(temporary, 'src', directory), { recursive: true });
    await cp(path.join(root, 'src/pages/index.astro'), path.join(temporary, 'src/pages/index.astro'));
    for (const component of ['CaseDashboard', 'CaseDataset', 'CaseChart', 'CaseExplorer', 'CaseClassificationList', 'CaseSearch']) {
      await cp(path.join(root, `src/components/${component}.astro`), path.join(temporary, `src/components/${component}.astro`));
    }
    for (const component of ['Portrait', 'PersonalPhotos']) await writeFile(path.join(temporary, `src/components/${component}.astro`), '<!-- Unrelated image fixture -->');
    await writeFile(path.join(temporary, 'src/layouts/SiteLayout.astro'), '<!doctype html><html><body><slot /></body></html>');
    await writeFile(path.join(temporary, 'package.json'), '{"type":"module","dependencies":{"@iconify-json/lucide":"1.2.129"}}');
    await writeFile(path.join(temporary, 'astro.config.mjs'), `
import { defineConfig } from 'astro/config';
import icon from 'astro-icon';
export default defineConfig({ output: 'static', cacheDir: './.astro-cache', integrations: [icon()],
  vite: { define: { __SITE_SETTINGS__: JSON.stringify({ locale: 'en-US' }) } },
});
`);
    await writeFile(path.join(temporary, 'src/content.config.ts'), `
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
const names = ['pages','profile','experience','expertise','projects','charts','cases'];
export const collections = Object.fromEntries(names.map(name => [name, defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/' + name, generateId: ({ data }) => String(data.slug) }),
})]));
`);
    const record = async (collection: string, data: { slug: string }, body = 'Visible record details.') => {
      const directory = path.join(temporary, 'src/content', collection);
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, `${data.slug}.md`), `---\n${stringify(data)}---\n${body}\n`);
    };
    await record('profile', schemas.profile.parse({ ...common, slug: 'person', name: 'Example Person', headline: 'Investigator' }));
    await record('pages', page('home', { projects: ['tool', 'unlinked-tool'], expertise: ['home-focus'] }).data);
    await record('pages', page('casework', { projects: ['tool'], section_order: ['charts'], charts: [chart.id] }).data);
    await record('pages', page('work-history', { expertise: ['disabled-focus'], section_order: ['experience'] }).data);
    await record('pages', page('research', { projects: ['tool'], expertise: ['research-focus'], section_order: ['projects', 'expertise'] }).data);
    for (const slug of ['tool', 'unlinked-tool']) await record('projects', schemas.projects.parse({ ...common, slug, title: slug, contribution: 'Investigation tooling' }));
    for (const slug of ['home-focus', 'research-focus', 'disabled-focus']) await record('expertise', schemas.expertise.parse({ ...common, slug, title: slug }));
    await record('charts', chart.data, 'Chart explanation sentinel.');
    const studies = [study('actual-deep', ['investment', 'online']), study('actual-short', ['investment']), study('example-only', ['account'], true)];
    for (const { data } of studies) await record('cases', data);
    await writeFile(path.join(temporary, 'src/pages/casework.astro'), `---
import { getCollection } from 'astro:content';
import CaseDashboard from '../components/CaseDashboard.astro';
const charts = await getCollection('charts');
---
<main><CaseDashboard charts={charts} introduction="Casework introduction sentinel." /></main>
`);
    await writeFile(path.join(temporary, 'src/pages/research.astro'), '<main><section id="section-expertise">Expertise</section><article id="tool">Project details</article></main>');
    const build = spawnSync(process.execPath, [await realpath(path.join(root, 'node_modules/.bin/astro')), 'build'], {
      cwd: temporary, encoding: 'utf8', timeout: 55_000,
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', CONTENT_PREVIEW: 'drafts' },
    });
    assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
    const homepage = await readFile(path.join(temporary, 'dist/index.html'), 'utf8');
    assert.match(homepage, /href="\/research\/#tool"/);
    assert.match(homepage, /href="\/research\/#section-expertise"/);
    assert.doesNotMatch(homepage, /href="\/casework\/#tool"|href="[^\"]+#unlinked-tool"|href="\/work-history\/#section-expertise"/);
    assert.equal((homepage.match(/Read about this work/g) ?? []).length, 1);
    const dashboard = await readFile(path.join(temporary, 'dist/casework/index.html'), 'utf8');
    assert.match(dashboard, /Casework introduction sentinel/);
    assert.match(dashboard, /Chart explanation sentinel/);
    assert.match(dashboard, /All category counts and shares/);
    assert.match(dashboard, /Browse the case list \(2\)/);
    assert.match(dashboard, /Browse the case list \(1\)/);
    const payloads = [...dashboard.matchAll(/<script[^>]*data-visual-data[^>]*>([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
    const sunbursts = payloads.filter((value): value is CaseSunburstPayload => Array.isArray(value.cases));
    assert.equal(sunbursts.length, 2);
    assert.deepEqual(sunbursts.map(({ kind, total }) => ({ kind, total })), [{ kind: 'case_study', total: 2 }, { kind: 'example', total: 1 }]);
    for (const payload of sunbursts) {
      const expected = caseVisuals([chart], studies, payload.kind, true).groups[0];
      assert.deepEqual(caseSunburst(payload), caseSunburst(expected));
      assert.doesNotMatch(JSON.stringify(payload), /Narrative title|Narrative summary|\/investigations\/|subcategories|tooltip/);
    }
    assert.deepEqual(payloads.filter(value => value.tree).map(({ kind, total }) => ({ kind, total })),
      [{ kind: 'case_study', total: 2 }, { kind: 'example', total: 1 }]);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
