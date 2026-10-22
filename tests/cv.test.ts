import test from 'node:test';
import assert from 'node:assert/strict';
import { schemas } from '../src/content/schemas';
import { cvEntries, cvSources } from '../src/lib/cv';

const base = { description_short: 'A short description.' };
const profile = (status = 'published', id = 'person') => ({ id, data: schemas.profile.parse({ ...base, slug: id, name: 'Example Person', headline: 'Investigator', publication_status: status }) });
const page = (id: string, status = 'published', person = 'person') => ({ id, data: schemas.pages.parse({ ...base, slug: id, title: id, profile: person, publication_status: status }) });

test('CV requires its visible home and profile, including in production', () => {
  assert.equal(cvSources([], [profile()]), undefined);
  assert.equal(cvSources([page('home', 'draft')], [profile()]), undefined);
  assert.equal(cvSources([page('home')], [profile('draft')]), undefined);
  assert.ok(cvSources([page('home', 'draft')], [profile('draft')], true));
  assert.ok(cvSources([page('home')], [profile()]));
});

test('CV ignores unpublished supporting pages and another profile\'s pages', () => {
  const pages = [page('home'), page('work-history', 'draft'), page('credentials', 'published', 'someone-else'), page('contact')];
  const model = cvSources(pages, [profile()])!;
  assert.equal(model.workHistory, undefined);
  assert.equal(model.credentials, undefined);
  assert.equal(model.contact?.id, 'contact');
  assert.equal(cvSources(pages, [profile()], true)?.workHistory?.id, 'work-history');
});

test('CV selection keeps explicit order, filters drafts, and only discovers all when enabled', () => {
  const entries = [
    { id: 'unselected', data: { publication_status: 'published' } },
    { id: 'first', data: { publication_status: 'published' } },
    { id: 'draft', data: { publication_status: 'draft' } },
    { id: 'last', data: { publication_status: 'published' } },
  ];
  assert.deepEqual(cvEntries(entries, ['last', 'draft', 'first']).map(({ id }) => id), ['last', 'first']);
  assert.deepEqual(cvEntries(entries, ['last', 'draft', 'first'], true).map(({ id }) => id), ['last', 'draft', 'first']);
  assert.deepEqual(cvEntries(entries, [], false, true).map(({ id }) => id), ['unselected', 'first', 'last']);
  assert.deepEqual(cvEntries(entries, []).map(({ id }) => id), []);
});
