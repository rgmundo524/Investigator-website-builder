import { createHash } from 'node:crypto';
import { open, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

/** This index is private editorial material, never part of the website content. */
export const CASE_REPORT_MANIFEST = 'private-review/caseload-index/report-acquisition/report-manifest.json';
const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;

export type CaseReport = {
  /** Opaque identifier for the editor's authenticated, local-only report route. */
  id: string;
  label: string;
  path: string;
  format: 'pdf' | 'docx' | 'doc';
  mimeType: string;
  sizeBytes: number;
};

export class EditorReportIndexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditorReportIndexError';
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function missing(error: unknown) {
  return object(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

async function readManifest(dataDir: string): Promise<Record<string, unknown>[]> {
  const filename = path.join(dataDir, CASE_REPORT_MANIFEST);
  let handle;
  try {
    handle = await open(filename, 'r');
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_MANIFEST_BYTES) {
      throw new EditorReportIndexError('The private report index is not a readable file within the supported size limit.');
    }
    let parsed: unknown;
    try { parsed = JSON.parse(await handle.readFile('utf8')); }
    catch { throw new EditorReportIndexError('The private report index contains invalid JSON.'); }
    if (!object(parsed) || !Array.isArray(parsed.records) || parsed.records.some((record) => !object(record))) {
      throw new EditorReportIndexError('The private report index must contain a records array.');
    }
    return parsed.records as Record<string, unknown>[];
  } catch (error) {
    if (missing(error)) return [];
    throw error;
  } finally {
    await handle?.close();
  }
}

async function describeReport(filename: string): Promise<CaseReport | undefined> {
  if (!path.isAbsolute(filename) || filename.includes('\0')) return;
  const extension = path.extname(filename).toLowerCase();
  const formats: Record<string, { format: CaseReport['format']; mimeType: string }> = {
    '.pdf': { format: 'pdf', mimeType: 'application/pdf' },
    '.docx': { format: 'docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    '.doc': { format: 'doc', mimeType: 'application/msword' },
  };
  const kind = formats[extension];
  if (!kind) return;
  let handle;
  try {
    // Original reports can live outside the content folder. Resolve only exact paths
    // already recorded in the private index; never search the evidence directories.
    const canonical = await realpath(filename);
    const info = await stat(canonical);
    if (!info.isFile() || !info.size) return;
    if (kind.format === 'pdf') {
      handle = await open(canonical, 'r');
      const header = Buffer.alloc(Math.min(info.size, 1024));
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      if (!header.subarray(0, bytesRead).includes(Buffer.from('%PDF-'))) return;
    }
    return {
      id: createHash('sha256').update(canonical).digest('hex').slice(0, 32),
      label: path.basename(filename),
      path: canonical,
      ...kind,
      sizeBytes: info.size,
    };
  } catch (error) {
    // An unavailable drive or deleted source must not break editing the case.
    if (missing(error) || (object(error) && ['EACCES', 'EPERM', 'ELOOP'].includes(String(error.code)))) return;
    throw error;
  } finally {
    await handle?.close();
  }
}

/**
 * Resolve only primary report candidates explicitly associated with this stable
 * case slug. Supporting exhibits, correspondence, notes and filename guesses are
 * deliberately excluded. A file rename need not change the slug or this mapping.
 */
export async function listCaseReports(dataDir: string, slug: string): Promise<CaseReport[]> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return [];
  const records = await readManifest(dataDir);
  const candidates = records
    .filter((record) => record.website_slug === slug)
    .flatMap((record) => Array.isArray(record.existing_report_candidate_paths) ? record.existing_report_candidate_paths : [])
    .filter((filename): filename is string => typeof filename === 'string');
  const reports: CaseReport[] = [];
  const seen = new Set<string>();
  for (const filename of new Set(candidates)) {
    const report = await describeReport(filename);
    if (report && !seen.has(report.path)) {
      reports.push(report);
      seen.add(report.path);
    }
  }
  // Preserve editorial index order within each format, but expose viewable PDFs first.
  return reports.sort((a, b) => Number(b.format === 'pdf') - Number(a.format === 'pdf'));
}
