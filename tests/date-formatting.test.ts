import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDate, formatMonth, formatPeriods } from '../src/lib/dates';
import { formatShare } from '../src/lib/charts';
import { articleDate } from '../src/lib/articles';
import { careerTimeline } from '../src/lib/career-timeline';

test('date and share formatting preserve English defaults and support a selected locale', () => {
  assert.equal(formatMonth('2025-01'), 'Jan 2025');
  assert.equal(formatMonth('2025-01', 'fr-FR'), 'janv. 2025');
  assert.equal(formatDate('2025-01-02', 'en-GB'), '2 Jan 2025');
  assert.equal(formatDate('2025-01-01', 'en-US'), 'Jan 1, 2025');
  assert.equal(articleDate('2025-01-02', 'fr-FR'), '2 janvier 2025');
  assert.equal(formatShare(12.5), '12.5%');
  assert.equal(formatShare(12.5, 'de-DE'), '12,5 %');
  assert.equal(formatShare(null, 'fr-FR'), 'Pending');
});

test('localized periods retain the existing as-of position and English status wording', () => {
  const periods = [{ start: '2025-01', end: '2025-02' }, { start: '2026-01', end: null }];
  assert.equal(formatPeriods(periods, '2025-03'), 'Jan 2025 to Feb 2025; Starts Jan 2026');
  assert.equal(formatPeriods(periods, '2025-03', 'fr-FR'), 'janv. 2025 to févr. 2025; Starts janv. 2026');
  assert.equal(formatPeriods([{ start: '2025-01', end: null }], '2025-03', 'fr-FR'), 'janv. 2025 to Present');
});

test('career payload localizes role dates and preserves the locale for browser date controls', () => {
  const entries = [{ id: 'example', data: { organization: 'Example', role: 'Investigator', blocks: {},
    periods: [{ start: '2025-01', end: '2025-02' }] } }];
  const settings = { start: null, scale: 1, levels: { desktop: 4, mobile: 3 } };
  const timeline = careerTimeline(entries, settings, '2025-03', 'fr-FR');
  assert.equal(timeline.locale, 'fr-FR');
  assert.equal(timeline.asOf, '2025-03');
  assert.equal(timeline.roles[0].dates, 'janv. 2025 to févr. 2025');
  assert.equal(timeline.spans[0].dates, 'janv. 2025 to févr. 2025');
  assert.equal(careerTimeline(entries, settings, '2025-03').locale, 'en-US');
});
