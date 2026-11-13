import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { initializeSite, blankTemplateRoot, templateFiles } from '../scripts/init-site';
import { loadContent } from '../scripts/content';
import { builderRoot } from '../scripts/site-data';

test('new investigator sites use the complete blank pack and preserve existing destinations', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'employee-site-'));
  const target = path.join(parent, 'person');
  const previous = process.env.SITE_DATA_DIR;
  process.env.SITE_DATA_DIR = 'a-nonexistent-personal-directory';
  try {
    assert.equal(await initializeSite(target), target);
    assert.equal(JSON.parse(await readFile(path.join(target, 'site.json'), 'utf8')).url, 'https://example.com');
    const records = await loadContent(path.join(target, 'content'));
    assert.equal(records.length, 11);
    assert.ok(records.every(({ data }) => data.publication_status === 'draft'));
    assert.deepEqual(records.filter((entry) => entry.collection === 'pages').map(({ data }) => data.slug).sort(),
      ['about', 'casework', 'contact', 'credentials', 'home', 'resources', 'work-history']);
    assert.ok(records.every((entry) => ['pages', 'profile', 'contacts', 'charts'].includes(entry.collection)));
    assert.equal(records.find((entry) => entry.collection === 'profile')?.data.slug, 'investigator');
    assert.equal(records.find((entry) => entry.collection === 'contacts')?.data.slug, 'investigator');
    for (const file of await templateFiles()) {
      assert.deepEqual(await readFile(path.join(target, file)), await readFile(path.join(blankTemplateRoot, file)), file);
    }
    assert.match(await readFile(path.join(target, 'START-HERE.md'), 'utf8'), /Leave every.*draft/);
    assert.match(await readFile(path.join(target, 'record-templates/case.md'), 'utf8'), /subcategory: \[\]/);
    await writeFile(path.join(target, 'site.json'), 'Existing employee settings');
    await assert.rejects(initializeSite(target), /EEXIST/);
    assert.equal(await readFile(path.join(target, 'site.json'), 'utf8'), 'Existing employee settings');
    await assert.rejects(initializeSite(path.join(builderRoot, 'forbidden-starter')), /outside the public builder/);
  } finally {
    if (previous === undefined) delete process.env.SITE_DATA_DIR;
    else process.env.SITE_DATA_DIR = previous;
    await rm(parent, { recursive: true, force: true });
  }
});
