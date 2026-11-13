import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stringify } from 'yaml';
import { loadContent } from '../scripts/content';
import { EditorWorkspace, EditorWorkspaceError } from '../scripts/editor-workspace';

const expertiseFile = 'content/expertise/focus.md';
const sourcePage = 'content/pages/work-history.md';
const destinationPage = 'content/pages/home.md';
const expertiseBody = '\nAn explanation with its original wording.\n\n- Evidence and limitations.\n';
const expertiseData = {
  slug: 'focus', publication_status: 'published', title: 'Investigative focus',
  description_short: 'A concise description.', blocks: { litigation_relevance: 'Preserve this passage.' },
  links: [{ label: 'Reference', url: 'https://example.com/reference' }], editorial_note: 'Keep this private note.',
};

async function record(root: string, file: string, data: unknown, body = '\nOriginal page or record body.\n') {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), `---\n${stringify(data)}---\n${body}`);
}

function page(slug: string, expertise: string[], publication_status: 'draft' | 'published' = 'draft') {
  return { slug, publication_status, title: slug === 'home' ? 'Home' : slug === 'about' ? 'About' : 'Work History',
    profile: 'person', description_short: 'Page search description.', expertise,
    section_order: slug === 'about' ? ['biography'] : ['expertise'],
    navigation: { label: slug === 'home' ? 'Home' : slug === 'about' ? 'About' : 'Work History', order: 10 },
    blocks: { expertise_heading: 'Page-specific expertise', custom_passage: 'Keep the page wording.' },
    editorial_note: 'Preserve the page note.' };
}

async function fixture(homePublished = false) {
  const root = await mkdtemp(path.join(tmpdir(), 'expertise-reuse-'));
  await mkdir(path.join(root, 'content'));
  await writeFile(path.join(root, 'site.json'), JSON.stringify({ version: 1, url: 'https://example.com' }));
  await record(root, 'content/profile/person.md', { slug: 'person', publication_status: 'published',
    name: 'A Person', headline: 'Investigator', description_short: 'Profile introduction.' });
  await record(root, expertiseFile, expertiseData, expertiseBody);
  for (const slug of ['first', 'last', 'home-focus']) {
    await record(root, `content/expertise/${slug}.md`, { ...expertiseData, slug, title: slug });
  }
  await record(root, sourcePage, page('work-history', ['first', 'focus', 'last']));
  await record(root, destinationPage, page('home', ['home-focus', 'focus'], homePublished ? 'published' : 'draft'));
  await record(root, 'content/pages/about.md', page('about', []));
  await record(root, 'content/experience/employment.md', { slug: 'employment', publication_status: 'published',
    organization: 'An Organization', role: 'Investigator', periods: [], active_position: false,
    description_short: 'Employment summary.', expertise: ['focus'] });
  return { root, workspace: await EditorWorkspace.open(root), cleanup: () => rm(root, { recursive: true, force: true }) };
}

const conflict = (error: unknown) => error instanceof EditorWorkspaceError && error.code === 'CONFLICT';
const invalidDraft = (error: unknown) => error instanceof EditorWorkspaceError && error.code === 'INVALID_DRAFT';
const sources = (root: string, files: string[]) => Promise.all(files.map(file => readFile(path.join(root, file), 'utf8')));

test('one reusable expertise record can appear on several pages and in an employment record', async () => {
  const { root, workspace, cleanup } = await fixture(true);
  try {
    await record(root, 'content/pages/about.md', { ...page('about', ['focus']), section_order: [] });
    const records = await loadContent(path.join(root, 'content'));
    assert.equal(records.filter(entry => entry.collection === 'expertise' && entry.data.slug === 'focus').length, 1);
    assert.equal(records.filter(entry => entry.collection === 'pages' && entry.data.expertise.includes('focus')).length, 3);
    assert.deepEqual((await workspace.readRecord('content/experience/employment.md')).data.expertise, ['focus']);
    assert.deepEqual((await workspace.snapshot()).issues, []);
  } finally { await cleanup(); }
});

test('each page still rejects duplicate references and missing records', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const current = await workspace.readRecord(sourcePage);
    const original = await readFile(path.join(root, sourcePage), 'utf8');
    for (const [expertise, issue] of [[['focus', 'focus'], 'duplicate reference in expertise'], [['missing'], 'references missing expertise/missing']] as const) {
      const review = await workspace.saveDraft({ file: sourcePage, sourceHash: current.sourceHash,
        expectedDraftHash: null, data: { expertise } });
      assert.equal(review.canApply, false);
      assert.ok(review.issues.some(value => value.includes(issue)), review.issues.join('\n'));
      await assert.rejects(workspace.applyDraft(sourcePage, 'draft', review.draftHash), invalidDraft);
      assert.equal(await readFile(path.join(root, sourcePage), 'utf8'), original);
      await workspace.discardDraft(sourcePage, review.draftHash);
    }
  } finally { await cleanup(); }
});

test('editing shared record wording preserves all page selections and independent page working drafts', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const files = [sourcePage, destinationPage, 'content/experience/employment.md'];
    const originalSources = await sources(root, files);
    const currentPage = await workspace.readRecord(sourcePage);
    const pageDraft = await workspace.saveDraft({ file: sourcePage, sourceHash: currentPage.sourceHash,
      expectedDraftHash: null, data: { expertise: ['last', 'first'], blocks: { expertise_heading: 'A pending page heading' } } });
    const current = await workspace.readRecord(expertiseFile);
    const originalExpertise = await readFile(path.join(root, expertiseFile), 'utf8');
    const review = await workspace.saveDraft({ file: expertiseFile, sourceHash: current.sourceHash,
      expectedDraftHash: null, data: { description_short: 'Updated shared wording.' } });
    assert.equal(review.canApply, true, review.issues.join('\n'));
    assert.deepEqual(review.changes, [{ field: 'description_short', before: expertiseData.description_short, after: 'Updated shared wording.' }]);
    const applied = await workspace.applyDraft(expertiseFile, 'published', review.draftHash);
    assert.equal(applied.body, expertiseBody);
    assert.deepEqual(applied.data.blocks, expertiseData.blocks);
    assert.deepEqual(applied.data.links, expertiseData.links);
    assert.equal(applied.data.editorial_note, expertiseData.editorial_note);
    assert.deepEqual(await sources(root, files), originalSources);
    assert.equal((await workspace.readRecord(sourcePage)).draftHash, pageDraft.draftHash);
    assert.deepEqual((await workspace.readRecord(sourcePage)).draft, pageDraft.draft);
    assert.equal(applied.backupFiles.length, 1);
    const backup = JSON.parse(await readFile(path.join(root, applied.backupFile!), 'utf8'));
    assert.equal(backup.file, expertiseFile);
    assert.equal(backup.source, originalExpertise);
    await loadContent(path.join(root, 'content'));
  } finally { await cleanup(); }
});

test('a page chooses shared records, its section position, and its own heading without rewriting the library or other pages', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const file = 'content/pages/about.md';
    const otherFiles = [expertiseFile, sourcePage, destinationPage, 'content/experience/employment.md'];
    const originals = await sources(root, otherFiles);
    const current = await workspace.readRecord(file);
    const originalPage = await readFile(path.join(root, file), 'utf8');
    const review = await workspace.saveDraft({ file, sourceHash: current.sourceHash, expectedDraftHash: null,
      data: { expertise: ['last', 'focus', 'first'], section_order: ['biography', 'expertise'], blocks: { expertise_heading: 'About my practice' } } });
    assert.equal(review.canApply, true, review.issues.join('\n'));
    assert.deepEqual(await sources(root, otherFiles), originals);
    assert.equal(await readFile(path.join(root, file), 'utf8'), originalPage);
    const applied = await workspace.applyDraft(file, 'draft', review.draftHash);
    assert.deepEqual(applied.data.expertise, ['last', 'focus', 'first']);
    assert.deepEqual(applied.data.section_order, ['biography', 'expertise']);
    assert.deepEqual(applied.data.blocks, { ...current.data.blocks as object, expertise_heading: 'About my practice' });
    assert.equal(applied.data.editorial_note, current.data.editorial_note);
    assert.equal(applied.body, current.body);
    assert.deepEqual(await sources(root, otherFiles), originals);
    assert.equal(applied.backupFiles.length, 1);
    assert.equal(JSON.parse(await readFile(path.join(root, applied.backupFile!), 'utf8')).source, originalPage);
    await loadContent(path.join(root, 'content'));
  } finally { await cleanup(); }
});

test('removing or reordering a page selection leaves other uses of the shared record intact', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const otherFiles = [expertiseFile, destinationPage, 'content/experience/employment.md'];
    const originals = await sources(root, otherFiles);
    let current = await workspace.readRecord(sourcePage);
    const reorder = await workspace.saveDraft({ file: sourcePage, sourceHash: current.sourceHash,
      expectedDraftHash: null, data: { expertise: ['focus', 'last', 'first'] } });
    assert.equal(reorder.canApply, true, reorder.issues.join('\n'));
    await workspace.applyDraft(sourcePage, 'draft', reorder.draftHash);
    current = await workspace.readRecord(sourcePage);
    assert.deepEqual(current.data.expertise, ['focus', 'last', 'first']);
    const removal = await workspace.saveDraft({ file: sourcePage, sourceHash: current.sourceHash,
      expectedDraftHash: null, data: { expertise: ['last', 'first'] } });
    assert.equal(removal.canApply, true, removal.issues.join('\n'));
    await workspace.applyDraft(sourcePage, 'draft', removal.draftHash);
    assert.deepEqual((await workspace.readRecord(sourcePage)).data.expertise, ['last', 'first']);
    assert.deepEqual(await sources(root, otherFiles), originals);
    assert.deepEqual((await workspace.readRecord(destinationPage)).data.expertise, ['home-focus', 'focus']);
    await loadContent(path.join(root, 'content'));
  } finally { await cleanup(); }
});

test('a changed page conflicts with its own placement draft before writing anything else', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const files = [expertiseFile, destinationPage];
    const originals = await sources(root, files);
    const current = await workspace.readRecord(sourcePage);
    const review = await workspace.saveDraft({ file: sourcePage, sourceHash: current.sourceHash,
      expectedDraftHash: null, data: { expertise: ['last', 'focus'] } });
    const changed = `${await readFile(path.join(root, sourcePage), 'utf8')}\nA separate page edit.\n`;
    await writeFile(path.join(root, sourcePage), changed);
    assert.equal((await workspace.reviewDraft(sourcePage)).canApply, false);
    await assert.rejects(workspace.applyDraft(sourcePage, 'draft', review.draftHash), conflict);
    assert.equal(await readFile(path.join(root, sourcePage), 'utf8'), changed);
    assert.deepEqual(await sources(root, files), originals);
    assert.equal((await workspace.readRecord(sourcePage)).draftHash, review.draftHash);
  } finally { await cleanup(); }
});

test('new expertise is saved independently before a page chooses where to display it', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const file = 'content/expertise/new-focus.md';
    const pageFiles = [sourcePage, destinationPage, 'content/pages/about.md'];
    const originals = await sources(root, pageFiles);
    const review = await workspace.saveDraft({ file, sourceHash: null, expectedDraftHash: null,
      data: { ...expertiseData, slug: 'new-focus', title: 'A new focus' }, body: expertiseBody });
    assert.equal(review.canApply, true, review.issues.join('\n'));
    await assert.rejects(access(path.join(root, file)));
    const applied = await workspace.applyDraft(file, 'published', review.draftHash);
    assert.equal(applied.body, expertiseBody);
    assert.equal(applied.backupFile, null);
    assert.deepEqual(applied.backupFiles, []);
    assert.deepEqual(await sources(root, pageFiles), originals);
    const about = await workspace.readRecord('content/pages/about.md');
    const selection = await workspace.saveDraft({ file: about.file, sourceHash: about.sourceHash,
      expectedDraftHash: null, data: { expertise: ['new-focus'], section_order: ['biography', 'expertise'] } });
    assert.equal(selection.canApply, true, selection.issues.join('\n'));
    await workspace.applyDraft(about.file, 'draft', selection.draftHash);
    assert.deepEqual((await workspace.readRecord(about.file)).data.expertise, ['new-focus']);
    assert.deepEqual(await sources(root, pageFiles.slice(0, 2)), originals.slice(0, 2));
    await loadContent(path.join(root, 'content'));
  } finally { await cleanup(); }
});

test('published page selections still require published shared records', async () => {
  const { root, workspace, cleanup } = await fixture(true);
  try {
    await record(root, 'content/expertise/new-focus.md', { ...expertiseData, slug: 'new-focus', publication_status: 'draft' }, expertiseBody);
    const current = await workspace.readRecord(destinationPage);
    const originalPage = await readFile(path.join(root, destinationPage), 'utf8');
    const review = await workspace.saveDraft({ file: destinationPage, sourceHash: current.sourceHash,
      expectedDraftHash: null, data: { expertise: ['home-focus', 'focus', 'new-focus'] } });
    assert.equal(review.canApply, false);
    assert.ok(review.issues.some(issue => issue.includes('published content references draft expertise/new-focus')));
    await assert.rejects(workspace.applyDraft(destinationPage, 'published', review.draftHash), invalidDraft);
    assert.equal(await readFile(path.join(root, destinationPage), 'utf8'), originalPage);
    const expertise = await workspace.readRecord('content/expertise/new-focus.md');
    const publish = await workspace.saveDraft({ file: expertise.file, sourceHash: expertise.sourceHash,
      expectedDraftHash: null, data: {} });
    await workspace.applyDraft(expertise.file, 'published', publish.draftHash);
    assert.equal((await workspace.reviewDraft(destinationPage)).canApply, true);
    await workspace.applyDraft(destinationPage, 'published', review.draftHash);
    assert.deepEqual((await workspace.readRecord(destinationPage)).data.expertise, ['home-focus', 'focus', 'new-focus']);
    await loadContent(path.join(root, 'content'));
  } finally { await cleanup(); }
});

test('older placement drafts preserve their pending wording and report stale intent before save or apply', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const current = await workspace.readRecord(expertiseFile);
    const files = [expertiseFile, sourcePage, destinationPage];
    const originals = await sources(root, files);
    const stored = `${JSON.stringify({ file: expertiseFile, sourceHash: current.sourceHash,
      data: { ...current.data, title: 'Pending wording from the older editor' }, body: expertiseBody,
      expertisePlacement: { pageId: 'about', pages: [{ file: sourcePage, sourceHash: (await workspace.readRecord(sourcePage)).sourceHash }] } }, null, 2)}\n`;
    const draftFile = `.website-editor/drafts/${createHash('sha256').update(expertiseFile).digest('hex')}.json`;
    await mkdir(path.join(root, '.website-editor/drafts'), { recursive: true });
    await writeFile(path.join(root, draftFile), stored);
    const reopened = await workspace.readRecord(expertiseFile);
    assert.equal(reopened.draft?.data.title, 'Pending wording from the older editor');
    assert.ok(reopened.issues.some(issue => issue.includes('older page-placement change')));
    const summary = (await workspace.snapshot()).records.find(entry => entry.file === expertiseFile);
    assert.equal(summary?.hasDraft, true);
    assert.ok(summary?.issues.some(issue => issue.includes('older page-placement change')));
    const review = await workspace.reviewDraft(expertiseFile);
    assert.equal(review.canApply, false);
    assert.ok(review.issues.some(issue => issue.includes('older page-placement change')));
    assert.deepEqual(review.changes, [{ field: 'title', before: expertiseData.title, after: 'Pending wording from the older editor' }]);
    await assert.rejects(workspace.applyDraft(expertiseFile, 'published', review.draftHash), invalidDraft);
    await assert.rejects(workspace.saveDraft({ file: expertiseFile, sourceHash: current.sourceHash,
      expectedDraftHash: reopened.draftHash, data: { title: 'Another edit' } }), invalidDraft);
    assert.equal(await readFile(path.join(root, draftFile), 'utf8'), stored);
    assert.deepEqual(await sources(root, files), originals);
    await workspace.discardDraft(expertiseFile, review.draftHash);
    assert.equal((await workspace.readRecord(expertiseFile)).draft, undefined);
  } finally { await cleanup(); }
});

test('an older editor cannot silently submit placement controls through a record save', async () => {
  const { root, workspace, cleanup } = await fixture();
  try {
    const current = await workspace.readRecord(expertiseFile);
    const originals = await sources(root, [expertiseFile, sourcePage, destinationPage]);
    const oldInput = { file: expertiseFile, sourceHash: current.sourceHash, expectedDraftHash: null,
      data: { title: 'An older form edit' }, expertisePage: 'about', expectedExpertisePages: ['home', 'work-history'] };
    await assert.rejects(workspace.saveDraft(oldInput), (error: unknown) => {
      assert.ok(error instanceof EditorWorkspaceError);
      assert.equal(error.code, 'INVALID_DRAFT');
      assert.match(error.message, /Page placement is edited on Pages/);
      return true;
    });
    assert.deepEqual(await sources(root, [expertiseFile, sourcePage, destinationPage]), originals);
    assert.equal((await workspace.readRecord(expertiseFile)).draft, undefined);
  } finally { await cleanup(); }
});

for (const isNew of [false, true]) {
  test(`a failed ${isNew ? 'new record' : 'page selection'} write preserves sources, working draft, and recovery copies`, async () => {
    const { root, workspace, cleanup } = await fixture();
    try {
      const file = isNew ? 'content/expertise/new-focus.md' : sourcePage;
      const current = isNew ? undefined : await workspace.readRecord(file);
      const files = [expertiseFile, sourcePage, destinationPage];
      const originals = await sources(root, files);
      const review = await workspace.saveDraft({ file, sourceHash: current?.sourceHash ?? null, expectedDraftHash: null,
        data: isNew ? { ...expertiseData, slug: 'new-focus' } : { expertise: ['last', 'focus'] },
        ...(isNew ? { body: expertiseBody } : {}) });
      assert.equal(review.canApply, true, review.issues.join('\n'));
      const storage = workspace as unknown as { atomicWrite(file: string, source: string, expectedHash?: string | null): Promise<void> };
      const atomicWrite = storage.atomicWrite.bind(workspace);
      storage.atomicWrite = async (target, source, expectedHash) => {
        if (target === file) throw new Error('Simulated source write failure.');
        await atomicWrite(target, source, expectedHash);
      };
      await assert.rejects(workspace.applyDraft(file, 'draft', review.draftHash), /Simulated source write failure/);
      storage.atomicWrite = atomicWrite;
      assert.deepEqual(await sources(root, files), originals);
      if (isNew) await assert.rejects(access(path.join(root, file)));
      else {
        const backups = await Promise.all((await readdir(path.join(root, '.website-editor/backups')))
          .map(async name => JSON.parse(await readFile(path.join(root, '.website-editor/backups', name), 'utf8'))));
        assert.equal(backups.length, 1);
        assert.equal(backups[0].file, sourcePage);
        assert.equal(backups[0].source, originals[1]);
      }
      assert.equal((await workspace.readRecord(file)).draftHash, review.draftHash);
      await workspace.applyDraft(file, 'draft', review.draftHash);
      assert.equal((await workspace.readRecord(file)).draft, undefined);
      await loadContent(path.join(root, 'content'));
    } finally { await cleanup(); }
  });
}
