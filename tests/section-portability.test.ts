import assert from 'node:assert/strict';
import { test } from 'node:test';
import { schemas, type ContentRecord } from '../src/content/schemas';
import { validateRecords } from '../scripts/content';
import { articleIndexPage, visibleArticles } from '../src/lib/articles';
import { caseSearchRecords } from '../src/lib/search';

const common = { publication_status: 'published', description_short: 'A public summary.' };
const profile: ContentRecord = { collection: 'profile', data: schemas.profile.parse({ ...common, slug: 'employee', name: 'Employee', headline: 'Investigator' }), body: 'Profile', file: 'profile/employee.md' };
const page = (slug: string, chart: string, publication_status = 'published'): ContentRecord => ({ collection: 'pages', data: schemas.pages.parse({ ...common, slug, title: slug, profile: 'employee', charts: [chart], section_order: ['charts'], publication_status }), body: 'Page', file: `pages/${slug}.md` });
const chart = (slug: string): ContentRecord => ({ collection: 'charts', data: schemas.charts.parse({ ...common, slug, title: slug, categories: [{ id: 'other', label: 'Other' }] }), body: 'Chart', file: `charts/${slug}.md` });
const study = (slug: string, selectedChart: string): ContentRecord => ({ collection: 'cases', data: schemas.cases.parse({ ...common, slug, title: slug, chart: selectedChart, category: 'other', content_kind: 'case_study' }), body: 'Case details', file: `cases/${slug}.md` });

test('case search includes charts on custom visible pages once and excludes unselected or draft-only charts', () => {
  const records = [profile, page('work', 'civil'), page('research', 'civil'), page('private-work', 'draft-chart', 'draft'),
    chart('civil'), chart('draft-chart'), chart('unselected'), study('public-case', 'civil'), study('preview-case', 'draft-chart'), study('unselected-case', 'unselected')];
  assert.doesNotThrow(() => validateRecords(records));
  assert.deepEqual(caseSearchRecords(records, false).map(({ meta }) => meta.title), ['public-case']);
  assert.deepEqual(caseSearchRecords(records, true).map(({ meta }) => meta.title), ['preview-case', 'public-case']);
  const hiddenSection = page('work', 'civil');
  if (hiddenSection.collection === 'pages') hiddenSection.data.section_order = ['biography'];
  assert.deepEqual(caseSearchRecords([profile, hiddenSection, chart('civil'), study('case', 'civil')], false), []);
});

test('article routes and return links can use a custom page while respecting publication and section visibility', () => {
  const makePage = (id: string, publication_status = 'published', section_order: string[] = ['articles']) => ({ id,
    data: schemas.pages.parse({ ...common, slug: id, title: id, profile: 'employee', publication_status, section_order }) });
  const writing = makePage('writing');
  const entries = [{ id: 'essay', data: schemas.articles.parse({ ...common, slug: 'essay', title: 'Essay', published_on: '2026-01-01' }) }];
  const index = articleIndexPage([writing], false);
  assert.equal(index?.id, 'writing');
  assert.deepEqual(index ? visibleArticles(entries, false).map(({ id }) => `/articles/${id}/`) : [], ['/articles/essay/']);
  assert.equal(articleIndexPage([makePage('writing', 'draft')], false), undefined);
  assert.equal(articleIndexPage([makePage('writing', 'draft')], true)?.id, 'writing');
  assert.equal(articleIndexPage([makePage('articles', 'published', ['biography'])], false), undefined);
  assert.equal(articleIndexPage([writing, makePage('articles')], false)?.id, 'articles');
  assert.equal(articleIndexPage([makePage('articles', 'draft'), writing], false)?.id, 'writing');
});
