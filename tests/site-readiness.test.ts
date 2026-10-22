import test from 'node:test';
import assert from 'node:assert/strict';
import { schemas, type ContentRecord } from '../src/content/schemas';
import { validateRecords } from '../scripts/content';
import { mayIndexSite } from '../src/lib/indexing';

const common = { slug: 'test', description_short: 'Test entry.' };

test('indexing requires explicit enablement and excludes previews, missing profiles, and errors', () => {
  assert.equal(mayIndexSite(true, false, true), true);
  for (const args of [[false, false, true], [true, true, true], [true, false, false], [true, false, true, true]] as const) {
    assert.equal(mayIndexSite(args[0], args[1], args[2], args.length === 4 ? args[3] : undefined), false);
  }
});

test('contact routing is optional and only one enabled service can be primary', () => {
  const service = { id: 'one', name: 'Service', description: 'Description', action: { label: 'Contact', url: 'https://example.com/' } };
  const record = { ...common, services_heading: 'Contact', services: [service] };
  assert.equal(schemas.contacts.parse(record).services[0].primary, false);
  assert.equal(schemas.contacts.safeParse({ ...record, services: [{ ...service, primary: true }, { ...service, id: 'two', primary: true }] }).success, false);
  assert.equal(schemas.contacts.safeParse({ ...record, services: [{ ...service, primary: true }, { ...service, id: 'two', primary: true, enabled: false }] }).success, true);
});

test('prepared CV paths are local PDF files without traversal', () => {
  const profile = { ...common, name: 'Name', headline: 'Role' };
  assert.equal(schemas.profile.safeParse({ ...profile, cv: { url: '/files/professional-cv.pdf' } }).success, true);
  for (const url of ['//other.example/file.pdf', '/../file.pdf', 'https://other.example/file.pdf', '/file.html']) {
    assert.equal(schemas.profile.safeParse({ ...profile, cv: { url } }).success, false);
  }
});

test('configured taxonomy rejects aliases and undeclared paths but permits partial paths', () => {
  const chart: ContentRecord = { collection: 'charts', file: 'charts/test.md', body: 'Chart', data: schemas.charts.parse({ ...common, title: 'Cases', categories: [{ id: 'fraud', label: 'Fraud' }], subcategory_paths: [['fraud', 'exchange', 'withdrawal-fee']] }) };
  const record: ContentRecord = { collection: 'cases', file: 'cases/case.md', body: 'Case', data: schemas.cases.parse({ ...common, slug: 'case', title: 'Case', chart: 'test', category: 'fraud', subcategory: ['exchange'], networks: ['ethereum'] }) };
  assert.doesNotThrow(() => validateRecords([chart, record], { networks: ['ethereum'] }));
  record.data.networks = ['eth'];
  assert.throws(() => validateRecords([chart, record], { networks: ['ethereum'] }), /unknown network IDs/);
  record.data.networks = ['ethereum'];
  record.data.subcategory = ['other'];
  assert.throws(() => validateRecords([chart, record]), /configured subcategory_paths/);
});
