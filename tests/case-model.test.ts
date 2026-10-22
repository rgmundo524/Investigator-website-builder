import assert from 'node:assert/strict';
import { test } from 'node:test';
import { schemas, type ContentRecord } from '../src/content/schemas';
import { caseDateRange, formatCaseDate, isCaseDate } from '../src/lib/case-dates';
import { caseMoneyMetrics } from '../src/lib/case-metadata';
import { validateRecords } from '../scripts/content';

const caseInput = {
  slug: 'historical-case', title: 'Historical case', description_short: 'A reviewed case summary.',
  chart: 'criminal-investigations', category: 'hacks', content_kind: 'case_study',
};

test('historical case dates preserve known precision and reject impossible calendar dates', () => {
  for (const value of ['2021', '2021-07', '2021-07-14', '2024-02-29', '2000-02-29']) {
    assert.equal(isCaseDate(value), true, value);
    assert.equal(schemas.cases.parse({ ...caseInput, opened_on: value }).opened_on, value);
  }
  for (const value of ['2021-02-29', '1900-02-29', '2021-04-31', '2021-13', '2021-00', '2021-7', '21', '2021-07-00', '0000']) {
    assert.equal(isCaseDate(value), false, value);
    assert.equal(schemas.cases.safeParse({ ...caseInput, opened_on: value }).success, false, value);
  }
  assert.deepEqual(caseDateRange('2024'), { start: '2024-01-01', end: '2024-12-31' });
  assert.deepEqual(caseDateRange('2024-02'), { start: '2024-02-01', end: '2024-02-29' });
  assert.equal(formatCaseDate('2024'), '2024');
  assert.equal(formatCaseDate('2024-02'), 'Feb 2024');
  assert.equal(formatCaseDate('2024-02-29'), 'Feb 29, 2024');
  assert.equal(formatCaseDate(null), 'Not recorded');
});

test('case date chronology rejects only dates that are definitely out of order', () => {
  const completed = { ...caseInput, case_status: 'completed' };
  for (const [opened_on, closed_on] of [
    ['2024', '2024-02'], ['2024-10', '2024'], ['2024-02-28', '2024-02'],
    ['2024-02-29', '2024-02-29'], ['2024', '2025'],
  ]) assert.equal(schemas.cases.safeParse({ ...completed, opened_on, closed_on }).success, true);
  for (const [opened_on, closed_on] of [
    ['2024', '2023'], ['2024-10', '2024-09'], ['2024-02-29', '2024-02-28'],
  ]) assert.equal(schemas.cases.safeParse({ ...completed, opened_on, closed_on }).success, false);
  assert.equal(schemas.cases.safeParse({ ...caseInput, case_status: 'active', closed_on: '2024' }).success, false);
});

test('address and wallet counts remain independent, including a known zero', () => {
  const known = schemas.cases.parse({ ...caseInput, metrics: { addresses_reviewed: 250, wallets_reviewed: 0 } });
  assert.equal(known.metrics.addresses_reviewed, 250);
  assert.equal(known.metrics.wallets_reviewed, 0);
  const unknown = schemas.cases.parse(caseInput);
  assert.equal(unknown.metrics.addresses_reviewed, null);
  assert.equal(unknown.metrics.wallets_reviewed, null);
  for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(schemas.cases.safeParse({ ...caseInput, metrics: { addresses_reviewed: value } }).success, false);
  }
});

test('each money figure requires its own effective valuation and source note', () => {
  const separate = schemas.cases.parse({ ...caseInput, metrics: {
    reported_loss_usd: 1000, reported_loss_valuation_date: '2023-01-12', reported_loss_note: 'Claimed loss at incident date.',
    assets_reviewed_usd: 750, assets_reviewed_valuation_date: '2024-05-16', assets_reviewed_note: 'Assets in the review scope.',
  } });
  const rows = caseMoneyMetrics(separate.metrics);
  assert.equal(rows[0].valuationDate, '2023-01-12');
  assert.equal(rows[1].valuationDate, '2024-05-16');
  assert.equal(rows[0].note, 'Claimed loss at incident date.');
  assert.equal(rows[1].note, 'Assets in the review scope.');
  const legacy = schemas.cases.parse({ ...caseInput, metrics: {
    reported_loss_usd: 0, assets_reviewed_usd: 250,
    valuation_date: '2024-06-01', amount_note: 'Same valuation basis for both figures.',
  } });
  assert.deepEqual(caseMoneyMetrics(legacy.metrics).map(({ valuationDate }) => valuationDate), ['2024-06-01', '2024-06-01']);
  assert.equal(caseMoneyMetrics(legacy.metrics)[0].value, 0);
  assert.equal(schemas.cases.safeParse({ ...caseInput, metrics: {
    reported_loss_usd: 1000, reported_loss_valuation_date: '2024-01-01', reported_loss_note: 'Only the loss is sourced.',
    assets_reviewed_usd: 500,
  } }).success, false);
  assert.equal(schemas.cases.safeParse({ ...caseInput, metrics: {
    reported_loss_usd: 0, valuation_date: '2024-01-01',
  } }).success, false);
});

test('optional employment relationships must exist and respect publication boundaries', () => {
  const chart: ContentRecord = { collection: 'charts', data: schemas.charts.parse({
    slug: 'criminal-investigations', title: 'Criminal investigations', description_short: 'Case classifications.',
    categories: [{ id: 'hacks', label: 'Hacks' }], publication_status: 'published',
  }), body: 'Chart description.', file: 'charts/criminal-investigations.md' };
  const experience: ContentRecord = { collection: 'experience', data: schemas.experience.parse({
    slug: 'employer', description_short: 'An investigative role.', organization: 'Example employer', role: 'Investigator',
    periods: [], active_position: false,
  }), body: 'Role description.', file: 'experience/employer.md' };
  const record: ContentRecord = { collection: 'cases', data: schemas.cases.parse({ ...caseInput, experience: 'employer' }),
    body: 'Case narrative.', file: 'cases/historical-case.md' };
  assert.throws(() => validateRecords([chart, record]), /references missing experience\/employer/);
  assert.doesNotThrow(() => validateRecords([chart, experience, record]));
  record.data.publication_status = 'published';
  assert.throws(() => validateRecords([chart, experience, record]), /published content references draft experience\/employer/);
  experience.data.publication_status = 'published';
  assert.doesNotThrow(() => validateRecords([chart, experience, record]));
});

test('optional chart classification vocabulary has unique nonempty paths', () => {
  const chart = { slug: 'criminal-investigations', title: 'Criminal investigations', description_short: 'Case classifications.',
    categories: [{ id: 'hacks', label: 'Hacks' }] };
  assert.deepEqual(schemas.charts.parse(chart).subcategory_paths, []);
  assert.equal(schemas.charts.safeParse({ ...chart, subcategory_paths: [['hacks', 'bridge-exploit']] }).success, true);
  for (const subcategory_paths of [[[]], [['hacks', 'Bad Id']], [['unconfigured-category', 'bridge-exploit']], [['hacks', 'bridge-exploit'], ['hacks', 'bridge-exploit']]]) {
    assert.equal(schemas.charts.safeParse({ ...chart, subcategory_paths }).success, false);
  }
});
