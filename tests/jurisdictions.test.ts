import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stringify } from 'yaml';
import { JURISDICTION_OPTIONS, jurisdictionOptions } from '../src/lib/jurisdictions';
import { EditorWorkspace } from '../scripts/editor-workspace';

test('jurisdiction choices cover 249 unique countries and territories with consistent existing labels', () => {
  assert.equal(JURISDICTION_OPTIONS.length, 249);
  assert.equal(new Set(JURISDICTION_OPTIONS.map(({ value }) => value)).size, 249);
  assert.deepEqual(JURISDICTION_OPTIONS, [...JURISDICTION_OPTIONS].sort((a, b) => a.label.localeCompare(b.label, 'en')));
  for (const option of JURISDICTION_OPTIONS) {
    assert.equal(option.value, option.label);
    assert.equal(option.value, option.value.trim());
  }
  for (const value of ['British Virgin Islands', 'Canada', 'Czech Republic', 'Mexico', 'Montenegro', 'Spain',
    'Switzerland', 'United States', 'United Kingdom', 'North Korea', 'South Korea', 'Åland Islands']) {
    assert.ok(JURISDICTION_OPTIONS.some((option) => option.value === value), value);
  }
});

test('custom jurisdiction choices retain exact values, deduplicate, and do not change the standard list', () => {
  const options = jurisdictionOptions(['United States', 'Regional jurisdiction', 'Regional jurisdiction', 'Custom Area', null, '', '   ', 123]);
  assert.equal(options.length, 251);
  assert.deepEqual(options.filter(({ value }) => ['Regional jurisdiction', 'Custom Area'].includes(value)), [
    { value: 'Custom Area', label: 'Custom Area' },
    { value: 'Regional jurisdiction', label: 'Regional jurisdiction' },
  ]);
  assert.equal(JURISDICTION_OPTIONS.length, 249);
});

test('workspace jurisdiction choices preserve source, saved-draft, and new-draft locations', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'jurisdiction-options-'));
  const writeRecord = async (file: string, data: unknown) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), `---\n${stringify(data)}---\nTemporary test record.\n`);
  };
  try {
    await mkdir(path.join(root, 'content'), { recursive: true });
    await writeFile(path.join(root, 'site.json'), JSON.stringify({ version: 1, url: 'https://example.com' }));
    const caseData = { slug: 'jurisdiction-test', publication_status: 'draft', title: 'Jurisdiction test',
      description_short: 'Temporary jurisdiction test.', chart: 'criminal', category: 'hacks', content_kind: 'case_study',
      jurisdictions: ['United States', 'Source-only jurisdiction'] };
    await writeRecord('content/cases/jurisdiction-test.md', caseData);
    const workspace = await EditorWorkspace.open(root);
    const current = await workspace.readRecord('content/cases/jurisdiction-test.md');
    await workspace.saveDraft({ file: current.file, sourceHash: current.sourceHash, expectedDraftHash: null,
      data: { jurisdictions: ['Canada', 'Draft-only jurisdiction'] } });
    await workspace.saveDraft({ file: 'content/cases/new-jurisdiction.md', sourceHash: null, expectedDraftHash: null,
      data: { ...caseData, slug: 'new-jurisdiction', jurisdictions: ['New-draft jurisdiction'] }, body: 'New draft only.' });
    const options = (await workspace.snapshot()).jurisdictionOptions;
    for (const value of ['United States', 'Canada', 'Source-only jurisdiction', 'Draft-only jurisdiction', 'New-draft jurisdiction']) {
      assert.equal(options.filter((option) => option.value === value).length, 1, value);
    }
    assert.equal(options.length, 252);
    assert.deepEqual((await workspace.readRecord(current.file)).data.jurisdictions, caseData.jurisdictions);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
