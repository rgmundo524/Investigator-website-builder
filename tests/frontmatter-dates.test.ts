import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadContent } from '../scripts/content';

test('the content check catches unquoted dates before Astro parses them as timestamps', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'frontmatter-dates-'));
  try {
    await mkdir(path.join(root, 'articles'));
    const file = path.join(root, 'articles', 'essay.md');
    const source = '---\nslug: essay\ntitle: Essay\ndescription_short: Example article.\npublished_on: 2024-02-06\n---\n\nArticle body.\n';
    await writeFile(file, source);
    await assert.rejects(loadContent(root), /published_on:[\s\S]*quoted strings for dates/);
    await writeFile(file, source.replace('published_on: 2024-02-06', 'published_on: "2024-02-06"'));
    assert.equal((await loadContent(root)).length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
