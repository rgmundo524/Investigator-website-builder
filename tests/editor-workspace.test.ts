import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm, access, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stringify } from 'yaml';
import { EditorWorkspace, EditorWorkspaceError } from '../scripts/editor-workspace';
import { loadContent } from '../scripts/content';

const profile = { slug: 'person', publication_status: 'draft', name: 'A Person', headline: 'Investigator',
  description_short: 'Profile introduction.', blocks: { custom_note: 'Keep this unedited field.' }, editorial_note: 'Private editorial note.' };
const body = '\nFirst paragraph.\n\nSecond paragraph.\n';
async function record(root: string, file: string, data: unknown, content = body) {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), `---\n${stringify(data)}---\n${content}`);
}
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'editor-workspace-'));
  await mkdir(path.join(root, 'content'));
  await writeFile(path.join(root, 'site.json'), JSON.stringify({ version: 1, url: 'https://example.com' }));
  await record(root, 'content/profile/person.md', profile);
  await record(root, 'content/charts/criminal.md', { slug: 'criminal', publication_status: 'published', title: 'Criminal cases',
    description_short: 'Completed casework.', categories: [{ id: 'hacks', label: 'Hacks' }] });
  return { root, workspace: await EditorWorkspace.open(root), cleanup: () => rm(root, { recursive: true, force: true }) };
}
const caseData = { slug: 'case-one', publication_status: 'draft', title: 'Case One', description_short: 'A completed investigation.',
  chart: 'criminal', category: 'hacks', subcategory: [], content_kind: 'case_study' };

test('incomplete working drafts and discards never modify website source', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const file = 'content/profile/person.md';
    const source = await readFile(path.join(root, file), 'utf8');
    const current = await workspace.readRecord(file);
    const review = await workspace.saveDraft({ file, sourceHash: current.sourceHash, expectedDraftHash: null, data: { name: '' }, body: '' });
    assert.equal(review.canApply, false);
    assert.ok(review.issues.some((issue) => issue.includes('name')));
    assert.equal(await readFile(path.join(root, file), 'utf8'), source);
    assert.equal((await workspace.snapshot()).records.find((entry) => entry.file === file)?.hasDraft, true);
    assert.equal((await workspace.readRecord(file)).draft?.data.name, '');
    await workspace.discardDraft(file, review.draftHash);
    assert.equal((await workspace.readRecord(file)).draft, undefined);
    assert.equal(await readFile(path.join(root, file), 'utf8'), source);
  } finally { await cleanup(); }
});

test('snapshot distinguishes stored publication status from unapplied records and pending publication edits', async () => {
  const { workspace, cleanup } = await fixture();
  try {
    const file = 'content/profile/person.md';
    const current = await workspace.readRecord(file);
    await workspace.saveDraft({ file, sourceHash: current.sourceHash, expectedDraftHash: null,
      data: { publication_status: 'published', name: '' }, body: '' });
    const newFile = 'content/profile/new-person.md';
    const newDraft = await workspace.saveDraft({ file: newFile, sourceHash: null, expectedDraftHash: null,
      data: { ...profile, slug: 'new-person', publication_status: 'published' }, body });
    const before = await workspace.snapshot();
    const existing = before.records.find(entry => entry.file === file)!;
    assert.equal(existing.hasSource, true);
    assert.equal(existing.sourceValid, true, 'An invalid working draft does not invalidate the stored record');
    assert.equal(existing.publication_status, 'draft', 'Pending publication changes do not affect the stored status');
    const pending = before.records.find(entry => entry.file === newFile)!;
    assert.equal(pending.hasSource, false);
    assert.equal(pending.sourceValid, false, 'A complete new working draft is not available to the website before apply');
    assert.equal(pending.publication_status, 'published');
    assert.equal(pending.hasDraft, true);
    await workspace.applyDraft(newFile, 'published', newDraft.draftHash);
    const applied = (await workspace.snapshot()).records.find(entry => entry.file === newFile)!;
    assert.equal(applied.hasSource, true);
    assert.equal(applied.sourceValid, true);
    assert.equal(applied.publication_status, 'published');
    assert.equal(applied.hasDraft, false);
  } finally { await cleanup(); }
});

test('snapshot marks malformed, incomplete, or invalid MDX source unavailable without treating catalog relationships as record validity', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const expertise = { slug: 'invalid-schema', publication_status: 'published', title: '', description_short: 'A summary.' };
    await record(root, 'content/expertise/invalid-schema.md', expertise);
    await record(root, 'content/expertise/empty-body.md', { ...expertise, slug: 'empty-body', title: 'Empty body' }, '\n\n');
    await record(root, 'content/expertise/broken-mdx.mdx', { ...expertise, slug: 'broken-mdx', title: 'Broken MDX' }, '\n<Unclosed>\n');
    await writeFile(path.join(root, 'content/expertise/no-frontmatter.md'), 'A body without frontmatter.');
    const missingRelation = 'content/cases/missing-chart.md';
    await record(root, missingRelation, { ...caseData, slug: 'missing-chart', chart: 'missing' });
    const snapshot = await workspace.snapshot();
    for (const file of ['invalid-schema.md', 'empty-body.md', 'broken-mdx.mdx', 'no-frontmatter.md']) {
      const entry = snapshot.records.find(entry => entry.file === `content/expertise/${file}`)!;
      assert.equal(entry.hasSource, true, file);
      assert.equal(entry.sourceValid, false, file);
      assert.ok(entry.issues.length > 0, file);
    }
    const related = snapshot.records.find(entry => entry.file === missingRelation)!;
    assert.equal(related.hasSource, true);
    assert.equal(related.sourceValid, true, 'The record itself is valid even when another required record is absent');
    assert.ok(snapshot.issues.some(issue => issue.includes('references missing charts/missing')));
  } finally { await cleanup(); }
});

test('a repair saved as a working draft does not make invalid stored content available before apply', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const file = 'content/expertise/repair.md';
    await record(root, file, { slug: 'repair', title: '', description_short: 'A summary.', publication_status: 'published' });
    const current = await workspace.readRecord(file);
    const repair = await workspace.saveDraft({ file, sourceHash: current.sourceHash, expectedDraftHash: null, data: { title: 'Repaired record' } });
    assert.equal(repair.canApply, true, repair.issues.join('\n'));
    const before = (await workspace.snapshot()).records.find(entry => entry.file === file)!;
    assert.equal(before.hasSource, true);
    assert.equal(before.sourceValid, false);
    assert.equal(before.hasDraft, true);
    await workspace.applyDraft(file, 'published', repair.draftHash);
    const after = (await workspace.snapshot()).records.find(entry => entry.file === file)!;
    assert.equal(after.hasSource, true);
    assert.equal(after.sourceValid, true);
    assert.equal(after.hasDraft, false);
  } finally { await cleanup(); }
});

test('valid apply preserves untouched data and exact body and writes a recoverable original', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const file = 'content/profile/person.md';
    const original = await readFile(path.join(root, file), 'utf8');
    const current = await workspace.readRecord(file);
    const review = await workspace.saveDraft({ file, sourceHash: current.sourceHash, expectedDraftHash: null, data: { headline: 'Senior investigator' } });
    assert.equal(review.canApply, true);
    assert.deepEqual(review.changes, [{ field: 'headline', before: 'Investigator', after: 'Senior investigator' }]);
    const applied = await workspace.applyDraft(file, 'published', review.draftHash);
    assert.equal(applied.data.headline, 'Senior investigator');
    assert.equal(applied.data.publication_status, 'published');
    assert.equal(applied.data.editorial_note, profile.editorial_note);
    assert.deepEqual(applied.data.blocks, profile.blocks);
    assert.equal(applied.body, body);
    assert.equal(applied.draft, undefined);
    assert.ok(applied.backupFile);
    const backup = JSON.parse(await readFile(path.join(root, applied.backupFile!), 'utf8'));
    assert.equal(backup.source, original);
    assert.equal(backup.sourceHash, current.sourceHash);
  } finally { await cleanup(); }
});

test('an otherwise valid change cannot break whole-catalog relationships', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    await record(root, 'content/cases/case-one.md', caseData);
    const file = 'content/charts/criminal.md';
    const current = await workspace.readRecord(file);
    const review = await workspace.saveDraft({ file, sourceHash: current.sourceHash, expectedDraftHash: null,
      data: { categories: [{ id: 'different', label: 'Different' }] } });
    assert.equal(review.canApply, false);
    assert.ok(review.issues.some((issue) => issue.includes('category references missing')));
    await assert.rejects(workspace.applyDraft(file, 'published', review.draftHash), (error: unknown) => error instanceof EditorWorkspaceError && error.code === 'INVALID_DRAFT');
    assert.deepEqual((await workspace.readRecord(file)).data.categories, current.data.categories);
  } finally { await cleanup(); }
});

test('category additions, label changes, reordering, and unused removal preserve case references', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const chartFile = 'content/charts/criminal.md';
    const caseFile = 'content/cases/case-one.md';
    await record(root, caseFile, caseData);
    const caseSource = await readFile(path.join(root, caseFile), 'utf8');
    const current = await workspace.readRecord(chartFile);
    const categories = [{ id: 'asset-tracing', label: 'Asset tracing' }, { id: 'hacks', label: 'Wallet theft' }];
    const review = await workspace.saveDraft({ file: chartFile, sourceHash: current.sourceHash, expectedDraftHash: null,
      data: { categories } });
    assert.equal(review.canApply, true);
    assert.equal((await workspace.reviewDraft(chartFile)).canApply, true);
    await workspace.applyDraft(chartFile, 'published', review.draftHash);
    assert.deepEqual((await workspace.readRecord(chartFile)).data.categories, categories);
    assert.equal(await readFile(path.join(root, caseFile), 'utf8'), caseSource);

    const unchangedCase = await workspace.readRecord(caseFile);
    assert.equal(unchangedCase.data.category, 'hacks');
    const reassignment = await workspace.saveDraft({ file: caseFile, sourceHash: unchangedCase.sourceHash,
      expectedDraftHash: null, data: { category: 'asset-tracing' } });
    assert.equal(reassignment.canApply, true);
    await workspace.applyDraft(caseFile, 'draft', reassignment.draftHash);

    const updated = await workspace.readRecord(chartFile);
    const removal = await workspace.saveDraft({ file: chartFile, sourceHash: updated.sourceHash, expectedDraftHash: null,
      data: { categories: [categories[0]] } });
    assert.equal(removal.canApply, true);
    await workspace.applyDraft(chartFile, 'published', removal.draftHash);
    const loaded = await loadContent(path.join(root, 'content'));
    assert.equal(loaded.find((entry) => entry.collection === 'cases')?.data.category, 'asset-tracing');
    assert.deepEqual((await workspace.snapshot()).charts[0].categories, [categories[0]]);
  } finally { await cleanup(); }
});

test('duplicate category ids and labels cannot be applied or change source', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const file = 'content/charts/criminal.md';
    const current = await workspace.readRecord(file);
    const original = await readFile(path.join(root, file), 'utf8');
    for (const [categories, expectedIssue] of [
      [[{ id: 'hacks', label: 'Hacks' }, { id: 'hacks', label: 'Wallet theft' }], 'unique id'],
      [[{ id: 'hacks', label: 'Hacks' }, { id: 'wallet-theft', label: '  HACKS  ' }], 'unique label'],
    ] as const) {
      const review = await workspace.saveDraft({ file, sourceHash: current.sourceHash, expectedDraftHash: null,
        data: { categories } });
      assert.equal(review.canApply, false);
      assert.ok(review.issues.some((issue) => issue.includes(expectedIssue)));
      assert.equal((await workspace.reviewDraft(file)).canApply, false);
      await assert.rejects(workspace.applyDraft(file, 'published', review.draftHash),
        (error: unknown) => error instanceof EditorWorkspaceError && error.code === 'INVALID_DRAFT');
      assert.equal(await readFile(path.join(root, file), 'utf8'), original);
      await workspace.discardDraft(file, review.draftHash);
    }
  } finally { await cleanup(); }
});

test('applying a dated case preserves date strings for the website loader and clears its working draft', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const file = 'content/cases/case-one.md';
    const review = await workspace.saveDraft({ file, data: { ...caseData, opened_on: '2022-03-04', closed_on: '2022-04-05',
      jurisdictions: ['Canada', 'United States'],
      metrics: { reported_loss_usd: 25000 } },
    body, sourceHash: null, expectedDraftHash: null });
    await workspace.applyDraft(file, 'published', review.draftHash);
    const applied = (await loadContent(path.join(root, 'content'))).find((entry) => entry.collection === 'cases');
    assert.equal(applied?.data.opened_on, '2022-03-04');
    assert.equal(applied?.data.closed_on, '2022-04-05');
    assert.deepEqual(applied?.data.jurisdictions, ['Canada', 'United States']);
    assert.equal(applied?.data.metrics.reported_loss_usd, 25000);
    assert.equal('valuation_date' in (applied?.data.metrics ?? {}), false);
    assert.equal((await workspace.readRecord(file)).draft, undefined);
    assert.equal((await workspace.snapshot()).records.find((entry) => entry.file === file)?.hasDraft, false);
  } finally { await cleanup(); }
});

test('external edits make a staged change conflict instead of overwriting newer source', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const file = 'content/profile/person.md';
    const current = await workspace.readRecord(file);
    const review = await workspace.saveDraft({ file, sourceHash: current.sourceHash, expectedDraftHash: null, data: { headline: 'Pending change' } });
    const newer = `${await readFile(path.join(root, file), 'utf8')}\nAn external addition.\n`;
    await writeFile(path.join(root, file), newer);
    assert.equal((await workspace.reviewDraft(file)).canApply, false);
    await assert.rejects(workspace.applyDraft(file, 'draft', review.draftHash), (error: unknown) => error instanceof EditorWorkspaceError && error.code === 'CONFLICT');
    assert.equal(await readFile(path.join(root, file), 'utf8'), newer);
    const reloaded = await workspace.readRecord(file);
    await assert.rejects(workspace.saveDraft({ file, sourceHash: reloaded.sourceHash, expectedDraftHash: reloaded.draftHash, data: { headline: 'Fresh field on stale draft' } }), /older source/);
  } finally { await cleanup(); }
});

test('new drafts appear in the list without a source file and collisions and traversal are blocked', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const file = 'content/profile/new-person.md';
    const review = await workspace.saveDraft({ file, sourceHash: null, expectedDraftHash: null, data: { ...profile, slug: 'new-person' }, body });
    await assert.rejects(access(path.join(root, file)));
    const entry = (await workspace.snapshot()).records.find((entry) => entry.file === file);
    assert.equal(entry?.hasDraft, true);
    assert.equal(entry?.id, 'new-person');
    await workspace.applyDraft(file, 'draft', review.draftHash);
    assert.equal((await workspace.readRecord(file)).data.slug, 'new-person');
    await assert.rejects(workspace.saveDraft({ file, sourceHash: null, expectedDraftHash: null, data: profile, body }), /changed outside/);
    for (const unsafe of ['../outside.md', 'content/profile/../../outside.md', '/tmp/outside.md', 'content/unknown/a.md', 'content/profile\\outside.md']) {
      await assert.rejects(workspace.saveDraft({ file: unsafe, data: profile, body, sourceHash: null, expectedDraftHash: null }), (error: unknown) => error instanceof EditorWorkspaceError && error.code === 'INVALID_PATH');
    }
    const existing = await workspace.readRecord('content/profile/person.md');
    await assert.rejects(workspace.saveDraft({ file: existing.file, sourceHash: existing.sourceHash, expectedDraftHash: null, data: { slug: 'renamed' } }), /slug cannot be changed/);
    await record(root, 'content/profile/nested/duplicate.md', { ...profile, slug: 'duplicate' });
    const duplicate = await workspace.saveDraft({ file: 'content/profile/duplicate.md', data: { ...profile, slug: 'duplicate' }, body, sourceHash: null, expectedDraftHash: null });
    assert.equal(duplicate.canApply, false);
    assert.ok(duplicate.issues.some((issue) => issue.includes('duplicate slug')));
  } finally { await cleanup(); }
});

test('case records reject obsolete lifecycle and identifying count fields', async () => {
  const { workspace, cleanup } = await fixture();
  try {
    const file = 'content/cases/case-one.md';
    const review = await workspace.saveDraft({ file, data: { ...caseData, case_status: 'active', metrics: { wallets_reviewed: 12 } }, body, sourceHash: null, expectedDraftHash: null });
    assert.equal(review.canApply, false);
    for (const publication of ['draft', 'published'] as const) {
      await assert.rejects(workspace.applyDraft(file, publication, review.draftHash), (error: unknown) => error instanceof EditorWorkspaceError && error.code === 'INVALID_DRAFT');
    }
  } finally { await cleanup(); }
});

test('symlink content and editor-storage paths cannot escape the selected directory', async () => {
  const { root, workspace, cleanup } = await fixture();
  const outside = await mkdtemp(path.join(tmpdir(), 'editor-outside-'));
  try {
    await writeFile(path.join(outside, 'outside.md'), 'Outside sentinel');
    await symlink(path.join(outside, 'outside.md'), path.join(root, 'content/profile/linked.md'));
    await assert.rejects(workspace.readRecord('content/profile/linked.md'), /Symlinks/);
    await symlink(outside, path.join(root, '.website-editor'));
    const source = await readFile(path.join(root, 'content/profile/person.md'), 'utf8');
    await assert.rejects(workspace.saveDraft({ file: 'content/profile/person.md', sourceHash: (await workspace.readRecord('content/profile/person.md').catch(() => ({ sourceHash: null }))).sourceHash,
      data: { headline: 'Unsafe' }, expectedDraftHash: null }), /Symlinks|changed outside/);
    assert.equal(await readFile(path.join(root, 'content/profile/person.md'), 'utf8'), source);
  } finally { await cleanup(); await rm(outside, { recursive: true, force: true }); }
});

test('settings are staged separately and stale parallel edits cannot replace a working draft', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const settings = await workspace.readRecord('site.json');
    const settingsReview = await workspace.saveDraft({ file: 'site.json', data: { locale: 'fr-CA' }, sourceHash: settings.sourceHash, expectedDraftHash: null });
    assert.equal(JSON.parse(await readFile(path.join(root, 'site.json'), 'utf8')).locale, undefined);
    assert.equal((await workspace.applyDraft('site.json', 'draft', settingsReview.draftHash)).data.locale, 'fr-CA');
    const current = await workspace.readRecord('content/profile/person.md');
    const saves = await Promise.allSettled([
      workspace.saveDraft({ file: current.file, data: { headline: 'Updated headline' }, sourceHash: current.sourceHash, expectedDraftHash: null }),
      workspace.saveDraft({ file: current.file, data: { name: 'Updated name' }, sourceHash: current.sourceHash, expectedDraftHash: null }),
    ]);
    assert.equal(saves[0].status, 'fulfilled');
    assert.equal(saves[1].status, 'rejected');
    if (saves[1].status === 'rejected') assert.equal(saves[1].reason.code, 'CONFLICT');
    const review = await workspace.reviewDraft(current.file);
    assert.equal(review.draft.data.headline, 'Updated headline');
    assert.equal(review.draft.data.name, profile.name);
    const reloaded = await workspace.readRecord(current.file);
    assert.equal(reloaded.draftHash, review.draftHash);
    const retried = await workspace.saveDraft({ file: current.file, data: { name: 'Updated name' }, sourceHash: current.sourceHash, expectedDraftHash: reloaded.draftHash });
    assert.equal(retried.draft.data.headline, 'Updated headline');
    assert.equal(retried.draft.data.name, 'Updated name');
    assert.notEqual(retried.draftHash, review.draftHash);
    await assert.rejects(workspace.saveDraft({ file: current.file, data: {}, sourceHash: current.sourceHash,
      expectedDraftHash: retried.draftHash, removeFields: 'name' as unknown as string[] }), (error: unknown) => error instanceof EditorWorkspaceError && error.code === 'INVALID_DRAFT');
    const withoutEditorialNote = await workspace.saveDraft({ file: current.file, data: {}, sourceHash: current.sourceHash, expectedDraftHash: retried.draftHash, removeFields: ['editorial_note'] });
    assert.equal(withoutEditorialNote.draft.data.editorial_note, undefined);
  } finally { await cleanup(); }
});

test('a stale review cannot apply or discard a newer draft', async () => {
  const { workspace, cleanup } = await fixture();
  try {
    const file = 'content/profile/person.md';
    const current = await workspace.readRecord(file);
    assert.equal(current.draftHash, null);
    const first = await workspace.saveDraft({ file, data: { headline: 'First revision' }, sourceHash: current.sourceHash, expectedDraftHash: null });
    const second = await workspace.saveDraft({ file, data: { headline: 'Newer revision' }, sourceHash: current.sourceHash, expectedDraftHash: first.draftHash });
    for (const action of [() => workspace.applyDraft(file, 'published', first.draftHash), () => workspace.discardDraft(file, first.draftHash),
      () => workspace.discardDraft(file, null)]) {
      await assert.rejects(action(), (error: unknown) => error instanceof EditorWorkspaceError && error.code === 'CONFLICT');
    }
    const unchanged = await workspace.readRecord(file);
    assert.equal(unchanged.data.headline, profile.headline);
    assert.equal(unchanged.draft?.data.headline, 'Newer revision');
    await workspace.discardDraft(file, second.draftHash);
    await assert.rejects(workspace.applyDraft(file, 'published', second.draftHash), (error: unknown) => error instanceof EditorWorkspaceError && error.code === 'CONFLICT');
    await workspace.discardDraft(file, null);
    assert.equal((await workspace.readRecord(file)).draftHash, null);
  } finally { await cleanup(); }
});

test('renaming a case preserves source bytes, stable identity, and existing article links', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const oldFile = 'content/cases/case-one.md';
    await record(root, oldFile, { ...caseData, case_number: '10-557' }, '\r\n## Scope\r\n\r\nExact body.\r\n');
    await record(root, 'content/articles/context.md', { slug: 'context', publication_status: 'draft',
      title: 'Case context', description_short: 'A case reference.', related_cases: ['case-one'] });
    const articleSource = await readFile(path.join(root, 'content/articles/context.md'), 'utf8');
    const source = await readFile(path.join(root, oldFile), 'utf8');
    const current = await workspace.readRecord(oldFile);
    const renamed = await workspace.renameCase({ file: oldFile, newName: '10-557.md', sourceHash: current.sourceHash, expectedDraftHash: null });
    assert.equal(renamed.file, 'content/cases/10-557.md');
    assert.equal(renamed.oldFile, oldFile);
    assert.equal(renamed.oldId, 'case-one');
    assert.equal(renamed.newId, 'case-one');
    assert.equal(renamed.data.slug, 'case-one');
    assert.equal(renamed.sourceHash, current.sourceHash);
    assert.equal(await readFile(path.join(root, renamed.file), 'utf8'), source);
    assert.equal(await readFile(path.join(root, 'content/articles/context.md'), 'utf8'), articleSource);
    await assert.rejects(access(path.join(root, oldFile)));
    const backup = JSON.parse(await readFile(path.join(root, renamed.backupFile), 'utf8'));
    assert.equal(backup.source, source);
    assert.equal(backup.file, oldFile);
    assert.equal(backup.newFile, renamed.file);
    const loaded = await loadContent(path.join(root, 'content'));
    assert.equal(loaded.find((entry) => entry.collection === 'cases')?.data.slug, 'case-one');
    assert.deepEqual(loaded.find((entry) => entry.collection === 'articles')?.data.related_cases, ['case-one']);
  } finally { await cleanup(); }
});

test('case rename rejects collisions, unsafe names, extension changes, and stale source', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const file = 'content/cases/case-one.md';
    await record(root, file, caseData);
    const current = await workspace.readRecord(file);
    const input = { file, sourceHash: current.sourceHash, expectedDraftHash: null };
    for (const newName of ['../outside', 'UPPER', 'unsafe_name', '/tmp/outside.md', '10-557.mdx', 'case-one']) {
      await assert.rejects(workspace.renameCase({ ...input, newName }), (error: unknown) => error instanceof EditorWorkspaceError && error.code === 'INVALID_PATH');
    }
    await writeFile(path.join(root, 'content/cases/10-557.MD'), 'Existing file sentinel');
    await assert.rejects(workspace.renameCase({ ...input, newName: '10-557' }), /already uses/);
    assert.equal(await readFile(path.join(root, 'content/cases/10-557.MD'), 'utf8'), 'Existing file sentinel');
    await rm(path.join(root, 'content/cases/10-557.MD'));
    await writeFile(path.join(root, file), `${await readFile(path.join(root, file), 'utf8')}\nExternal change.\n`);
    await assert.rejects(workspace.renameCase({ ...input, newName: '10-557' }), /changed outside/);
    await assert.rejects(access(path.join(root, 'content/cases/10-557.md')));
  } finally { await cleanup(); }
});

test('case rename requires applied or discarded working drafts and validates catalog references', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const file = 'content/cases/case-one.md';
    await record(root, file, caseData);
    const current = await workspace.readRecord(file);
    const input = { file, newName: '10-557', sourceHash: current.sourceHash, expectedDraftHash: null };
    const draft = await workspace.saveDraft({ file, data: { title: 'New description' }, sourceHash: current.sourceHash, expectedDraftHash: null });
    await assert.rejects(workspace.renameCase(input), /working draft changed/);
    await assert.rejects(workspace.renameCase({ ...input, expectedDraftHash: draft.draftHash }), /Apply or discard/);
    await workspace.discardDraft(file, draft.draftHash);
    const targetDraft = await workspace.saveDraft({ file: 'content/cases/10-557.md', sourceHash: null, expectedDraftHash: null,
      data: { ...caseData, slug: '10-557' }, body });
    await assert.rejects(workspace.renameCase(input), /working draft already uses/);
    await workspace.discardDraft(targetDraft.draft.file, targetDraft.draftHash);
    await record(root, 'content/articles/broken.md', { slug: 'broken', publication_status: 'draft', title: 'Broken reference',
      description_short: 'A missing case reference.', related_cases: ['missing-case'] });
    await assert.rejects(workspace.renameCase(input), (error: unknown) => error instanceof EditorWorkspaceError
      && error.code === 'INVALID_DRAFT' && error.issues.some((issue) => issue.includes('references missing')));
    await access(path.join(root, file));
    await assert.rejects(access(path.join(root, 'content/cases/10-557.md')));
  } finally { await cleanup(); }
});

test('a destination created during rename is not overwritten and the original is restored', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const file = 'content/cases/case-one.md';
    await record(root, file, caseData);
    const source = await readFile(path.join(root, file), 'utf8');
    const current = await workspace.readRecord(file);
    const internal = workspace as unknown as { atomicWrite(file: string, source: string, expectedHash?: string | null): Promise<void> };
    const originalWrite = internal.atomicWrite.bind(workspace);
    internal.atomicWrite = async (name, value, expectedHash) => {
      await originalWrite(name, value, expectedHash);
      if (name.startsWith('.website-editor/backups/')) await writeFile(path.join(root, 'content/cases/10-557.md'), 'External destination sentinel');
    };
    await assert.rejects(workspace.renameCase({ file, newName: '10-557', sourceHash: current.sourceHash, expectedDraftHash: null }), /original case was restored/);
    assert.equal(await readFile(path.join(root, file), 'utf8'), source);
    assert.equal(await readFile(path.join(root, 'content/cases/10-557.md'), 'utf8'), 'External destination sentinel');
  } finally { await cleanup(); }
});

test('case rename retains the existing extension and rejects symlink destinations', async () => {
  const { root, workspace, cleanup } = await fixture();
  const outside = await mkdtemp(path.join(tmpdir(), 'editor-rename-outside-'));
  try {
    const file = 'content/cases/case-one.mdx';
    await record(root, file, caseData);
    const current = await workspace.readRecord(file);
    await writeFile(path.join(outside, 'sentinel.mdx'), 'Outside sentinel');
    await symlink(path.join(outside, 'sentinel.mdx'), path.join(root, 'content/cases/10-557.mdx'));
    await assert.rejects(workspace.renameCase({ file, newName: '10-557', sourceHash: current.sourceHash, expectedDraftHash: null }), /Symlinks/);
    assert.equal(await readFile(path.join(outside, 'sentinel.mdx'), 'utf8'), 'Outside sentinel');
    await rm(path.join(root, 'content/cases/10-557.mdx'));
    const renamed = await workspace.renameCase({ file, newName: '10-557', sourceHash: current.sourceHash, expectedDraftHash: null });
    assert.equal(renamed.file, 'content/cases/10-557.mdx');
  } finally { await cleanup(); await rm(outside, { recursive: true, force: true }); }
});
