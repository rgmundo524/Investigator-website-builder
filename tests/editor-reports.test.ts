import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CASE_REPORT_MANIFEST, EditorReportIndexError, listCaseReports } from '../scripts/editor-reports';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'editor-reports-'));
  const manifest = path.join(root, CASE_REPORT_MANIFEST);
  const reports = path.join(root, 'originals');
  await mkdir(path.dirname(manifest), { recursive: true });
  await mkdir(reports);
  return {
    root, manifest, reports,
    index: async (records: unknown[]) => writeFile(manifest, JSON.stringify({ records })),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

test('a content pack without the private report index has no report links', async () => {
  const f = await fixture();
  try { assert.deepEqual(await listCaseReports(f.root, 'a-case'), []); }
  finally { await f.cleanup(); }
});

test('report links use exact case slugs and primary paths, excluding supporting and unrelated reports', async () => {
  const f = await fixture();
  try {
    const primary = path.join(f.reports, 'Initial report.pdf');
    const support = path.join(f.reports, 'Police report.pdf');
    const unrelated = path.join(f.reports, 'Other report.pdf');
    await Promise.all([primary, support, unrelated].map((file) => writeFile(file, '%PDF-1.7\nfixture')));
    await f.index([
      { website_slug: 'case-one', existing_report_candidate_paths: [primary], existing_partial_or_supporting_paths: [support] },
      { website_slug: 'case-two', existing_report_candidate_paths: [unrelated] },
    ]);
    const result = await listCaseReports(f.root, 'case-one');
    assert.equal(result.length, 1);
    assert.equal(result[0].path, primary);
    assert.equal(result[0].label, 'Initial report.pdf');
    assert.equal(result[0].format, 'pdf');
    assert.equal(result[0].mimeType, 'application/pdf');
    assert.match(result[0].id, /^[a-f0-9]{32}$/);
    assert.ok(result[0].sizeBytes > 0);
    assert.deepEqual(await listCaseReports(f.root, 'missing-case'), []);
    assert.deepEqual(await listCaseReports(f.root, '../case-one'), []);
  } finally { await f.cleanup(); }
});

test('missing, empty, disguised PDF and unsupported files cannot become report links', async () => {
  const f = await fixture();
  try {
    const empty = path.join(f.reports, 'empty.pdf');
    const html = path.join(f.reports, 'disguised.pdf');
    const text = path.join(f.reports, 'notes.txt');
    const directory = path.join(f.reports, 'directory.pdf');
    await writeFile(empty, '');
    await writeFile(html, '<html>not a PDF</html>');
    await writeFile(text, 'notes');
    await mkdir(directory);
    await f.index([{ website_slug: 'case-one', existing_report_candidate_paths: [empty, html, text, directory, path.join(f.reports, 'missing.pdf'), 'relative.pdf'] }]);
    assert.deepEqual(await listCaseReports(f.root, 'case-one'), []);
  } finally { await f.cleanup(); }
});

test('PDFs appear before Word originals and exact or symlink duplicates are removed', async () => {
  const f = await fixture();
  try {
    const word = path.join(f.reports, 'Original.docx');
    const pdf = path.join(f.reports, 'Original.pdf');
    const alias = path.join(f.reports, 'Alias.pdf');
    await writeFile(word, 'PK\u0003\u0004fixture');
    await writeFile(pdf, '%PDF-1.7\nfixture');
    await symlink(pdf, alias);
    await f.index([
      { website_slug: 'case-one', existing_report_candidate_paths: [word, pdf, pdf] },
      { website_slug: 'case-one', existing_report_candidate_paths: [alias] },
    ]);
    const reports = await listCaseReports(f.root, 'case-one');
    assert.deepEqual(reports.map((report) => report.format), ['pdf', 'docx']);
    assert.deepEqual(reports.map((report) => report.path), [pdf, word]);
    assert.equal((await listCaseReports(f.root, 'case-one'))[0].id, reports[0].id);
  } finally { await f.cleanup(); }
});

test('malformed private report indexes fail clearly instead of silently using partial data', async () => {
  const f = await fixture();
  try {
    await writeFile(f.manifest, '{');
    await assert.rejects(listCaseReports(f.root, 'case-one'), EditorReportIndexError);
    for (const invalid of [{ records: {} }, { records: [null] }, []]) {
      await writeFile(f.manifest, JSON.stringify(invalid));
      await assert.rejects(listCaseReports(f.root, 'case-one'), /records array/);
    }
  } finally { await f.cleanup(); }
});

test('non-string candidates are ignored and stable metadata slugs survive file renaming', async () => {
  const f = await fixture();
  try {
    const pdf = path.join(f.reports, 'Report.pdf');
    await writeFile(pdf, '%PDF-1.7\nfixture');
    await f.index([{ website_slug: 'cross-chain-malware-theft', existing_report_candidate_paths: [null, 8, {}, pdf], filename: '10-557.md' }]);
    assert.equal((await listCaseReports(f.root, 'cross-chain-malware-theft')).length, 1);
    assert.equal((await listCaseReports(f.root, '10-557')).length, 0);
  } finally { await f.cleanup(); }
});
