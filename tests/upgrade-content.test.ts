import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { upgradeContent } from '../scripts/upgrade-content';
import { builderRoot } from '../scripts/site-data';

const originalOrder = ['skills', 'volunteering', 'organizations', 'interests', 'github'];
async function fixture(order = originalOrder, newline = '\n') {
  const directory = await mkdtemp(path.join(tmpdir(), 'site-upgrade-'));
  await mkdir(path.join(directory, 'content/pages'), { recursive: true });
  await mkdir(path.join(directory, 'content/profile'), { recursive: true });
  await writeFile(path.join(directory, 'site.json'), JSON.stringify({ version: 1, url: 'https://example.com' }));
  await writeFile(path.join(directory, 'content/profile/person.md'), '---\nslug: person\nname: Example Person\nheadline: Investigator\ndescription_short: A profile.\n---\n\nProfile body.\n');
  const file = path.join(directory, 'content/pages/custom-about.mdx');
  const body = '\n\n## Keep this body\n\nimport Callout from "@components/Callout.astro";\n\n<Callout title="Body marker">Original text.</Callout>\n';
  const source = [
    '---', '# Keep this frontmatter comment.', 'slug: about', 'title: "About me"',
    'profile: person', 'publication_status: draft', 'description_short: Original description.',
    'section_order:', ...order.map((name) => `  - ${name}${name === 'skills' ? ' # Preserve this item comment.' : ''}`), '---',
  ].join('\n') + body;
  await writeFile(file, source.replace(/\n/g, newline));
  return { directory, file, original: source.replace(/\n/g, newline), body: body.replace(/\n/g, newline) };
}

test('content upgrades preview by default and preserve arbitrary filenames, comments, body, and publication', async () => {
  const data = await fixture();
  try {
    const result = await upgradeContent({ dataDirectory: data.directory });
    assert.equal(result.written, false);
    assert.equal(result.changes.length, 1);
    assert.equal(result.changes[0].file, data.file);
    assert.equal(await readFile(data.file, 'utf8'), data.original);
    assert.equal((await readdir(data.directory)).includes('migration-backups'), false);
    const applied = await upgradeContent({ dataDirectory: data.directory, write: true });
    assert.equal(applied.written, true);
    assert.ok(applied.backupDir);
    assert.equal(await readFile(path.join(applied.backupDir, 'content/pages/custom-about.mdx'), 'utf8'), data.original);
    const updated = await readFile(data.file, 'utf8');
    assert.match(updated, /# Keep this frontmatter comment\./);
    assert.match(updated, /skills # Preserve this item comment\./);
    assert.match(updated, /title: "About me"/);
    assert.match(updated, /publication_status: draft/);
    assert.ok(updated.endsWith(data.body));
    assert.ok(updated.indexOf('- interests') < updated.indexOf('- skills'));
    const again = await upgradeContent({ dataDirectory: data.directory, write: true });
    assert.equal(again.written, false);
    assert.equal(again.changes.length, 0);
    assert.equal((await readdir(path.join(data.directory, 'migration-backups'))).length, 1);
  } finally { await rm(data.directory, { recursive: true, force: true }); }
});

test('content upgrades leave custom section orders untouched and preserve CRLF files', async () => {
  const custom = await fixture(['github', ...originalOrder.slice(0, 4)]);
  const crlf = await fixture(originalOrder, '\r\n');
  try {
    assert.equal((await upgradeContent({ dataDirectory: custom.directory, write: true })).changes.length, 0);
    assert.equal(await readFile(custom.file, 'utf8'), custom.original);
    await upgradeContent({ dataDirectory: crlf.directory, write: true });
    const updated = await readFile(crlf.file, 'utf8');
    assert.ok(updated.endsWith(crlf.body));
    assert.equal(updated.replace(/\r\n/g, '').includes('\n'), false);
  } finally {
    await rm(custom.directory, { recursive: true, force: true });
    await rm(crlf.directory, { recursive: true, force: true });
  }
});

test('content upgrade CLI selects SITE_DATA_DIR and rejects unknown flags without writing', async () => {
  const data = await fixture();
  try {
    const run = (args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/upgrade-content.ts', ...args], {
      cwd: builderRoot, env: { ...process.env, SITE_DATA_DIR: data.directory }, encoding: 'utf8',
    });
    assert.equal(run([]).status, 0);
    assert.equal(await readFile(data.file, 'utf8'), data.original);
    assert.equal(run(['--force']).status, 1);
    assert.equal(await readFile(data.file, 'utf8'), data.original);
    assert.equal(run(['--write']).status, 0);
    assert.notEqual(await readFile(data.file, 'utf8'), data.original);
  } finally { await rm(data.directory, { recursive: true, force: true }); }
});
