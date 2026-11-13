import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stringify } from 'yaml';
import { EditorWorkspace, EditorWorkspaceError } from '../scripts/editor-workspace';

const file = 'content/cases/local-name.md';
const caseData = { slug: 'stable-case', publication_status: 'draft', case_number: '20-543', title: 'Case description',
  description_short: 'A completed investigation.', chart: 'criminal', category: 'hacks', content_kind: 'case_study' };
async function record(root: string, name: string, data: unknown) {
  await mkdir(path.dirname(path.join(root, name)), { recursive: true });
  await writeFile(path.join(root, name), `---\n${stringify(data)}---\nCase body.\n`);
}
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'case-removal-'));
  await mkdir(path.join(root, 'content'));
  await writeFile(path.join(root, 'site.json'), JSON.stringify({ version: 1, url: 'https://example.com' }));
  await record(root, file, caseData);
  const workspace = await EditorWorkspace.open(root);
  return { root, workspace, cleanup: () => rm(root, { recursive: true, force: true }) };
}
async function remove(workspace: EditorWorkspace, target = file) {
  const current = await workspace.readRecord(target);
  return workspace.removeCase({ file: target, sourceHash: current.sourceHash, expectedDraftHash: current.draftHash });
}

test('case removal is absent from the website and restores exact bytes, filename, and slug', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const exactSource = Buffer.from(`\uFEFF---\r\n${stringify(caseData).replaceAll('\n', '\r\n')}---\r\nKeep original formatting.\r\n`);
    await writeFile(path.join(root, file), exactSource);
    await mkdir(path.join(root, 'private-review'), { recursive: true });
    const manifest = '{"report":"do-not-change.pdf"}\n';
    await writeFile(path.join(root, 'private-review/report-manifest.json'), manifest);
    const removed = await remove(workspace);
    assert.deepEqual(Object.keys(removed).sort(), ['case_number', 'file', 'id', 'removedAt', 'title']);
    assert.equal(removed.case_number, '20-543');
    const snapshot = await workspace.snapshot();
    assert.deepEqual(snapshot.removedCases, [removed]);
    assert.equal(snapshot.records.some(record => record.file === file), false);
    await assert.rejects(workspace.readRecord(file), (error: unknown) => error instanceof EditorWorkspaceError && error.code === 'NOT_FOUND');
    assert.deepEqual(await readFile(path.join(root, '.website-editor/removed-cases', removed.id, 'source.md')), exactSource);
    assert.equal(await readFile(path.join(root, 'private-review/report-manifest.json'), 'utf8'), manifest);
    const restored = await workspace.restoreCase(removed.id);
    assert.equal(restored.file, file);
    assert.equal(restored.id, 'stable-case');
    assert.deepEqual(await readFile(path.join(root, file)), exactSource);
    assert.deepEqual((await workspace.snapshot()).removedCases, []);
    assert.equal((await workspace.snapshot()).records.some(record => record.file === file), true);
    await assert.rejects(workspace.restoreCase(removed.id), /no longer available/);
    // A restored file is a separate copy: edits cannot corrupt its recovery source.
    await writeFile(path.join(root, file), 'Edited later');
    assert.deepEqual(await readFile(path.join(root, `.website-editor/removed-cases/.restored-${removed.id}/source.md`)), exactSource);
  } finally { await cleanup(); }
});

test('stale source and working-draft revisions cannot remove a case', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const current = await workspace.readRecord(file);
    await writeFile(path.join(root, file), `${await readFile(path.join(root, file), 'utf8')}External change.\n`);
    await assert.rejects(workspace.removeCase({ file, sourceHash: current.sourceHash, expectedDraftHash: null }), /source changed/);
    const updated = await workspace.readRecord(file);
    const review = await workspace.saveDraft({ file, sourceHash: updated.sourceHash, expectedDraftHash: null, data: { title: 'Working title' } });
    await assert.rejects(workspace.removeCase({ file, sourceHash: updated.sourceHash, expectedDraftHash: null }), /working draft changed/);
    await assert.rejects(workspace.removeCase({ file, sourceHash: updated.sourceHash, expectedDraftHash: review.draftHash }), /Apply or discard/);
    await workspace.discardDraft(file, review.draftHash);
    assert.ok(await remove(workspace));
  } finally { await cleanup(); }
});

test('only existing case sources can be removed', async () => {
  const { workspace, cleanup } = await fixture();
  try {
    for (const target of ['site.json', 'content/articles/article.md', '../outside.md', '/tmp/outside.md', 'content/cases/../../outside.md']) {
      await assert.rejects(workspace.removeCase({ file: target, sourceHash: null, expectedDraftHash: null }),
        (error: unknown) => error instanceof EditorWorkspaceError && error.code === 'INVALID_PATH');
    }
    await assert.rejects(workspace.removeCase({ file: 'content/cases/missing.md', sourceHash: null, expectedDraftHash: null }), /no website record/);
    const newFile = 'content/cases/new-case.md';
    const review = await workspace.saveDraft({ file: newFile, sourceHash: null, expectedDraftHash: null, data: { ...caseData, slug: 'new-case' }, body: 'New case.' });
    await assert.rejects(workspace.removeCase({ file: newFile, sourceHash: null, expectedDraftHash: review.draftHash }), /Discard its new working draft/);
  } finally { await cleanup(); }
});

test('removal blocks source and saved-draft article references, including invalid article fields', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const article = 'content/articles/related.md';
    const articleData = { slug: 'related', publication_status: 'draft', title: 'Article', description_short: 'Article description.', related_cases: ['stable-case'] };
    await record(root, article, { ...articleData, unexpected_field: 'Does not hide references' });
    await assert.rejects(remove(workspace), (error: unknown) => error instanceof EditorWorkspaceError && error.code === 'CONFLICT' && error.issues.includes(article));
    await record(root, article, { ...articleData, related_cases: [] });
    const current = await workspace.readRecord(article);
    const draft = await workspace.saveDraft({ file: article, sourceHash: current.sourceHash, expectedDraftHash: null, data: { related_cases: ['stable-case'] } });
    await assert.rejects(remove(workspace), (error: unknown) => error instanceof EditorWorkspaceError && error.issues.includes(`${article} (working draft)`));
    await workspace.discardDraft(article, draft.draftHash);
    await remove(workspace);
  } finally { await cleanup(); }
});

test('unrelated validation errors and invalid case records do not prevent removal', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    await record(root, 'content/cases/unrelated.md', { slug: 'unrelated', title: 'Incomplete' });
    await record(root, file, { slug: 'stable-case', title: 'Invalid target', case_status: 'obsolete' });
    const removed = await remove(workspace);
    const restored = await workspace.restoreCase(removed.id);
    assert.equal(restored.data.title, 'Invalid target');
    assert.ok(restored.issues.length > 0);
    await writeFile(path.join(root, file), 'No frontmatter, but preserve this case file.');
    const malformed = await remove(workspace);
    await workspace.restoreCase(malformed.id);
    assert.equal(await readFile(path.join(root, file), 'utf8'), 'No frontmatter, but preserve this case file.');
  } finally { await cleanup(); }
});

test('restoration refuses filename, draft, and stable slug collisions', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const removed = await remove(workspace);
    await writeFile(path.join(root, file), 'External replacement');
    await assert.rejects(workspace.restoreCase(removed.id), /file already uses/);
    assert.equal(await readFile(path.join(root, file), 'utf8'), 'External replacement');
    await rm(path.join(root, file));
    await record(root, 'content/cases/other-name.md', caseData);
    await assert.rejects(workspace.restoreCase(removed.id), /case identifier/);
    await rm(path.join(root, 'content/cases/other-name.md'));
    const sameFileDraft = await workspace.saveDraft({ file, data: { ...caseData, slug: 'local-name' }, body: 'Draft', sourceHash: null, expectedDraftHash: null });
    await assert.rejects(workspace.restoreCase(removed.id), /working draft already uses/);
    await workspace.discardDraft(file, sameFileDraft.draftHash);
    const otherDraftFile = 'content/cases/stable-case.md';
    const sameSlugDraft = await workspace.saveDraft({ file: otherDraftFile, data: caseData, body: 'Draft', sourceHash: null, expectedDraftHash: null });
    await assert.rejects(workspace.restoreCase(removed.id), /case identifier/);
    await workspace.discardDraft(otherDraftFile, sameSlugDraft.draftHash);
    assert.equal((await workspace.snapshot()).removedCases.length, 1);
    await workspace.restoreCase(removed.id);
  } finally { await cleanup(); }
});

test('recovery IDs, content paths, and archive storage reject symlinks and traversal', async () => {
  const { root, workspace, cleanup } = await fixture();
  const outside = await mkdtemp(path.join(tmpdir(), 'case-removal-outside-'));
  try {
    for (const id of ['../outside', '/tmp/outside', '', 'not-a-uuid']) await assert.rejects(workspace.restoreCase(id), /Choose a removed case/);
    const original = await readFile(path.join(root, file));
    await writeFile(path.join(outside, 'source.md'), original);
    await rm(path.join(root, file));
    await symlink(path.join(outside, 'source.md'), path.join(root, file));
    await assert.rejects(remove(workspace), /Symlinks/);
    await rm(path.join(root, file));
    await writeFile(path.join(root, file), original);
    await symlink(outside, path.join(root, '.website-editor'));
    await assert.rejects(remove(workspace), /Symlinks/);
    assert.deepEqual(await readFile(path.join(outside, 'source.md')), original);
    await rm(path.join(root, '.website-editor'));
    const removed = await remove(workspace);
    const archiveDir = path.join(root, '.website-editor/removed-cases', removed.id);
    await rm(path.join(archiveDir, 'source.md'));
    await symlink(path.join(outside, 'source.md'), path.join(archiveDir, 'source.md'));
    await assert.rejects(workspace.restoreCase(removed.id), /Symlinks/);
  } finally { await cleanup(); await rm(outside, { recursive: true, force: true }); }
});

test('tampered recovery bytes are not restored and metadata stays private in snapshots', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const removed = await remove(workspace);
    await writeFile(path.join(root, '.website-editor/removed-cases', removed.id, 'source.md'), 'Changed recovery copy');
    await assert.rejects(workspace.restoreCase(removed.id), /recovery copy changed/);
    const snapshot = await workspace.snapshot();
    assert.deepEqual(snapshot.removedCases, [removed]);
    assert.equal('sourceHash' in snapshot.removedCases[0], false);
    assert.equal('slug' in snapshot.removedCases[0], false);
    assert.equal((await readdir(path.join(root, 'content/cases'))).length, 0);
  } finally { await cleanup(); }
});

test('concurrent removal and restoration do not create duplicate records or overwrite data', async () => {
  const { workspace, cleanup } = await fixture();
  try {
    const current = await workspace.readRecord(file);
    const removal = { file, sourceHash: current.sourceHash, expectedDraftHash: null };
    const attempts = await Promise.allSettled([workspace.removeCase(removal), workspace.removeCase(removal)]);
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
    const removed = (await workspace.snapshot()).removedCases[0];
    const restorations = await Promise.allSettled([workspace.restoreCase(removed.id), workspace.restoreCase(removed.id)]);
    assert.equal(restorations.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((await workspace.snapshot()).records.filter(record => record.file === file).length, 1);
  } finally { await cleanup(); }
});
