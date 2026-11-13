import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stringify } from 'yaml';
import { editorCaseCharts } from '../scripts/editor-case-charts';
import { EditorWorkspace } from '../scripts/editor-workspace';
import { startEditorServer } from '../scripts/editor-server';
import { caseSunburst, sunburstNodes } from '../src/lib/case-sunburst';

const chart = (id: string, categories = [{ id: 'hacks', label: 'Hacks' }]) => ({
  collection: 'charts', id, file: `content/charts/${id}.md`, data: { slug: id, title: id, categories },
});
const study = (id: string, data: Record<string, unknown> = {}) => ({
  collection: 'cases', id, file: `content/cases/${id}.md`,
  data: { chart: 'criminal', category: 'hacks', subcategory: [], ...data },
});

test('editor charts retain every classified file once, including partial nested paths and invalid unrelated fields', () => {
  const documents = [chart('criminal'), chart('civil', [{ id: 'acquisition', label: 'Acquisition' }]),
    study('short', { subcategory: ['malware'], title: '', metrics: 'invalid', publication_status: 'invalid' }),
    study('deep', { subcategory: ['malware', 'browser-extension'], networks: null }),
    study('other', { subcategory: ['phishing'], content_kind: 'example' }), study('unspecified'),
    study('civil', { chart: 'civil', category: 'acquisition', subcategory: ['source-of-funds'] }),
  ];
  const saved = structuredClone(documents);
  const result = editorCaseCharts(documents);
  assert.deepEqual(documents, saved, 'The navigation projection never normalizes source or draft data in place');
  assert.deepEqual(result.unclassifiedFiles, []);
  assert.deepEqual(result.groups.map(({ id, total }) => [id, total]), [['criminal', 4], ['civil', 1]]);
  assert.deepEqual(new Set(result.groups.flatMap(({ cases }) => cases.map(({ id }) => id))),
    new Set(documents.filter(({ collection }) => collection === 'cases').map(({ file }) => file)));
  const hierarchy = caseSunburst(result.groups[0]);
  const nodes = sunburstNodes(hierarchy);
  assert.equal(nodes.filter(({ value }) => value !== undefined).reduce((total, node) => total + node.value!, 0), 4);
  const terminal = nodes.find(({ id }) => id === 'criminal/hacks/malware/@unclassified')!;
  assert.deepEqual(terminal.caseIds, ['content/cases/short.md']);
  assert.equal(terminal.count, 1);
  assert.deepEqual(nodes.find(({ id }) => id === 'criminal/hacks/malware')?.caseIds.sort(),
    ['content/cases/deep.md', 'content/cases/short.md']);
});

test('missing or malformed classifications remain reachable without changing chart totals', () => {
  const documents = [chart('criminal'), study('missing-chart', { chart: 'absent' }),
    study('missing-category', { category: 'absent' }), study('blank-category', { category: '' }),
    study('bad-path', { subcategory: ['valid', 42] }), study('valid')];
  const result = editorCaseCharts(documents);
  assert.deepEqual(result.unclassifiedFiles, [
    'content/cases/missing-chart.md', 'content/cases/missing-category.md',
    'content/cases/blank-category.md', 'content/cases/bad-path.md',
  ]);
  assert.equal(result.groups[0].total, 1);
  assert.equal(result.groups[0].cases.length + result.unclassifiedFiles.length, 5);
  assert.deepEqual(editorCaseCharts([study('no-groups')]), { groups: [], unclassifiedFiles: ['content/cases/no-groups.md'] });
  const duplicate = editorCaseCharts([chart('criminal'), chart('criminal'), study('valid')]);
  assert.equal(duplicate.groups.length, 1, 'Duplicate chart IDs cannot double-count a case');
  assert.equal(duplicate.groups[0].total, 1);
});

test('workspace charts use saved case and chart drafts, including new cases, while keeping source metadata intact', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'editor-case-chart-data-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'content'), { recursive: true });
  await writeFile(path.join(root, 'site.json'), JSON.stringify({ version: 1, url: 'https://example.com' }));
  async function record(file: string, data: Record<string, unknown>) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), `---\n${stringify({ slug: path.basename(file, '.md'), publication_status: 'draft',
      title: 'Test record', description_short: 'Test description.', ...data })}---\nCase narrative.\n`);
  }
  await record('content/charts/criminal.md', { categories: [{ id: 'hacks', label: 'Hacks' }] });
  await record('content/charts/civil.md', { categories: [{ id: 'acquisition', label: 'Acquisition' }] });
  const file = 'content/cases/source-case.md';
  await record(file, { chart: 'criminal', category: 'hacks', content_kind: 'case_study' });
  const original = await readFile(path.join(root, file), 'utf8');
  const workspace = await EditorWorkspace.open(root);
  const source = await workspace.readRecord(file);
  const chartSource = await workspace.readRecord('content/charts/civil.md');
  await workspace.saveDraft({ file: chartSource.file, sourceHash: chartSource.sourceHash, expectedDraftHash: null,
    data: { categories: [{ id: 'acquisition', label: 'Acquisition' }, { id: 'new-review', label: 'New review' }] } });
  await workspace.saveDraft({ file, sourceHash: source.sourceHash, expectedDraftHash: null,
    data: { chart: 'civil', category: 'new-review', subcategory: ['due-diligence'], title: '' } });
  const newFile = 'content/cases/pending-only.md';
  await workspace.saveDraft({ file: newFile, sourceHash: null, expectedDraftHash: null,
    data: { slug: 'pending-only', chart: 'criminal', category: 'hacks', title: '', subcategory: ['malware'] } });
  const snapshot = await workspace.snapshot();
  assert.deepEqual(snapshot.caseCharts.groups.map(({ id, total }) => [id, total]), [['civil', 1], ['criminal', 1]]);
  assert.deepEqual(snapshot.caseCharts.groups.find(({ id }) => id === 'civil')?.cases[0].path,
    ['new-review', 'due-diligence']);
  assert.deepEqual(snapshot.caseCharts.groups.flatMap(({ cases }) => cases.map(({ id }) => id)).sort(), [newFile, file].sort());
  assert.deepEqual(snapshot.caseCharts.unclassifiedFiles, []);
  const row = snapshot.records.find((record) => record.file === file)!;
  assert.equal(row.chart, 'criminal');
  assert.equal(row.category, 'hacks');
  assert.equal(row.draftChart, 'civil');
  assert.equal(row.draftCategory, 'new-review');
  assert.equal(snapshot.records.find((record) => record.file === newFile)?.hasSource, false);
  assert.equal(await readFile(path.join(root, file), 'utf8'), original);
  assert.equal((await workspace.readRecord(file)).sourceHash, source.sourceHash);
});

test('editor bundles chart code as browser ESM in memory, retries failures, and keeps the strict content policy', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'editor-case-chart-bundle-'));
  await mkdir(path.join(root, 'editor'));
  const server = await startEditorServer({ rootDir: root, port: 0 });
  t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
  const url = new URL('/case-charts.js', server.url);
  assert.equal((await fetch(url)).status, 400, 'A missing entrypoint is not cached as a successful bundle');
  const entry = path.join(root, 'editor/case-charts.ts');
  await writeFile(entry, 'export const chartMarker: string = "first-chart-build";');
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const policy = response.headers.get('content-security-policy')!;
  assert.match(policy, /script-src 'self'/);
  assert.match(policy, /style-src 'self'/);
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval/);
  const first = await response.text();
  assert.match(first, /first-chart-build/);
  assert.match(first, /export\{/);
  assert.doesNotMatch(first, /: string/);
  await writeFile(entry, 'export const chartMarker: string = "second-chart-build";');
  assert.equal(await (await fetch(url)).text(), first, 'The same server reuses its successful in-memory compilation');
  assert.deepEqual((await readdir(path.join(root, 'editor'))).sort(), ['case-charts.ts']);
});
