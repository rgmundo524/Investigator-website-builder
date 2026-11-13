import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stringify } from 'yaml';
import { schemas, type ContentRecord } from '../src/content/schemas';
import { validateRecords } from '../scripts/content';
import { EditorWorkspace, EditorWorkspaceError } from '../scripts/editor-workspace';

const pageData = { slug: 'about', profile: 'person', title: 'About', description_short: 'Professional background.' };
const skillData = { slug: 'analysis', title: 'Analysis', description_short: 'How the skill is used.', proficiency: 3.5, publication_status: 'published' };

function records(): ContentRecord[] {
  return [{ collection: 'profile', data: schemas.profile.parse({ slug: 'person', name: 'A Person', headline: 'Investigator', publication_status: 'published' }), body: 'Profile source.', file: 'content/profile/person.md' },
    { collection: 'skills', data: schemas.skills.parse(skillData), body: 'Detailed skill wording.', file: 'content/skills/analysis.md' },
    { collection: 'skills', data: schemas.skills.parse({ ...skillData, slug: 'automation', title: 'Automation' }), body: 'Automation details.', file: 'content/skills/automation.md' },
    { collection: 'pages', data: schemas.pages.parse({ ...pageData, section_order: ['skills'], skill_groups: [
      { name: 'Investigation', skills: ['analysis'] }, { name: 'Technical', skills: ['automation'] },
    ] }), body: 'An unchanged page introduction.\n', file: 'content/pages/about.md' }];
}

const getPage = (entries: ContentRecord[]) => entries.find(entry => entry.collection === 'pages')! as Extract<ContentRecord, { collection: 'pages' }>;

test('pages own ordered skill groups and assignments while reusable skills have no group field', () => {
  const groups = [{ name: '  Investigation  ', skills: ['analysis', 'automation'] }, { name: 'Technical', skills: [] }];
  const parsed = schemas.pages.parse({ ...pageData, skill_groups: groups });
  assert.deepEqual(parsed.skill_groups, [{ name: 'Investigation', skills: ['analysis', 'automation'] }, { name: 'Technical', skills: [] }]);
  assert.deepEqual(schemas.pages.parse(pageData).skill_groups, []);
  assert.deepEqual(schemas.pages.parse({ ...pageData, skill_groups: [{ name: 'An empty group' }] }).skill_groups, [{ name: 'An empty group', skills: [] }]);
  assert.equal(schemas.skills.parse(skillData).proficiency, 3.5);
  assert.equal(schemas.skills.safeParse({ ...skillData, group: 'Old record-owned group' }).success, false);
  assert.equal(schemas.pages.safeParse({ ...pageData, skills: ['analysis'] }).success, false);
  assert.equal(schemas.pages.safeParse({ ...pageData, skill_group_order: ['Investigation'] }).success, false);
});

test('group names must be distinct and every skill may appear only once within a page', () => {
  for (const skill_groups of [
    [{ name: '', skills: [] }], [{ name: '  ', skills: [] }],
    [{ name: 'Investigation', skills: [] }, { name: ' investigation ', skills: [] }],
    [{ name: 'Technical Skills', skills: [] }, { name: 'TECHNICAL   SKILLS', skills: [] }],
    [{ name: 'Investigation', skills: ['analysis', 'analysis'] }],
    [{ name: 'Investigation', skills: ['analysis'] }, { name: 'Technical', skills: ['analysis'] }],
    [{ name: 'Investigation', skills: ['Invalid Skill ID'] }],
  ]) assert.equal(schemas.pages.safeParse({ ...pageData, skill_groups }).success, false, JSON.stringify(skill_groups));
  const repeated = schemas.pages.safeParse({ ...pageData, skill_groups: [
    { name: 'Investigation', skills: ['analysis'] }, { name: 'Technical', skills: ['analysis'] },
  ] });
  assert.equal(repeated.success, false);
  if (!repeated.success) assert.ok(repeated.error.issues.some(issue => issue.path.join('.') === 'skill_groups.1.skills.0'));
});

test('nested selections retain missing-reference and publication checks and allow reuse under different page groups', () => {
  const entries = records();
  const page = getPage(entries);
  const skill = entries.find(entry => entry.collection === 'skills')!;
  assert.doesNotThrow(() => validateRecords(entries));
  entries.push({ ...structuredClone(page), file: 'content/pages/work-history.md', data: { ...structuredClone(page.data), slug: 'work-history', skill_groups: [{ name: 'Another page heading', skills: ['analysis'] }] } });
  assert.doesNotThrow(() => validateRecords(entries));
  page.data.skill_groups[0].skills.push('missing');
  assert.throws(() => validateRecords(entries), /content\/pages\/about\.md: skill_groups references missing skills\/missing/);
  page.data.skill_groups[0].skills.pop();
  skill.data.publication_status = 'draft';
  assert.doesNotThrow(() => validateRecords(entries), 'Draft pages can preview applied draft skills');
  page.data.publication_status = 'published';
  assert.throws(() => validateRecords(entries), /published content references draft skills\/analysis/);
  skill.data.publication_status = 'published';
  assert.doesNotThrow(() => validateRecords(entries));
  page.data.skill_groups[1].skills.push('analysis');
  assert.throws(() => validateRecords(entries), /duplicate reference in skill_groups/);
});

test('reassigning and reordering nested skills changes only the page, with empty groups and library wording preserved', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'page-skill-groups-'));
  try {
    await mkdir(path.join(temporary, 'content'));
    await writeFile(path.join(temporary, 'site.json'), JSON.stringify({ version: 1, url: 'https://example.com' }));
    const entries = records();
    for (const entry of entries) {
      await mkdir(path.dirname(path.join(temporary, entry.file)), { recursive: true });
      await writeFile(path.join(temporary, entry.file), `---\n${stringify(entry.data)}---\n${entry.body}`);
    }
    const workspace = await EditorWorkspace.open(temporary);
    const page = getPage(entries);
    const library = entries.filter(entry => entry.collection !== 'pages');
    const originals = await Promise.all(library.map(entry => readFile(path.join(temporary, entry.file), 'utf8')));
    const current = await workspace.readRecord(page.file);
    const skill_groups = [{ name: 'Technical', skills: ['automation', 'analysis'] }, { name: 'Investigation', skills: [] }];
    const review = await workspace.saveDraft({ file: page.file, sourceHash: current.sourceHash, expectedDraftHash: null, data: { skill_groups } });
    assert.equal(review.canApply, true, review.issues.join('\n'));
    assert.deepEqual(review.changes.map(change => change.field), ['skill_groups']);
    const applied = await workspace.applyDraft(page.file, 'draft', review.draftHash);
    assert.deepEqual(applied.data.skill_groups, skill_groups);
    assert.equal(applied.body, current.body);
    assert.deepEqual(await Promise.all(library.map(entry => readFile(path.join(temporary, entry.file), 'utf8'))), originals);
    const broken = await workspace.saveDraft({ file: page.file, sourceHash: applied.sourceHash, expectedDraftHash: null,
      data: { skill_groups: [{ name: 'Technical', skills: ['missing'] }] } });
    assert.equal(broken.canApply, false);
    await assert.rejects(workspace.applyDraft(page.file, 'draft', broken.draftHash), (error: unknown) => error instanceof EditorWorkspaceError && error.code === 'INVALID_DRAFT');
    assert.deepEqual((await workspace.readRecord(page.file)).data.skill_groups, skill_groups);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
