import assert from 'node:assert/strict';
import { test } from 'node:test';
import { schemas, type ContentRecord } from '../src/content/schemas';
import { markdownSearchText } from '../src/lib/markdown-text';
import { mdxSearchText } from '../src/lib/mdx-text';
import { caseSearchRecords } from '../src/lib/search';

const markdown = `# Public investigation

Visible **fund tracing** and [public link](https://example.com/PRIVATE_LINK_DESTINATION).

![Public diagram description](https://example.com/PRIVATE_IMAGE_DESTINATION)

<!-- PRIVATE_COMMENT -->

<div hidden><span>PRIVATE_HIDDEN_CHILD</span></div>

<div hidden="false">PRIVATE_BOOLEAN_ATTRIBUTE</div>

<div aria-hidden="true">PRIVATE_ARIA</div>

<div style="color: red; display: none !important">PRIVATE_DISPLAY</div>

<div style="visibility: hidden;">PRIVATE_VISIBILITY</div>

<div style="visibility: collapse">PRIVATE_COLLAPSED</div>

<script>PRIVATE_SCRIPT</script>

<style>PRIVATE_STYLE</style>

<template><p>PRIVATE_TEMPLATE</p></template>

<head><title>PRIVATE_HEAD</title></head>

<div aria-hidden="false">Public visible HTML.</div>

<details><summary>Public details heading</summary>Public expandable prose.</details>

\`Public inline code\`

\`\`\`html
<div hidden>Public code example</div>
\`\`\`
`;

const mdx = `import Callout from "PRIVATE_MODULE";

export const metadata = "PRIVATE_EXPORT";

# Public MDX investigation

<Callout title="PRIVATE_COMPONENT_ATTRIBUTE">

Visible **fund tracing** inside a component.

</Callout>

![Public diagram description](https://example.com/PRIVATE_IMAGE_DESTINATION)

{/* PRIVATE_COMMENT */}

{(() => { throw new Error('PRIVATE_EXPRESSION'); })()}

<div hidden><span>PRIVATE_HIDDEN_CHILD</span></div>

<div hidden={true}>PRIVATE_TRUE_ATTRIBUTE</div>

<div hidden="false">PRIVATE_BOOLEAN_ATTRIBUTE</div>

<div hidden={false}>Public explicit false.</div>

<div hidden={(() => { throw new Error('PRIVATE_HIDDEN_EXPRESSION'); })()}>PRIVATE_DYNAMIC_HIDDEN</div>

<div aria-hidden="true">PRIVATE_ARIA</div>

<div aria-hidden={true}>PRIVATE_ARIA_BOOLEAN</div>

<div aria-hidden={"true"}>PRIVATE_ARIA_STRING</div>

<div style="display: none !important;">PRIVATE_DISPLAY_STRING</div>

<div style={{ display: 'none' }}>PRIVATE_DISPLAY_OBJECT</div>

<div style={{ visibility: 'hidden' }}>PRIVATE_VISIBILITY_OBJECT</div>

<div style={{ visibility: 'collapse' }}>PRIVATE_COLLAPSED_OBJECT</div>

<div style={{ display: 'block' }}>Public styled prose.</div>

<script>PRIVATE_SCRIPT</script>

<style>PRIVATE_STYLE</style>

<template><p>PRIVATE_TEMPLATE</p></template>

<head><title>PRIVATE_HEAD</title></head>

<details><summary>Public details heading</summary>Public expandable prose.</details>

\`Public inline code\`
`;

test('Markdown search keeps rendered prose, alt text and visible code while excluding hidden HTML and attributes', () => {
  const text = markdownSearchText(markdown);
  assert.match(text, /Public investigation/);
  assert.match(text, /Visible fund tracing and public link/);
  assert.match(text, /Public diagram description/);
  assert.match(text, /Public visible HTML/);
  assert.match(text, /Public details heading Public expandable prose/);
  assert.match(text, /Public inline code/);
  assert.match(text, /<div hidden>Public code example<\/div>/);
  assert.doesNotMatch(text, /PRIVATE_/);
});

test('MDX search excludes hidden subtrees without executing imports, expressions or attributes', () => {
  const text = mdxSearchText(mdx);
  assert.match(text, /Public MDX investigation/);
  assert.match(text, /Visible fund tracing inside a component/);
  assert.match(text, /Public diagram description/);
  assert.match(text, /Public explicit false/);
  assert.match(text, /Public styled prose/);
  assert.match(text, /Public details heading Public expandable prose/);
  assert.match(text, /Public inline code/);
  assert.doesNotMatch(text, /PRIVATE_/);
});

test('the real case search projection strips hidden Markdown and MDX while preserving current V1 titles, links and visibility', () => {
  const common = { publication_status: 'published', description_short: 'Public summary.' };
  const page: ContentRecord = { collection: 'pages', file: 'pages/casework.md', body: '',
    data: schemas.pages.parse({ ...common, slug: 'casework', title: 'Cases', profile: 'person', section_order: ['charts'], charts: ['investigations'] }) };
  const chart: ContentRecord = { collection: 'charts', file: 'charts/investigations.md', body: '',
    data: schemas.charts.parse({ ...common, slug: 'investigations', title: 'Investigations', categories: [{ id: 'fraud', label: 'Fraud' }] }) };
  const study = (slug: string, extension: 'md' | 'mdx', body: string, draft = false): ContentRecord => ({
    collection: 'cases', file: `cases/${slug}.${extension}`, body,
    data: schemas.cases.parse({ ...common, slug, title: `Public ${slug}`, case_number: `SEARCH-${slug}`, scope_summary: 'Public scope.',
      chart: 'investigations', category: 'fraud', subcategory: ['investment'], content_kind: 'case_study',
      publication_status: draft ? 'draft' : 'published', networks: ['ethereum'], off_chain_leads: ['email-addresses'],
      editorial_note: 'PRIVATE_EDITORIAL', blocks: { unused: 'PRIVATE_UNUSED_BLOCK' } }),
  });
  const records = [page, chart, study('markdown', 'md', markdown), study('mdx', 'mdx', mdx), study('draft', 'md', 'PRIVATE_DRAFT_CASE', true)];
  const search = caseSearchRecords(records, false);
  assert.equal(search.length, 2);
  assert.deepEqual(search.map(({ url }) => url).sort(), ['/investigations/investigations/fraud/#markdown', '/investigations/investigations/fraud/#mdx']);
  for (const result of search) {
    assert.match(result.meta.title, /^Case SEARCH-/);
    assert.match(result.content, /Public scope/);
    assert.match(result.content, /Public diagram description/);
    assert.deepEqual(result.filters.Network, ['Ethereum']);
  }
  assert.doesNotMatch(JSON.stringify(search), /PRIVATE_/);
  assert.equal(caseSearchRecords(records, true).length, 3);
  assert.match(caseSearchRecords(records, true).find(({ url }) => url.endsWith('#draft'))!.content, /PRIVATE_DRAFT_CASE/);
});
