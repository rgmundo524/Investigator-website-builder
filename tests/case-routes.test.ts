import test from 'node:test';
import assert from 'node:assert/strict';
import { schemas, type ContentRecord } from '../src/content/schemas';
import { caseRoutes, caseUrl, eligibleCases, selectedCaseCharts } from '../src/lib/cases';
import { caseSearchRecords } from '../src/lib/search';
import { markdownSearchText } from '../src/lib/markdown-text';
import { mdxSearchText } from '../src/lib/mdx-text';
import { caseVisuals } from '../src/lib/case-visuals';

const base = { description_short: 'A case summary.', publication_status: 'published' as const };
function fixtures() {
  const chart = { id: 'criminal', data: schemas.charts.parse({ ...base, slug: 'criminal', title: 'Criminal investigations', categories: [{ id: 'hacks', label: 'Hacks' }, { id: 'fraud', label: 'Fraud' }] }) };
  const study = { id: 'case-001', data: schemas.cases.parse({ ...base, slug: 'case-001', title: 'Tracing review', chart: chart.id, category: 'hacks', content_kind: 'case_study' }) };
  const page = { data: schemas.pages.parse({ ...base, slug: 'casework', title: 'Casework', profile: 'person', charts: ['criminal'], section_order: ['charts'] }) };
  const records: ContentRecord[] = [
    { collection: 'pages', data: page.data, file: 'pages/casework.md', body: 'Casework introduction.' },
    { collection: 'charts', data: chart.data, file: 'charts/criminal.md', body: 'Chart introduction.' },
    { collection: 'cases', data: study.data, file: 'cases/case-001.md', body: 'Visible findings.' },
  ];
  return { chart, study, page, records };
}

test('search uses displayed Markdown prose and excludes comments and hidden HTML', () => {
  const text = markdownSearchText(`Visible **findings** and [evidence](https://example.com/secret-link-target).

<!-- COMMENT_SENTINEL -->
<div hidden><p>HIDDEN_SENTINEL</p></div>
<span style="display: none !important">STYLE_SENTINEL</span>
<span style="visibility:hidden">VISIBILITY_SENTINEL</span>
<span aria-hidden="true">ARIA_SENTINEL</span>
<script>SCRIPT_SENTINEL</script>
<template>TEMPLATE_SENTINEL</template>

<div>Visible HTML <strong>details</strong>.</div>

\`<div hidden>visible code sample</div>\`

![Diagram description](diagram.png)`);
  assert.match(text, /Visible findings and evidence/);
  assert.match(text, /Visible HTML details/);
  assert.match(text, /<div hidden>visible code sample<\/div>/);
  assert.match(text, /Diagram description/);
  assert.doesNotMatch(text, /SENTINEL|secret-link-target/);
});

test('MDX search keeps component prose while excluding hidden subtrees, props and expressions', () => {
  const text = mdxSearchText(`import Callout from './private-import';

<Callout title="PROP_SENTINEL">Visible component content.</Callout>
<div hidden>HIDDEN_SENTINEL</div>
<span style="display:none">STYLE_SENTINEL</span>
<span style={{display:'none'}}>OBJECT_STYLE_SENTINEL</span>
<span hidden={false}>Visible false attribute.</span>
{expressionSentinel}

\`<div hidden>visible code sample</div>\``);
  assert.match(text, /Visible component content/);
  assert.match(text, /visible code sample/);
  assert.match(text, /Visible false attribute/);
  assert.doesNotMatch(text, /SENTINEL|private-import|expressionSentinel/);
});

test('case links remain stable after category changes in search and graph nodes', () => {
  const { chart, study, records } = fixtures();
  const before = caseSearchRecords(records, false)[0].url;
  assert.equal(before, '/cases/case-001/');
  study.data.category = 'fraud';
  assert.equal(caseSearchRecords(records, false)[0].url, before);
  const visual = caseVisuals([chart], [study], 'case_study');
  assert.equal(visual.groups[0].cases[0].url, caseUrl(study.id));
  assert.equal(visual.tree.children?.[0].children?.[0].children?.[0].url, caseUrl(study.id));
});

test('deselected charts disappear consistently from routes and search', () => {
  const { chart, study, page, records } = fixtures();
  assert.equal(caseSearchRecords(records, false).length, 1);
  assert.equal(caseRoutes(selectedCaseCharts(page, [chart]), [study]).length, 2);
  page.data.charts = [];
  const charts = selectedCaseCharts(page, [chart]);
  assert.deepEqual(charts, []);
  assert.deepEqual(eligibleCases(charts, [study]), []);
  assert.deepEqual(caseRoutes(charts, [study]), []);
  assert.deepEqual(caseSearchRecords(records, false), []);
});

test('case publication requires a visible Casework page with its charts section', () => {
  const { chart, study, page } = fixtures();
  assert.deepEqual(selectedCaseCharts(undefined, [chart], true), []);
  page.data.publication_status = 'draft';
  assert.deepEqual(selectedCaseCharts(page, [chart]), []);
  assert.equal(eligibleCases(selectedCaseCharts(page, [chart], true), [study], true).length, 1);
  page.data.section_order = ['projects'];
  assert.deepEqual(selectedCaseCharts(page, [chart], true), []);
  page.data.section_order = ['charts'];
  page.data.publication_status = 'published';
  chart.data.publication_status = 'draft';
  assert.deepEqual(selectedCaseCharts(page, [chart]), []);
});

test('actual and example cases remain separated after adding stable routes', () => {
  const { chart, study, page, records } = fixtures();
  const sample = { id: 'sample', data: schemas.cases.parse({ ...base, slug: 'sample', publication_status: 'draft', title: 'Sample', chart: chart.id, category: 'hacks', content_kind: 'example' }) };
  assert.deepEqual(eligibleCases(selectedCaseCharts(page, [chart]), [study, sample]).map(({ id }) => id), [study.id]);
  records.push({ collection: 'cases', data: sample.data, file: 'cases/sample.md', body: 'Example narrative.' });
  assert.equal(caseSearchRecords(records, false).length, 1);
  assert.equal(caseSearchRecords(records, true).length, 2);
});
