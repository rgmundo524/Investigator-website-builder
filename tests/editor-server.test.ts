import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request as httpRequest } from 'node:http';
import { mkdtemp, readFile, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startEditorServer } from '../scripts/editor-server';
import { initializeSite } from '../scripts/init-site';

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const parent = await mkdtemp(path.join(tmpdir(), 'editor-http-'));
  const data = path.join(parent, 'investigator');
  await initializeSite(data);
  const editor = await startEditorServer({ port: 0 });
  t.after(async () => { await editor.close(); await rm(parent, { recursive: true, force: true }); });
  let workspaceId = '';
  async function request(route: string, body?: object, extra: Record<string, string> = {}) {
    return fetch(new URL(route, editor.url), {
      method: body ? 'POST' : 'GET',
      headers: { 'X-Editor-Token': editor.token, 'X-Workspace-Id': workspaceId, ...(body ? { 'Content-Type': 'application/json' } : {}), ...extra },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  async function open() {
    const response = await request('/api/workspace', { path: data });
    assert.equal(response.status, 200);
    const state = await response.json();
    workspaceId = state.workspaceId;
    return state;
  }
  return { data, editor, request, open, id: () => workspaceId };
}

test('local editor rejects requests without a session token or from another origin/host', async t => {
  const f = await fixture(t);
  assert.equal((await fetch(new URL('/api/state', f.editor.url))).status, 403);
  assert.equal((await f.request('/api/state', undefined, { Origin: 'https://outside.example' })).status, 403);
  const wrongHost = await new Promise<number>((resolve, reject) => {
    const req = httpRequest(new URL('/api/state', f.editor.url), { headers: { Host: 'outside.example', 'X-Editor-Token': f.editor.token } }, response => { response.resume(); response.once('end', () => resolve(response.statusCode!)); });
    req.once('error', reject); req.end();
  });
  assert.equal(wrongHost, 403);
  assert.equal((await f.request('/api/state')).status, 200);
  const home = await fetch(f.editor.url);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /editor-config/);
  assert.match(home.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
});

test('HTTP editing stages invalid work safely, applies valid drafts, and rejects stale investigator tabs', async t => {
  const f = await fixture(t);
  const state = await f.open();
  assert.equal(state.workspace.records.length, 11);
  const file = 'content/cases/http-case.md';
  const body = { file, data: { slug: 'http-case', title: '', chart: 'criminal-investigations', category: 'hacks', content_kind: 'case_study', publication_status: 'draft' }, body: 'Case narrative.', sourceHash: null, expectedDraftHash: null as string | null };
  const first = await f.request('/api/drafts', body);
  assert.equal(first.status, 200);
  const firstReview = await first.json();
  assert.equal(firstReview.canApply, false);
  body.expectedDraftHash = firstReview.draftHash;
  await assert.rejects(readFile(path.join(f.data, file)), /ENOENT/);
  body.data.title = 'HTTP case';
  Object.assign(body.data, { description_short: 'A valid test case.' });
  const saved = await f.request('/api/drafts', body);
  assert.equal(saved.status, 200);
  const savedReview = await saved.json();
  assert.equal(savedReview.canApply, true);
  assert.equal((await f.request('/api/apply', { file, publication_status: 'draft', expectedDraftHash: firstReview.draftHash })).status, 409);
  const applied = await f.request('/api/apply', { file, publication_status: 'draft', expectedDraftHash: savedReview.draftHash });
  assert.equal(applied.status, 200);
  assert.match(await readFile(path.join(f.data, file), 'utf8'), /HTTP case/);
  const previousId = f.id();
  await f.open();
  assert.notEqual(f.id(), previousId);
  assert.equal((await f.request('/api/record?file=' + encodeURIComponent(file), undefined, { 'X-Workspace-Id': previousId })).status, 409);
  assert.equal((await f.request('/api/record?file=' + encodeURIComponent('../outside.md'))).status, 400);
  const template = await f.request('/api/template?collection=experience');
  assert.equal(template.status, 200);
  assert.equal((await template.json()).data.organization, '');
});

test('image upload stays inside the selected asset folder and never overwrites a file', async t => {
  const f = await fixture(t);
  await f.open();
  const image = { kind: 'portrait', name: 'portrait.png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6wAAAABJRU5ErkJggg==' };
  assert.equal((await f.request('/api/assets', image)).status, 200);
  assert.equal((await f.request('/api/assets', image)).status, 409);
  assert.equal((await f.request('/api/assets', { ...image, name: '../outside.png' })).status, 400);
  assert.equal((await f.request('/api/assets', { ...image, name: 'invalid.jpg' })).status, 400);
  const listing = await f.request('/api/assets');
  assert.deepEqual((await listing.json()).assets, [{ name: 'portrait.png', file: 'assets/portrait.png', kind: 'portrait' }]);
});

test('organization logo uploads are listed in their own folder and reject duplicate filenames', async t => {
  const f = await fixture(t);
  await f.open();
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6wAAAABJRU5ErkJggg==', 'base64');
  const image = { kind: 'organization', name: 'Example Company.png', base64: bytes.toString('base64') };
  const uploaded = await f.request('/api/assets', image);
  assert.equal(uploaded.status, 200);
  const expected = { name: 'example-company.png', file: 'assets/organizations/example-company.png', kind: 'organization' };
  assert.deepEqual(await uploaded.json(), expected);
  assert.deepEqual((await (await f.request('/api/assets')).json()).assets, [expected]);
  assert.equal((await f.request('/api/assets', image)).status, 409);
  assert.deepEqual(await readFile(path.join(f.data, expected.file)), bytes);
  assert.equal((await f.request('/api/assets', { ...image, name: '../outside.png' })).status, 400);
  assert.equal((await f.request('/api/assets', { ...image, name: 'unsupported.svg' })).status, 400);
});

test('local image previews return the selected investigator images with private caching and session checks', async t => {
  const f = await fixture(t);
  await f.open();
  const images = [
    { kind: 'portrait', name: 'portrait.png', file: 'assets/portrait.png', mime: 'image/png', bytes: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) },
    { kind: 'personal', name: 'fieldwork.webp', file: 'assets/images/personal/fieldwork.webp', mime: 'image/webp', bytes: Buffer.from('RIFF0000WEBP') },
    { kind: 'credential', name: 'certificate.jpg', file: 'assets/credentials/certificate.jpg', mime: 'image/jpeg', bytes: Buffer.from([255, 216, 255, 0]) },
    { kind: 'organization', name: 'employer.png', file: 'assets/organizations/employer.png', mime: 'image/png', bytes: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) },
  ];
  for (const image of images) {
    assert.equal((await f.request('/api/assets', { kind: image.kind, name: image.name, base64: image.bytes.toString('base64') })).status, 200);
    const preview = await f.request('/api/asset?file=' + encodeURIComponent(image.file));
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get('content-type'), image.mime);
    assert.equal(preview.headers.get('cache-control'), 'no-store');
    assert.equal(preview.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(preview.headers.get('content-length'), String(image.bytes.length));
    assert.deepEqual(Buffer.from(await preview.arrayBuffer()), image.bytes);
  }
  const route = '/api/asset?file=assets%2Fportrait.png';
  assert.equal((await fetch(new URL(route, f.editor.url))).status, 403);
  assert.equal((await f.request(route, undefined, { Origin: 'https://outside.example' })).status, 403);
  assert.equal((await f.request(route, undefined, { 'X-Workspace-Id': '' })).status, 409);
  const previousId = f.id();
  await f.open();
  assert.equal((await f.request(route, undefined, { 'X-Workspace-Id': previousId })).status, 409);
});

test('local image previews reject arbitrary files, traversal, unsupported images, and file symlinks', async t => {
  const f = await fixture(t);
  await f.open();
  const privateFile = path.join(f.data, 'private-review/private.png');
  await mkdir(path.dirname(privateFile), { recursive: true });
  await mkdir(path.join(f.data, 'assets'), { recursive: true });
  await writeFile(privateFile, 'Private document, not a public image.');
  await writeFile(path.join(f.data, 'assets/not-supported.svg'), '<svg/>');
  await symlink(privateFile, path.join(f.data, 'assets/linked.png'));
  for (const file of [
    'private-review/private.png', privateFile, 'assets/../private-review/private.png',
    'assets\\..\\private-review\\private.png', 'assets/not-supported.svg', 'assets/linked.png',
    'assets/missing.png',
  ]) {
    assert.equal((await f.request('/api/asset?file=' + encodeURIComponent(file))).status, 404, file);
  }
});

test('local image previews reject asset directory symlinks even to files inside the investigator folder', async t => {
  const f = await fixture(t);
  await f.open();
  const privateFolder = path.join(f.data, 'private-review');
  await mkdir(privateFolder, { recursive: true });
  await writeFile(path.join(privateFolder, 'private.png'), 'Private document.');
  const imageFolder = path.join(f.data, 'assets/images');
  await mkdir(imageFolder, { recursive: true });
  await rm(path.join(imageFolder, 'personal'), { recursive: true });
  await symlink(privateFolder, path.join(imageFolder, 'personal'));
  assert.equal((await f.request('/api/asset?file=assets%2Fimages%2Fpersonal%2Fprivate.png')).status, 400);
});

test('local image previews reject asset directory symlinks outside the investigator folder', async t => {
  const f = await fixture(t);
  await f.open();
  const outside = path.join(path.dirname(f.data), 'other-investigator');
  await mkdir(outside);
  await writeFile(path.join(outside, 'portrait.png'), 'Another investigator image.');
  const imageFolder = path.join(f.data, 'assets/images');
  await mkdir(imageFolder, { recursive: true });
  await rm(path.join(imageFolder, 'personal'), { recursive: true });
  await symlink(outside, path.join(imageFolder, 'personal'));
  assert.equal((await f.request('/api/asset?file=assets%2Fimages%2Fpersonal%2Fportrait.png')).status, 400);
});

test('HTTP case removal is recoverable and respects source and investigator revisions', async t => {
  const f = await fixture(t);
  const file = 'content/cases/remove-test.md';
  const source = '---\nslug: remove-test\npublication_status: draft\ncase_number: "REMOVE-001"\ntitle: Removal test\ndescription_short: Temporary test case\nchart: criminal-investigations\ncategory: hacks\ncontent_kind: case_study\n---\nOriginal narrative.\n';
  await writeFile(path.join(f.data, file), source);
  await f.open();
  const record = await (await f.request('/api/record?file=' + encodeURIComponent(file))).json();
  const input = { file, sourceHash: record.sourceHash, expectedDraftHash: record.draftHash };
  assert.equal((await f.request('/api/remove-case', { ...input, sourceHash: '0'.repeat(64) })).status, 409);
  assert.equal(await readFile(path.join(f.data, file), 'utf8'), source);
  const removedResponse = await f.request('/api/remove-case', input);
  assert.equal(removedResponse.status, 200);
  const removed = await removedResponse.json();
  assert.equal(removed.file, file);
  assert.equal(removed.case_number, 'REMOVE-001');
  await assert.rejects(readFile(path.join(f.data, file)), /ENOENT/);
  assert.equal((await f.request('/api/record?file=' + encodeURIComponent(file))).status, 404);
  const state = await (await f.request('/api/state')).json();
  assert.equal(state.workspace.records.some((entry: { file: string }) => entry.file === file), false);
  assert.equal(state.workspace.removedCases[0].id, removed.id);
  assert.equal('source' in state.workspace.removedCases[0], false);
  const previousId = f.id();
  await f.open();
  assert.equal((await f.request('/api/restore-case', { id: removed.id }, { 'X-Workspace-Id': previousId })).status, 409);
  const restoredResponse = await f.request('/api/restore-case', { id: removed.id });
  assert.equal(restoredResponse.status, 200);
  assert.equal((await restoredResponse.json()).file, file);
  assert.equal(await readFile(path.join(f.data, file), 'utf8'), source);
  assert.equal((await (await f.request('/api/state')).json()).workspace.removedCases.length, 0);
  assert.equal((await f.request('/api/restore-case', { id: removed.id })).status, 404);
});


test('private report links support PDF tabs, range reads, and filename changes without public metadata', async t => {
  const f = await fixture(t);
  const file = 'content/cases/case-report.md';
  const source = '---\nslug: case-report\npublication_status: draft\ncase_number: "10-557"\ntitle: Report test\ndescription_short: Report test summary\nchart: criminal-investigations\ncategory: hacks\ncontent_kind: case_study\n---\nCase narrative.\n';
  await writeFile(path.join(f.data, file), source);
  const reportPath = path.join(f.data, 'private-review', 'source-report.pdf');
  const manifest = path.join(f.data, 'private-review/caseload-index/report-acquisition/report-manifest.json');
  await mkdir(path.dirname(manifest), { recursive: true });
  await writeFile(reportPath, '%PDF-1.7\nPrivate report bytes.\n%%EOF');
  await writeFile(manifest, JSON.stringify({ records: [{ website_slug: 'case-report', existing_report_candidate_paths: [reportPath] }] }));
  await f.open();
  const list = await f.request('/api/reports?file=' + encodeURIComponent(file));
  assert.equal(list.status, 200);
  const { reports } = await list.json();
  assert.equal(reports.length, 1);
  assert.equal(reports[0].format, 'pdf');
  const url = new URL(reports[0].url, f.editor.url);
  assert.equal(url.search, '');
  const view = await fetch(url);
  assert.equal(view.status, 200);
  assert.equal(view.headers.get('content-type'), 'application/pdf');
  assert.match(view.headers.get('content-disposition') ?? '', /^inline/);
  assert.match(await view.text(), /^%PDF-1.7/);
  const range = await fetch(url, { headers: { Range: 'bytes=0-4' } });
  assert.equal(range.status, 206);
  assert.equal(await range.text(), '%PDF-');
  assert.match(range.headers.get('content-range') ?? '', /^bytes 0-4\//);
  assert.equal((await fetch(url, { headers: { Range: 'bytes=1000-' } })).status, 416);
  const record = await (await f.request('/api/record?file=' + encodeURIComponent(file))).json();
  const renamed = await f.request('/api/rename', { file, newName: '10-557.md', sourceHash: record.sourceHash, expectedDraftHash: record.draftHash });
  assert.equal(renamed.status, 200);
  const renamedRecord = await renamed.json();
  assert.equal(renamedRecord.file, 'content/cases/10-557.md');
  assert.equal(renamedRecord.data.slug, 'case-report');
  assert.equal(await readFile(path.join(f.data, renamedRecord.file), 'utf8'), source);
  assert.equal((await (await f.request('/api/reports?file=' + encodeURIComponent(renamedRecord.file))).json()).reports.length, 1);
  assert.ok(!('source_report' in renamedRecord.data));
  assert.equal((await fetch(new URL('/api/reports?file=' + encodeURIComponent(renamedRecord.file), f.editor.url))).status, 403);
  await f.open();
  assert.equal((await fetch(url)).status, 404);
});
