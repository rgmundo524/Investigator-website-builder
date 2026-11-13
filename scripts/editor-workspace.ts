import { link, lstat, mkdir, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { parseDocument, stringify } from 'yaml';
import { createProcessor } from '@mdx-js/mdx';
import { schemas, type CollectionName, type ContentRecord } from '../src/content/schemas';
import { validateRecords } from './content';
import { OFF_CHAIN_LEAD_TYPES } from '../src/lib/off-chain-leads';
import { jurisdictionOptions } from '../src/lib/jurisdictions';
import { editorCaseCharts } from './editor-case-charts';
import { builderRoot as defaultBuilderRoot, resolveSiteSettings } from './site-data';

type Data = Record<string, unknown>;
export type EditorDraft = { file: string; data: Data; body: string; sourceHash: string | null };
export type EditorDocument = EditorDraft & { collection: CollectionName | null; id: string; issues: string[]; draftHash: string | null; draft?: EditorDraft };
export type DraftReview = { draft: EditorDraft; draftHash: string; changes: { field: string; before: unknown; after: unknown }[]; issues: string[]; canApply: boolean };
export type SaveDraftInput = Omit<EditorDraft, 'body'> & { body?: string; removeFields?: string[]; expectedDraftHash: string | null };
export type RenameCaseInput = { file: string; newName: string; sourceHash: string | null; expectedDraftHash: string | null };
export type RemoveCaseInput = { file: string; sourceHash: string | null; expectedDraftHash: string | null };
export type RemovedCase = { id: string; file: string; title: string; case_number: string | null; removedAt: string };
type RemovedCaseArchive = RemovedCase & { slug: string; sourceHash: string };
type RawDocument = Omit<EditorDocument, 'draft' | 'draftHash'> & { source: string | null; parsed?: ContentRecord };
const collections = Object.keys(schemas) as CollectionName[];
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const isObject = (value: unknown): value is Data => value !== null && typeof value === 'object' && !Array.isArray(value);
const isHash = (value: unknown): value is string | null => value === null || typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const archiveId = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export class EditorWorkspaceError extends Error {
  constructor(public code: 'INVALID_PATH' | 'CONFLICT' | 'INVALID_DRAFT' | 'NOT_FOUND', message: string, public issues: string[] = []) {
    super(message);
    this.name = 'EditorWorkspaceError';
  }
}

function mergeData(base: Data, update: Data): Data {
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(update)) {
    const next = isObject(value) && isObject(result[key]) ? mergeData(result[key] as Data, value) : structuredClone(value);
    Object.defineProperty(result, key, { value: next, enumerable: true, writable: true, configurable: true });
  }
  return result;
}

/** Local working drafts are outside content/ and are never read by the website. */
export class EditorWorkspace {
  private pending: Promise<unknown> = Promise.resolve();
  private constructor(public readonly dataDir: string) {}

  static async open(inputPath: string, builderRoot = defaultBuilderRoot): Promise<EditorWorkspace> {
    const workspace = new EditorWorkspace(await realpath(path.resolve(builderRoot, inputPath.trim() || 'templates/investigator-site')));
    const content = await workspace.safePath('content');
    if (!(await lstat(content)).isDirectory()) throw new EditorWorkspaceError('INVALID_PATH', 'Workspace needs a content directory.');
    await workspace.safePath('site.json');
    return workspace;
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.pending.then(operation, operation);
    this.pending = next.catch(() => undefined);
    return next;
  }

  private target(file: string): { collection: CollectionName | null; id: string } {
    if (typeof file !== 'string' || file.length > 500 || file.includes('\\') || /[\x00-\x1f]/.test(file)
      || file.startsWith('/') || path.posix.normalize(file) !== file) {
      throw new EditorWorkspaceError('INVALID_PATH', 'Use a relative content path without traversal.');
    }
    if (file === 'site.json') return { collection: null, id: 'site' };
    const parts = file.split('/');
    if (parts.length < 3 || parts[0] !== 'content' || !collections.includes(parts[1] as CollectionName)
      || parts.slice(2).some((part) => !/^[a-z0-9][a-z0-9._-]*$/.test(part))
      || !/\.mdx?$/.test(parts.at(-1)!)) {
      throw new EditorWorkspaceError('INVALID_PATH', 'Use content/<collection>/<safe filename>.md or .mdx.');
    }
    return { collection: parts[1] as CollectionName, id: parts.at(-1)!.replace(/\.mdx?$/, '') };
  }

  private async safePath(relative: string): Promise<string> {
    const full = path.resolve(this.dataDir, relative);
    if (full !== this.dataDir && !full.startsWith(`${this.dataDir}${path.sep}`)) throw new EditorWorkspaceError('INVALID_PATH', 'Path leaves the selected workspace.');
    let current = this.dataDir;
    for (const part of path.relative(this.dataDir, full).split(path.sep).filter(Boolean)) {
      current = path.join(current, part);
      try {
        if ((await lstat(current)).isSymbolicLink()) throw new EditorWorkspaceError('INVALID_PATH', `Symlinks are not editable: ${relative}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
        throw error;
      }
    }
    return full;
  }

  private async raw(file: string): Promise<RawDocument> {
    const target = this.target(file);
    const full = await this.safePath(file);
    let source: string;
    try { source = await readFile(full, 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { file, ...target, data: {}, body: '', sourceHash: null, source: null, issues: [] };
      throw error;
    }
    const result: RawDocument = { file, ...target, data: {}, body: '', sourceHash: hash(source), source, issues: [] };
    try {
      if (target.collection === null) {
        const data: unknown = JSON.parse(source);
        if (!isObject(data)) throw new Error('Settings must be an object.');
        result.data = data;
        resolveSiteSettings(data, {}, file);
      } else {
        const match = source.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
        if (!match) { result.body = source; throw new Error('Expected YAML frontmatter enclosed by --- lines.'); }
        const document = parseDocument(match[1], { uniqueKeys: true, customTags: ['timestamp'] });
        if (document.errors.length) throw new Error(document.errors.map(message).join('; '));
        const data: unknown = document.toJS();
        if (!isObject(data)) throw new Error('Frontmatter must be an object.');
        result.data = data;
        result.id = typeof data.slug === 'string' ? data.slug : target.id;
        result.body = source.replace(/^\uFEFF/, '').slice(match[0].length);
        result.issues = this.documentIssues(file, data, result.body);
        const parsed = schemas[target.collection].safeParse(data);
        if (parsed.success && !result.issues.length) result.parsed = { file: full, collection: target.collection, data: parsed.data, body: result.body } as ContentRecord;
      }
    } catch (error) { result.issues.push(`${file}: ${message(error)}`); }
    return result;
  }

  private documentIssues(file: string, data: Data, body: string): string[] {
    const { collection } = this.target(file);
    if (!collection) {
      try { resolveSiteSettings(data, {}, file); return body.trim() ? ['site.json: Settings do not have body text.'] : []; } catch (error) { return [message(error)]; }
    }
    const parsed = schemas[collection].safeParse(data);
    const issues = parsed.success ? [] : parsed.error.issues.map((issue) => `${file}: ${issue.path.join('.') || 'frontmatter'}: ${issue.message}`);
    if (!body.trim()) issues.push(`${file}: Add body text below the frontmatter.`);
    if (file.endsWith('.mdx') && body.trim()) {
      try { createProcessor().parse({ path: file, value: body }); } catch (error) { issues.push(`${file}: ${message(error)}`); }
    }
    return issues;
  }

  private async catalog(): Promise<{ documents: RawDocument[]; issues: string[] }> {
    const documents: RawDocument[] = [];
    const issues: string[] = [];
    const visit = async (directory: string) => {
      const full = await this.safePath(directory);
      let entries;
      try { entries = await readdir(full, { withFileTypes: true }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const file = `${directory}/${entry.name}`;
        if (entry.isSymbolicLink()) { issues.push(`${file}: Symlinks are not editable.`); continue; }
        if (entry.isDirectory()) await visit(file);
        else if (entry.isFile() && /\.mdx?$/.test(entry.name)) {
          try { documents.push(await this.raw(file)); } catch (error) { issues.push(message(error)); }
        }
      }
    };
    for (const collection of collections) await visit(`content/${collection}`);
    return { documents, issues };
  }

  private draftFile(file: string) { this.target(file); return `.website-editor/drafts/${hash(file)}.json`; }

  private async draftState(file: string): Promise<{ draft: EditorDraft; draftHash: string } | undefined> {
    const full = await this.safePath(this.draftFile(file));
    try {
      const source = await readFile(full, 'utf8');
      const draft: unknown = JSON.parse(source);
      if (!isObject(draft) || draft.file !== file || !isObject(draft.data) || typeof draft.body !== 'string'
        || !(draft.sourceHash === null || typeof draft.sourceHash === 'string')) throw new Error(`Invalid working draft for ${file}.`);
      return { draft: draft as EditorDraft, draftHash: hash(source) };
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  }

  private async draft(file: string): Promise<EditorDraft | undefined> { return (await this.draftState(file))?.draft; }

  private async drafts(): Promise<EditorDraft[]> {
    const directory = await this.safePath('.website-editor/drafts');
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    const drafts: EditorDraft[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !/^[a-f0-9]{64}\.json$/.test(entry.name)) continue;
      const full = await this.safePath(`.website-editor/drafts/${entry.name}`);
      const saved: unknown = JSON.parse(await readFile(full, 'utf8'));
      if (!isObject(saved) || typeof saved.file !== 'string') throw new Error('Invalid editor draft file.');
      const draft = await this.draft(saved.file);
      if (draft) drafts.push(draft);
    }
    return drafts;
  }

  private staleDraftIssues(draft: EditorDraft | undefined): string[] {
    return draft && Object.hasOwn(draft, 'expertisePlacement')
      ? ['This working draft includes an older page-placement change. Its wording is preserved. Copy any pending wording, discard this draft, and choose records from the page editor before applying.'] : [];
  }

  private async removedCase(id: string): Promise<RemovedCaseArchive> {
    if (typeof id !== 'string' || !archiveId.test(id)) throw new EditorWorkspaceError('INVALID_PATH', 'Choose a removed case from this workspace.');
    let saved: unknown;
    try { saved = JSON.parse(await readFile(await this.safePath(`.website-editor/removed-cases/${id}/metadata.json`), 'utf8')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new EditorWorkspaceError('NOT_FOUND', 'This removed case is no longer available.');
      throw error;
    }
    if (!isObject(saved) || saved.id !== id || typeof saved.file !== 'string'
      || this.target(saved.file).collection !== 'cases' || typeof saved.title !== 'string'
      || !(saved.case_number === null || typeof saved.case_number === 'string')
      || typeof saved.removedAt !== 'string' || !Number.isFinite(Date.parse(saved.removedAt))
      || typeof saved.slug !== 'string' || !isHash(saved.sourceHash) || saved.sourceHash === null) {
      throw new EditorWorkspaceError('INVALID_DRAFT', 'The removed case has invalid recovery information.');
    }
    return { id, file: saved.file, title: saved.title, case_number: saved.case_number, removedAt: saved.removedAt,
      slug: saved.slug, sourceHash: saved.sourceHash } as RemovedCaseArchive;
  }

  private async removedCases(issues: string[]): Promise<RemovedCase[]> {
    const directory = await this.safePath('.website-editor/removed-cases');
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    const removed: RemovedCase[] = [];
    for (const entry of entries) {
      if (!archiveId.test(entry.name)) continue;
      try {
        if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('Recovery entries must be local directories.');
        const { slug: _slug, sourceHash: _sourceHash, ...record } = await this.removedCase(entry.name);
        removed.push(record);
      } catch (error) { issues.push(`Removed case ${entry.name}: ${message(error)}`); }
    }
    return removed.sort((a, b) => b.removedAt.localeCompare(a.removedAt));
  }

  async snapshot() {
    const { documents, issues } = await this.catalog();
    const drafts = new Map((await this.drafts()).map((draft) => [draft.file, draft]));
    for (const draft of drafts.values()) {
      if (draft.file !== 'site.json' && !documents.some(({ file }) => file === draft.file)) documents.push(await this.raw(draft.file));
    }
    const settings = await this.readRecord('site.json');
    const records = documents.map((record) => {
      const draft = drafts.get(record.file);
      const data = record.sourceHash === null && draft ? draft.data : record.data;
      return { collection: record.collection!, id: String(data.slug ?? record.id), file: record.file,
        title: String(data.title ?? data.name ?? (record.collection === 'experience' && data.role && data.organization ? `${data.role} · ${data.organization}` : data.role) ?? data.program ?? data.organization ?? record.id),
        publication_status: data.publication_status ?? null, case_number: data.case_number ?? null, kind: data.kind ?? null,
        ...(record.collection === 'cases' ? { chart: data.chart ?? null, category: data.category ?? null,
          ...(draft ? { draftChart: draft.data.chart ?? null, draftCategory: draft.data.category ?? null } : {}) } : {}),
        hasSource: record.sourceHash !== null, sourceValid: Boolean(record.parsed),
        hasDraft: !!draft, issues: [...(record.sourceHash === null && draft ? this.documentIssues(record.file, data, draft.body) : record.issues),
          ...this.staleDraftIssues(draft)] };
    });
    try { validateRecords(documents.flatMap((document) => document.parsed ? [document.parsed] : [])); } catch (error) { issues.push(message(error)); }
    const removedCases = await this.removedCases(issues);
    const caseCharts = editorCaseCharts(documents.map((record) => ({ ...record, draft: drafts.get(record.file) })));
    const existingJurisdictions = documents.filter((record) => record.collection === 'cases').flatMap((record) => {
      const sourceValues = record.data.jurisdictions;
      const draftValues = drafts.get(record.file)?.data.jurisdictions;
      return [...(Array.isArray(sourceValues) ? sourceValues : []), ...(Array.isArray(draftValues) ? draftValues : [])];
    });
    return { dataDir: this.dataDir, name: documents.find((record) => record.collection === 'profile')?.data.name ?? path.basename(this.dataDir),
      collections, records, removedCases, settings, issues, caseCharts, offChainLeadTypes: OFF_CHAIN_LEAD_TYPES,
      jurisdictionOptions: jurisdictionOptions(existingJurisdictions),
      charts: documents.filter((record) => record.collection === 'charts').map((record) => ({ id: record.id,
        title: record.data.title ?? record.id, categories: record.data.categories ?? [] })) };
  }

  async readRecord(file: string): Promise<EditorDocument> {
    const { source: _source, parsed: _parsed, ...record } = await this.raw(file);
    const state = await this.draftState(file);
    const draft = state?.draft;
    if (record.sourceHash === null && !draft) throw new EditorWorkspaceError('NOT_FOUND', `Record not found: ${file}`);
    return { ...record, issues: [...record.issues, ...this.staleDraftIssues(draft)], draftHash: state?.draftHash ?? null, ...(draft ? { draft } : {}) };
  }

  async saveDraft(input: SaveDraftInput): Promise<DraftReview> {
    return this.serial(async () => {
      const target = this.target(input.file);
      if (['expertisePage', 'expectedExpertisePages', 'expertisePlacement'].some((field) => Object.hasOwn(input, field))) {
        throw new EditorWorkspaceError('INVALID_DRAFT', 'Page placement is edited on Pages. Reload the builder before saving this record.');
      }
      if (!isObject(input.data) || (input.body !== undefined && typeof input.body !== 'string')
        || (input.removeFields !== undefined && (!Array.isArray(input.removeFields) || input.removeFields.some((field) => typeof field !== 'string')))
        || !isHash(input.expectedDraftHash) || !isHash(input.sourceHash)) {
        throw new EditorWorkspaceError('INVALID_DRAFT', 'A working draft needs object data, body text, sourceHash, and expectedDraftHash (null when no source or working draft exists).');
      }
      const original = await this.raw(input.file);
      if (original.sourceHash !== input.sourceHash) throw new EditorWorkspaceError('CONFLICT', 'The source changed outside the editor. Reload before saving.');
      const previousState = await this.draftState(input.file);
      if ((previousState?.draftHash ?? null) !== input.expectedDraftHash) {
        throw new EditorWorkspaceError('CONFLICT', 'The working draft changed in another tab. Reload before saving.');
      }
      const previous = previousState?.draft;
      const staleIssues = this.staleDraftIssues(previous);
      if (staleIssues.length) throw new EditorWorkspaceError('INVALID_DRAFT', 'This older working draft needs review before saving.', staleIssues);
      if (previous && previous.sourceHash !== input.sourceHash) throw new EditorWorkspaceError('CONFLICT', 'This working draft is based on an older source. Discard it and reload before saving.');
      const data = mergeData(previous?.data ?? original.data, input.data);
      for (const field of input.removeFields ?? []) {
        const parts = field.split('.');
        if (!parts.length || parts.some((part) => !/^[a-zA-Z0-9_-]+$/.test(part) || ['__proto__', 'constructor', 'prototype'].includes(part))) {
          throw new EditorWorkspaceError('INVALID_DRAFT', 'Invalid field removal path.');
        }
        let parent: Data | undefined = data;
        for (const part of parts.slice(0, -1)) { parent = parent && isObject(parent[part]) ? parent[part] as Data : undefined; }
        if (parent) delete parent[parts.at(-1)!];
      }
      if (target.collection && original.sourceHash !== null && typeof original.data.slug === 'string' && data.slug !== original.data.slug) {
        throw new EditorWorkspaceError('INVALID_DRAFT', 'An existing record slug cannot be changed.');
      }
      if (target.collection && original.sourceHash === null
        && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(data.slug ?? '')) || input.file !== `content/${target.collection}/${data.slug}.md`)) {
        throw new EditorWorkspaceError('INVALID_PATH', 'New records use content/<collection>/<slug>.md with a safe lowercase slug.');
      }
      const draft: EditorDraft = { file: input.file, data, body: input.body ?? previous?.body ?? original.body, sourceHash: input.sourceHash };
      await this.atomicWrite(this.draftFile(input.file), `${JSON.stringify(draft, null, 2)}\n`);
      return this.review(input.file);
    });
  }

  async reviewDraft(file: string): Promise<DraftReview> { return this.review(file); }

  private async review(file: string, publicationStatus?: 'draft' | 'published'): Promise<DraftReview> {
    const state = await this.draftState(file);
    if (!state) throw new EditorWorkspaceError('NOT_FOUND', `No working draft: ${file}`);
    const { draft, draftHash } = state;
    const original = await this.raw(file);
    const { collection } = this.target(file);
    const data = publicationStatus && collection ? { ...draft.data, publication_status: publicationStatus } : draft.data;
    const issues = [...this.documentIssues(file, data, draft.body), ...this.staleDraftIssues(draft)];
    if (original.sourceHash !== draft.sourceHash) issues.push(`${file}: Source changed outside the editor; reload before applying.`);
    if (collection && original.sourceHash !== null && typeof original.data.slug === 'string' && data.slug !== original.data.slug) issues.push(`${file}: Existing slug cannot change.`);
    if (collection && original.sourceHash === null
      && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(data.slug ?? '')) || file !== `content/${collection}/${data.slug}.md`)) {
      issues.push(`${file}: New records must use their lowercase slug as the .md filename.`);
    }
    const catalog = await this.catalog();
    issues.push(...catalog.issues);
    if (file !== 'site.json') issues.push(...(await this.raw('site.json')).issues);
    for (const record of catalog.documents) if (record.file !== file) issues.push(...record.issues);
    if (!issues.length) {
      const records = catalog.documents.filter((record) => record.file !== file).flatMap((record) => record.parsed ? [record.parsed] : []);
      if (collection) {
        const parsed = schemas[collection].parse(data);
        records.push({ collection, data: parsed, body: draft.body, file: path.join(this.dataDir, file) } as ContentRecord);
      }
      try { validateRecords(records); } catch (error) { issues.push(message(error)); }
    }
    const changes = [...new Set([...Object.keys(original.data), ...Object.keys(data)])]
      .filter((field) => !equal(original.data[field], data[field]))
      .map((field) => ({ field, before: original.data[field] ?? null, after: data[field] ?? null }));
    if (original.body !== draft.body) changes.push({ field: 'body', before: original.body, after: draft.body });
    return { draft: { ...draft, data }, draftHash, changes, issues, canApply: issues.length === 0 };
  }

  async applyDraft(file: string, publicationStatus: 'draft' | 'published', expectedDraftHash: string | null): Promise<EditorDocument & { backupFile: string | null; backupFiles: string[] }> {
    return this.serial(async () => {
      if (!['draft', 'published'].includes(publicationStatus)) throw new EditorWorkspaceError('INVALID_DRAFT', 'Apply as draft or published.');
      if (!isHash(expectedDraftHash)) throw new EditorWorkspaceError('INVALID_DRAFT', 'Provide the working draft revision you reviewed.');
      const state = await this.draftState(file);
      if ((state?.draftHash ?? null) !== expectedDraftHash) throw new EditorWorkspaceError('CONFLICT', 'The working draft changed. Review it again before applying.');
      const draft = state?.draft;
      if (draft && (await this.raw(file)).sourceHash !== draft.sourceHash) throw new EditorWorkspaceError('CONFLICT', 'The source changed outside the editor. Reload before applying.');
      const review = await this.review(file, publicationStatus);
      if (review.draftHash !== expectedDraftHash) throw new EditorWorkspaceError('CONFLICT', 'The working draft changed. Review it again before applying.');
      if (!review.canApply) throw new EditorWorkspaceError('INVALID_DRAFT', 'Resolve validation issues before applying.', review.issues);
      const original = await this.raw(file);
      if (original.sourceHash !== review.draft.sourceHash) throw new EditorWorkspaceError('CONFLICT', 'The source changed outside the editor.');
      const source = file === 'site.json' ? `${JSON.stringify(review.draft.data, null, 2)}\n`
        : `---\n${stringify(review.draft.data, { lineWidth: 0, defaultStringType: 'QUOTE_DOUBLE' })}---\n${review.draft.body}`;
      let backupFile: string | null = null;
      if (original.source !== null) {
        backupFile = `.website-editor/backups/${Date.now()}-${randomUUID()}.json`;
        await this.atomicWrite(backupFile, `${JSON.stringify({ file, sourceHash: original.sourceHash, source: original.source }, null, 2)}\n`);
      }
      let applied = false;
      try {
        await this.atomicWrite(file, source, original.sourceHash);
        applied = true;
        await rm(await this.safePath(this.draftFile(file)), { force: true });
      } catch (error) {
        if (applied) {
          try {
            if (original.source !== null) await this.atomicWrite(file, original.source, hash(source));
            else {
              if ((await this.raw(file)).sourceHash !== hash(source)) throw new Error('The newly applied record changed outside the editor.');
              await rm(await this.safePath(file));
            }
          } catch (restoreError) {
            throw new EditorWorkspaceError('CONFLICT', 'Applying the working draft could not finish or safely restore the source. Original copies are preserved in the listed backups.',
              [`${file}: ${message(restoreError)}`, ...(backupFile ? [backupFile] : [])]);
          }
        }
        throw error;
      }
      return { ...await this.readRecord(file), backupFile, backupFiles: backupFile ? [backupFile] : [] };
    });
  }

  async discardDraft(file: string, expectedDraftHash: string | null): Promise<void> {
    return this.serial(async () => {
      if (!isHash(expectedDraftHash)) throw new EditorWorkspaceError('INVALID_DRAFT', 'Provide the working draft revision you intend to discard.');
      const state = await this.draftState(file);
      if ((state?.draftHash ?? null) !== expectedDraftHash) throw new EditorWorkspaceError('CONFLICT', 'The working draft changed. Reload before discarding it.');
      await rm(await this.safePath(this.draftFile(file)), { force: true });
    });
  }

  /** Remove the website record while preserving an exact local copy for restoration. */
  async removeCase(input: RemoveCaseInput): Promise<RemovedCase> {
    return this.serial(async () => {
      if (this.target(input.file).collection !== 'cases') throw new EditorWorkspaceError('INVALID_PATH', 'Only case records can be removed here.');
      if (!isHash(input.sourceHash) || !isHash(input.expectedDraftHash)) throw new EditorWorkspaceError('INVALID_DRAFT', 'Provide the current source and working-draft revisions.');
      const original = await this.raw(input.file);
      if (original.source === null) throw new EditorWorkspaceError('NOT_FOUND', 'This case has no website record to remove. Discard its new working draft instead.');
      if (original.sourceHash !== input.sourceHash) throw new EditorWorkspaceError('CONFLICT', 'The source changed outside the editor. Reload before removing this case.');
      const checkDraft = async () => {
        const draft = await this.draftState(input.file);
        if ((draft?.draftHash ?? null) !== input.expectedDraftHash) throw new EditorWorkspaceError('CONFLICT', 'The working draft changed. Reload before removing this case.');
        if (draft) throw new EditorWorkspaceError('CONFLICT', 'Apply or discard this case\'s working draft before removing it.');
      };
      await checkDraft();
      // Inspect raw frontmatter so an unrelated invalid record cannot prevent cleanup.
      const catalog = await this.catalog();
      const referring = new Set(catalog.documents.filter(record => record.collection === 'articles'
        && Array.isArray(record.data.related_cases) && record.data.related_cases.includes(original.id)).map(record => record.file));
      for (const draft of await this.drafts()) {
        if (this.target(draft.file).collection === 'articles' && Array.isArray(draft.data.related_cases)
          && draft.data.related_cases.includes(original.id)) referring.add(`${draft.file} (working draft)`);
      }
      if (referring.size) throw new EditorWorkspaceError('CONFLICT', 'Remove this case from the related cases in these articles before removing it.', [...referring]);
      await checkDraft();
      const full = await this.safePath(input.file);
      const source = await readFile(full);
      if (hash(source.toString('utf8')) !== input.sourceHash) throw new EditorWorkspaceError('CONFLICT', 'The source changed before removal. Reload first.');
      const id = randomUUID();
      const record: RemovedCase = { id, file: input.file, title: String(original.data.title ?? original.id),
        case_number: typeof original.data.case_number === 'string' ? original.data.case_number : null, removedAt: new Date().toISOString() };
      const archive = `.website-editor/removed-cases/${id}`;
      const pending = `.website-editor/removed-cases/.pending-${id}`;
      const pendingFull = await this.safePath(pending);
      await mkdir(pendingFull, { recursive: true });
      await this.safePath(pending);
      const archivedSource = await this.safePath(`${pending}/source.md`);
      let moved = false;
      try {
        await writeFile(await this.safePath(`${pending}/metadata.json`), `${JSON.stringify({ ...record, slug: original.id, sourceHash: hash(source) }, null, 2)}\n`, { flag: 'wx' });
        await this.safePath(input.file);
        await rename(full, archivedSource);
        moved = true;
        if (hash(await readFile(archivedSource)) !== hash(source)) throw new EditorWorkspaceError('CONFLICT', 'The source changed before removal. Its latest contents have been restored.');
        await rename(pendingFull, await this.safePath(archive));
        moved = false;
      } catch (error) {
        if (moved) {
          try {
            await this.safePath(input.file);
            await link(archivedSource, full);
            await rm(pendingFull, { recursive: true });
          } catch (restoreError) {
            throw new EditorWorkspaceError('CONFLICT', `Removal could not finish or safely restore the original path. Its source is preserved at ${archivedSource}. ${message(restoreError)}`);
          }
        } else await rm(pendingFull, { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }
      return record;
    });
  }

  /** Restore to the original filename and slug without overwriting a case or draft. */
  async restoreCase(id: string): Promise<EditorDocument> {
    return this.serial(async () => {
      const archive = await this.removedCase(id);
      const archivedSource = await this.safePath(`.website-editor/removed-cases/${id}/source.md`);
      const source = await readFile(archivedSource);
      if (hash(source) !== archive.sourceHash) throw new EditorWorkspaceError('CONFLICT', 'The recovery copy changed. It has been left untouched.');
      const full = await this.safePath(archive.file);
      const checkDestination = async () => {
        await this.safePath(archive.file);
        if (await this.draftState(archive.file)) throw new EditorWorkspaceError('CONFLICT', 'A working draft already uses this case filename. Apply or discard it before restoring.');
        try { await lstat(full); throw new EditorWorkspaceError('CONFLICT', 'A file already uses this case filename. It has not been overwritten.'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        let names: string[] = [];
        try { names = await readdir(path.dirname(full)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        if (names.some(name => name.toLowerCase() === path.basename(full).toLowerCase())) throw new EditorWorkspaceError('CONFLICT', 'A file already uses this case filename. It has not been overwritten.');
        const catalog = await this.catalog();
        const collision = catalog.documents.find(record => record.collection === 'cases' && record.id === archive.slug);
        const draftCollision = (await this.drafts()).find(draft => this.target(draft.file).collection === 'cases' && draft.data.slug === archive.slug);
        if (collision || draftCollision) throw new EditorWorkspaceError('CONFLICT', 'Another case or working draft already uses this case identifier. It has not been overwritten.');
      };
      await checkDestination();
      await mkdir(path.dirname(full), { recursive: true });
      await this.safePath(archive.file);
      const temporary = path.join(path.dirname(full), `.editor-restore-${randomUUID()}.tmp`);
      let linked = false;
      try {
        // Copy bytes before linking the destination so later website edits cannot alter recovery copies.
        await writeFile(temporary, source, { flag: 'wx' });
        await checkDestination();
        await link(temporary, full);
        linked = true;
        await rename(await this.safePath(`.website-editor/removed-cases/${id}`), await this.safePath(`.website-editor/removed-cases/.restored-${id}`));
      } catch (error) {
        if (linked) {
          // Do not remove an externally changed file during rollback.
          if (hash(await readFile(full)) === archive.sourceHash) await rm(full);
          else throw new EditorWorkspaceError('CONFLICT', 'Restoration could not finish and the destination changed outside the editor. Both copies have been preserved.');
        }
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new EditorWorkspaceError('CONFLICT', 'A file now uses this case filename. It has not been overwritten.');
        throw error;
      } finally { await rm(temporary, { force: true }).catch(() => undefined); }
      return this.readRecord(archive.file);
    });
  }

  /** Rename only the local file. The stable slug, URLs, references, and content stay unchanged. */
  async renameCase(input: RenameCaseInput): Promise<EditorDocument & {
    oldFile: string; oldId: string; newId: string; backupFile: string; updatedFiles: string[];
  }> {
    return this.serial(async () => {
      if (this.target(input.file).collection !== 'cases') throw new EditorWorkspaceError('INVALID_PATH', 'Only case files can be renamed here.');
      if (typeof input.newName !== 'string' || !isHash(input.sourceHash) || !isHash(input.expectedDraftHash)) {
        throw new EditorWorkspaceError('INVALID_PATH', 'Provide a filename and the current source and working-draft revisions.');
      }
      const extension = path.posix.extname(input.file);
      const requested = input.newName.trim();
      const name = requested.endsWith(extension) ? requested.slice(0, -extension.length) : requested;
      if (name.length > 160 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
        throw new EditorWorkspaceError('INVALID_PATH', `Use a lowercase filename with numbers or hyphens, optionally ending in ${extension}.`);
      }
      const newFile = `${path.posix.dirname(input.file)}/${name}${extension}`;
      if (newFile === input.file) throw new EditorWorkspaceError('INVALID_PATH', 'This case already uses that filename.');
      const original = await this.raw(input.file);
      if (original.source === null) throw new EditorWorkspaceError('NOT_FOUND', 'Apply the new case before renaming its file.');
      if (original.sourceHash !== input.sourceHash) throw new EditorWorkspaceError('CONFLICT', 'The source changed outside the editor. Reload before renaming.');
      const draft = await this.draftState(input.file);
      if ((draft?.draftHash ?? null) !== input.expectedDraftHash) throw new EditorWorkspaceError('CONFLICT', 'The working draft changed. Reload before renaming.');
      if (draft) throw new EditorWorkspaceError('CONFLICT', 'Apply or discard this case\'s working draft before renaming its file.');
      if (await this.draftState(newFile)) throw new EditorWorkspaceError('CONFLICT', 'A working draft already uses the requested filename.');
      const oldFull = await this.safePath(input.file);
      const newFull = await this.safePath(newFile);
      const names = await readdir(path.dirname(oldFull));
      if (names.some((entry) => entry.toLowerCase() === path.basename(newFile).toLowerCase())) {
        throw new EditorWorkspaceError('CONFLICT', 'A file already uses the requested filename. Choose another name.');
      }

      const catalog = await this.catalog();
      const issues = [...catalog.issues, ...(await this.raw('site.json')).issues, ...catalog.documents.flatMap((record) => record.issues)];
      if (!issues.length) {
        try {
          validateRecords(catalog.documents.flatMap((record) => record.parsed ? [{ ...record.parsed,
            file: record.file === input.file ? newFull : record.parsed.file }] : []));
        } catch (error) { issues.push(message(error)); }
      }
      if (issues.length) throw new EditorWorkspaceError('INVALID_DRAFT', 'Resolve catalog validation issues before renaming.', issues);
      if ((await this.raw(input.file)).sourceHash !== input.sourceHash) throw new EditorWorkspaceError('CONFLICT', 'The source changed before renaming. Reload first.');

      const backupFile = `.website-editor/backups/${Date.now()}-${randomUUID()}.json`;
      await this.atomicWrite(backupFile, `${JSON.stringify({ operation: 'rename-case', file: input.file, newFile,
        sourceHash: original.sourceHash, source: original.source }, null, 2)}\n`);
      const temporary = path.join(path.dirname(oldFull), `.editor-rename-${randomUUID()}.tmp`);
      let moved = false;
      let linked = false;
      try {
        await this.safePath(input.file);
        await this.safePath(newFile);
        await rename(oldFull, temporary);
        moved = true;
        if (hash(await readFile(temporary, 'utf8')) !== input.sourceHash) throw new EditorWorkspaceError('CONFLICT', 'The source changed before renaming. The latest source has been restored.');
        // A hard link creates the destination atomically and refuses an existing target.
        await link(temporary, newFull);
        linked = true;
        // Once the destination exists the rename is complete; a leftover temporary
        // hard link is recoverable and must not make a successful rename look failed.
        await rm(temporary).catch(() => undefined);
        moved = false;
      } catch (error) {
        if (moved && !linked) {
          try {
            // Do not overwrite a file created externally at the original path.
            await link(temporary, oldFull);
            await rm(temporary);
          } catch (restoreError) {
            throw new EditorWorkspaceError('CONFLICT', `Rename could not finish or safely restore the original path. The source is preserved at ${temporary}; backup: ${backupFile}. ${message(restoreError)}`);
          }
        }
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new EditorWorkspaceError('CONFLICT', 'A file now uses the requested filename. The original case was restored.');
        throw error;
      }
      return { ...await this.readRecord(newFile), oldFile: input.file, oldId: original.id, newId: original.id,
        backupFile, updatedFiles: [newFile] };
    });
  }

  private async atomicWrite(file: string, source: string, expectedHash?: string | null): Promise<void> {
    let full = await this.safePath(file);
    await mkdir(path.dirname(full), { recursive: true });
    full = await this.safePath(file);
    const temporary = path.join(path.dirname(full), `.editor-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, source, { flag: 'wx' });
      await this.safePath(file);
      if (expectedHash !== undefined && (await this.raw(file)).sourceHash !== expectedHash) throw new EditorWorkspaceError('CONFLICT', 'The source changed before applying.');
      await rename(temporary, full);
    } finally { await rm(temporary, { force: true }); }
  }
}
