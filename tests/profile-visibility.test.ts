import assert from 'node:assert/strict';
import { test } from 'node:test';
import { schemas } from '../src/content/schemas';
import { publicLocation } from '../src/lib/public-profile';
import { careerTimeline } from '../src/lib/career-timeline';
import { educationDetails } from '../src/lib/education';

const base = { slug: 'investigator', description_short: 'Professional introduction.' };
const profile = { ...base, name: 'Example Investigator', headline: 'Blockchain Investigator' };
const experience = { ...base, organization: 'Example Organization', role: 'Investigator', periods: [{ start: '2024-01', end: null }] };

test('existing profile and employment locations remain hidden until explicitly enabled', () => {
  for (const [schema, fields] of [[schemas.profile, profile], [schemas.experience, experience]] as const) {
    const saved = schema.parse({ ...fields, location: 'Lakewood, Colorado' });
    assert.equal(saved.location, 'Lakewood, Colorado');
    assert.equal(saved.show_location, false);
    assert.equal(publicLocation(saved), undefined);
    assert.equal(publicLocation(schema.parse({ ...fields, location: 'Lakewood, Colorado', show_location: false })), undefined);
    assert.equal(publicLocation(schema.parse({ ...fields, location: 'Lakewood, Colorado', show_location: true })), 'Lakewood, Colorado');
  }
});

test('location display requires a real location and an explicit boolean choice', () => {
  assert.equal(publicLocation({ location: '   ', show_location: true }), undefined);
  assert.equal(publicLocation({ location: '  Remote  ', show_location: true }), 'Remote');
  assert.equal(publicLocation({ location: 'Remote' }), undefined);
  for (const [schema, fields] of [[schemas.profile, profile], [schemas.experience, experience]] as const) {
    assert.ok(schema.safeParse(fields).success);
    for (const invalid of [{ show_location: true }, { location: ' ', show_location: true }, { location: 'Remote', show_location: 'true' }]) {
      assert.equal(schema.safeParse({ ...fields, ...invalid }).success, false);
    }
  }
});

test('employment locations are excluded from the browser career data even when shown in the card', () => {
  const data = schemas.experience.parse({ ...experience, location: 'Private location sentinel', show_location: true });
  const { undated, ...browserData } = careerTimeline([{ id: 'investigator', data }], { start: null, scale: 1.2, levels: { desktop: 3, mobile: 5 } }, '2026-11');
  assert.deepEqual(undated, []);
  assert.equal(JSON.stringify(browserData).includes('Private location sentinel'), false);
  assert.equal(JSON.stringify(browserData).includes('show_location'), false);
});

test('a profile does not require an unused short summary', () => {
  const { description_short: _summary, ...withoutSummary } = profile;
  assert.equal(schemas.profile.safeParse(withoutSummary).success, true);
});

test('education details show only recorded dates without completion labels or assumed present attendance', () => {
  const entry = schemas.education.parse({ ...base, institution: 'Example school', program: 'Example program', credential_type: 'degree', start: '2020-01', end: null });
  assert.equal(entry.completion_status, undefined);
  assert.equal(educationDetails(entry), 'Jan 2020');
  assert.equal(educationDetails({ start: '2020-01', end: null }), 'Jan 2020');
  assert.equal(educationDetails({ start: '2020-01', end: '2024-05' }), 'Jan 2020 to May 2024');
});
