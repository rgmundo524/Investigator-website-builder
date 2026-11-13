import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import { readFile, readdir, realpath, mkdir, writeFile, stat, lstat, open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { build } from 'esbuild';
import { builderRoot } from './site-data';
import { initializeSite } from './init-site';
import { EditorWorkspace, EditorWorkspaceError } from './editor-workspace';
import { EditorJobs } from './editor-jobs';
import { listCaseReports } from './editor-reports';
import { contentIconCatalog } from './editor-icons';

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

type ServerOptions = { rootDir?: string; port?: number; dataDir?: string; jobs?: EditorJobs };
const mime: Record<string, string> = { '/app.js': 'text/javascript; charset=utf-8', '/styles.css': 'text/css; charset=utf-8' };
const within = (root: string, target: string) => {
  const relative = path.relative(root, target);
  return !relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

function rejectUnsafeKeys(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new HttpError(400, 'Unsupported field name.');
    rejectUnsafeKeys(child);
  }
}

async function jsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Send JSON data.');
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 12 * 1024 * 1024) throw new HttpError(413, 'This request is too large. Images must be smaller than 8 MB.');
    chunks.push(Buffer.from(chunk));
  }
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'The request is not valid JSON.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new HttpError(400, 'Expected an object.');
  rejectUnsafeKeys(parsed);
  return parsed as Record<string, unknown>;
}

function string(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `${label} is required.`);
  return value;
}

async function listFolders(input: string) {
  const folder = await realpath(input);
  const entries = await readdir(folder, { withFileTypes: true });
  const directories = await Promise.all(entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name)).map(async entry => {
      const directory = path.join(folder, entry.name);
      let isWorkspace = false;
      try { isWorkspace = (await stat(path.join(directory, 'site.json'))).isFile() && (await stat(path.join(directory, 'content'))).isDirectory(); } catch { /* Ordinary folder. */ }
      return { name: entry.name, path: directory, isWorkspace };
    }));
  return { path: folder, parent: path.dirname(folder), directories };
}

const assetDirectories = { portrait: 'assets', personal: 'assets/images/personal', credential: 'assets/credentials', organization: 'assets/organizations' };
const recordTemplates: Record<string, string> = { cases: 'case', experience: 'experience', credentials: 'credential', education: 'education', expertise: 'expertise', projects: 'project', interests: 'interest', resources: 'resource', articles: 'article', skills: 'skill', activities: 'activity', repositories: 'repository' };
type AssetKind = keyof typeof assetDirectories;

async function assetFolder(dataDir: string, kind: AssetKind, create = false) {
  const expected = path.join(dataDir, assetDirectories[kind]);
  if (create) {
    // Check every existing ancestor before mkdir can follow a symlink.
    let parent = dataDir;
    for (const part of assetDirectories[kind].split('/')) {
      parent = path.join(parent, part);
      try { if (!within(dataDir, await realpath(parent))) throw new HttpError(400, 'The asset folder points outside this investigator folder.'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    await mkdir(expected, { recursive: true });
  }
  const actual = await realpath(expected);
  if (!within(dataDir, actual)) throw new HttpError(400, 'The asset folder points outside this investigator folder.');
  return actual;
}

async function listAssets(dataDir: string) {
  const assets: { name: string; file: string; kind: AssetKind }[] = [];
  for (const kind of Object.keys(assetDirectories) as AssetKind[]) {
    let directory: string;
    try { directory = await assetFolder(dataDir, kind); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isFile() && /^[a-z0-9-]+\.(png|jpe?g|webp)$/.test(entry.name)) {
        assets.push({ name: entry.name, file: `${assetDirectories[kind]}/${entry.name}`, kind });
      }
    }
  }
  return { assets: assets.sort((a, b) => a.file.localeCompare(b.file)) };
}

async function readAssetPreview(dataDir: string, file: string) {
  const asset = (await listAssets(dataDir)).assets.find(candidate => candidate.file === file);
  if (!asset) throw new HttpError(404, 'Choose an image from this investigator folder.');
  let expected = dataDir;
  for (const part of asset.file.split('/')) {
    expected = path.join(expected, part);
    if ((await lstat(expected)).isSymbolicLink()) throw new HttpError(400, 'Image previews cannot follow symbolic links.');
  }
  const actual = await realpath(expected);
  if (actual !== expected || !within(path.join(dataDir, assetDirectories[asset.kind]), actual)) throw new HttpError(400, 'The image points outside its asset folder.');
  const handle = await open(actual, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!(await handle.stat()).isFile()) throw new HttpError(404, 'The image is no longer available.');
    const bytes = await handle.readFile();
    const extension = path.extname(asset.name);
    const mimeType = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg';
    return { bytes, mimeType };
  } finally { await handle.close(); }
}

async function saveAsset(dataDir: string, body: Record<string, unknown>) {
  const kind = string(body.kind, 'Image type') as AssetKind;
  if (!Object.hasOwn(assetDirectories, kind)) throw new HttpError(400, 'Choose portrait, personal, credential, or organization.');
  const originalName = string(body.name, 'Filename');
  if (path.basename(originalName) !== originalName || originalName.includes('\\')) throw new HttpError(400, 'Use a filename without a folder path.');
  const name = originalName.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+/, '');
  if (!/^[a-z0-9-]+\.(png|jpe?g|webp)$/.test(name)) throw new HttpError(400, 'Use a PNG, JPEG, or WebP image.');
  const encoded = string(body.base64, 'Image');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new HttpError(400, 'The image encoding is invalid.');
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new HttpError(413, 'Images must be smaller than 8 MB.');
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!(name.endsWith('.png') ? png : name.endsWith('.webp') ? webp : jpeg)) throw new HttpError(400, 'The file contents do not match its image extension.');
  const folder = await assetFolder(dataDir, kind, true);
  try { await writeFile(path.join(folder, name), bytes, { flag: 'wx' }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new HttpError(409, 'An image with that name already exists. Rename the new image before uploading.');
    throw error;
  }
  return { name, file: `${assetDirectories[kind]}/${name}`, kind };
}

type LinkedReport = { path: string; label: string; format: string; mimeType: string };

async function streamReport(request: IncomingMessage, response: ServerResponse, report: LinkedReport) {
  const handle = await open(report.path, 'r');
  let streaming = false;
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new HttpError(404, 'The source report is no longer available.');
    if (report.format === 'pdf') {
      const signature = Buffer.alloc(Math.min(info.size, 1024));
      const { bytesRead } = await handle.read(signature, 0, signature.length, 0);
      if (!signature.subarray(0, bytesRead).includes(Buffer.from('%PDF-'))) throw new HttpError(400, 'The linked file is not a PDF report.');
    }
    let start = 0; let end = info.size - 1;
    const range = request.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) {
        response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); response.end(); return;
      }
      if (!match[1]) start = Math.max(0, info.size - Number(match[2]));
      else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) {
        response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); response.end(); return;
      }
      response.statusCode = 206;
      response.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
    }
    response.setHeader('Content-Type', report.mimeType);
    response.setHeader('Content-Disposition', `${report.format === 'pdf' ? 'inline' : 'attachment'}; filename="report.${report.format}"; filename*=UTF-8''${encodeURIComponent(path.basename(report.path))}`);
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Content-Length', String(Math.max(0, end - start + 1)));
    if (request.method === 'HEAD' || !info.size) { response.end(); return; }
    const stream = handle.createReadStream({ start, end, autoClose: true });
    streaming = true;
    stream.on('error', () => response.destroy());
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  } finally { if (!streaming) await handle.close(); }
}

export async function startEditorServer(options: ServerOptions = {}) {
  const rootDir = await realpath(options.rootDir ?? builderRoot);
  const jobs = options.jobs ?? new EditorJobs({ rootDir });
  const token = randomBytes(32).toString('hex');
  let workspace: EditorWorkspace | undefined;
  let workspaceId: string | null = null;
  if (options.dataDir?.trim()) {
    workspace = await EditorWorkspace.open(path.resolve(rootDir, options.dataDir), rootDir);
    workspaceId = randomBytes(16).toString('hex');
  }
  const reportLinks = new Map<string, { workspaceId: string; report: LinkedReport }>();
  let chartBundle: Promise<Uint8Array> | undefined;
  const caseChartBundle = () => chartBundle ??= build({
    absWorkingDir: rootDir, entryPoints: [path.join(rootDir, 'editor/case-charts.ts')],
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
    minify: true, sourcemap: false, legalComments: 'none', logLevel: 'silent',
  }).then((result) => result.outputFiles[0].contents).catch((error) => { chartBundle = undefined; throw error; });
  let port = 0;
  let writes = Promise.resolve();
  const busy = () => jobs.isBusy;
  const current = async () => ({ workspace: workspace ? await workspace.snapshot() : null, workspaceId, jobs: jobs.snapshot(), browseRoot: path.dirname(rootDir) });
  const select = async (directory: string, create = false) => {
    if (busy()) throw new HttpError(409, 'Wait for the running check or build before changing investigator folders.');
    if (create) await initializeSite(directory);
    const selected = await EditorWorkspace.open(path.resolve(rootDir, directory), rootDir);
    await jobs.stopPreview();
    workspace = selected;
    reportLinks.clear();
    workspaceId = randomBytes(16).toString('hex');
    return current();
  };

  const server = createServer(async (request, response) => {
    let releaseWrite: (() => void) | undefined;
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send = (status: number, value: unknown) => { response.statusCode = status; response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.end(JSON.stringify(value)); };
    try {
      const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!request.headers.host || !allowedHosts.includes(request.headers.host)) throw new HttpError(403, 'Open the editor using its local address.');
      if (request.headers.origin && !allowedHosts.some(host => request.headers.origin === `http://${host}`)) throw new HttpError(403, 'Requests must come from this local editor.');
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
      const reportMatch = /^\/api\/report-file\/([a-f0-9]{48})\/[^/]+$/.exec(url.pathname);
      if (reportMatch && ['GET', 'HEAD'].includes(request.method ?? '')) {
        const linked = reportLinks.get(reportMatch[1]);
        if (!linked || linked.workspaceId !== workspaceId) throw new HttpError(404, 'This report link expired. Open it again from the case editor.');
        await streamReport(request, response, linked.report); return;
      }
      if (url.pathname.startsWith('/api/')) {
        const supplied = request.headers['x-editor-token'];
        if (typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))) throw new HttpError(403, 'Reload the editor to start a local session.');
        if (request.method === 'POST') {
          const preceding = writes;
          writes = new Promise<void>(resolve => { releaseWrite = resolve; });
          await preceding;
        }
        if (url.pathname === '/api/state' && request.method === 'GET') { send(200, await current()); return; }
        if (url.pathname === '/api/icons' && request.method === 'GET') { send(200, { icons: contentIconCatalog() }); return; }
        if (url.pathname === '/api/folders' && request.method === 'GET') { send(200, await listFolders(path.resolve(rootDir, url.searchParams.get('path') || path.dirname(rootDir)))); return; }
        if (['/api/workspace', '/api/workspace/new'].includes(url.pathname) && request.method === 'POST') {
          const body = await jsonBody(request);
          send(200, await select(string(body.path, 'Investigator folder'), url.pathname.endsWith('/new'))); return;
        }
        if (!workspace) throw new HttpError(409, 'Open an investigator folder first.');
        if (request.headers['x-workspace-id'] !== workspaceId) throw new HttpError(409, 'The selected investigator changed. Reload before editing.');
        if (url.pathname === '/api/template' && request.method === 'GET') {
          const collection = string(url.searchParams.get('collection'), 'Collection');
          if (!Object.hasOwn(recordTemplates, collection) && !['profile', 'pages'].includes(collection)) throw new HttpError(400, 'Choose a supported content collection.');
          const template = Object.hasOwn(recordTemplates, collection)
            ? path.join(rootDir, 'templates/investigator-site/record-templates', `${recordTemplates[collection]}.md`)
            : path.join(rootDir, 'templates', `${collection}.md`);
          const source = await readFile(template, 'utf8');
          const fields = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
          if (!fields) throw new HttpError(400, 'The record template has no fields.');
          const data = parseDocument(fields).toJS();
          data.slug = ''; data.publication_status = 'draft';
          for (const key of ['title', 'name', 'description_short', 'headline', 'organization', 'role', 'issuer', 'institution', 'program', 'contribution']) if (key in data) data[key] = '';
          if (collection === 'pages') data.profile = (await workspace.snapshot()).records.find(record => record.collection === 'profile')?.id ?? 'investigator';
          send(200, { collection, data, body: '' }); return;
        }
        if (url.pathname === '/api/reports' && request.method === 'GET') {
          const record = await workspace.readRecord(string(url.searchParams.get('file'), 'Record'));
          if (record.collection !== 'cases') throw new HttpError(400, 'Source reports are linked to case records.');
          const reports = await listCaseReports(workspace.dataDir, record.id);
          if (reportLinks.size > 500) reportLinks.clear();
          send(200, { reports: reports.map(report => {
            let capability = [...reportLinks.entries()].find(([, entry]) => entry.workspaceId === workspaceId && entry.report.path === report.path)?.[0];
            if (!capability) { capability = randomBytes(24).toString('hex'); reportLinks.set(capability, { workspaceId: workspaceId!, report }); }
            return { label: report.label, format: report.format, path: report.path, url: `/api/report-file/${capability}/report.${report.format}` };
          }) }); return;
        }
        if (url.pathname === '/api/rename' && request.method === 'POST') {
          if (busy()) throw new HttpError(409, 'Wait for the running check or build before renaming a case file.');
          const body = await jsonBody(request);
          send(200, await workspace.renameCase({ file: string(body.file, 'Record'), newName: string(body.newName, 'Filename'), sourceHash: body.sourceHash as string | null, expectedDraftHash: body.expectedDraftHash as string | null })); return;
        }
        if (url.pathname === '/api/remove-case' && request.method === 'POST') {
          if (busy()) throw new HttpError(409, 'Wait for the running check or build before removing a case.');
          const body = await jsonBody(request);
          send(200, await workspace.removeCase({ file: string(body.file, 'Record'), sourceHash: body.sourceHash as string | null, expectedDraftHash: body.expectedDraftHash as string | null })); return;
        }
        if (url.pathname === '/api/restore-case' && request.method === 'POST') {
          if (busy()) throw new HttpError(409, 'Wait for the running check or build before restoring a case.');
          const body = await jsonBody(request);
          send(200, await workspace.restoreCase(string(body.id, 'Removed case'))); return;
        }
        if (url.pathname === '/api/record' && request.method === 'GET') { send(200, await workspace.readRecord(string(url.searchParams.get('file'), 'Record'))); return; }
        if (url.pathname === '/api/review' && request.method === 'GET') { send(200, await workspace.reviewDraft(string(url.searchParams.get('file'), 'Record'))); return; }
        if (url.pathname === '/api/assets' && request.method === 'GET') { send(200, await listAssets((await workspace.snapshot()).dataDir)); return; }
        if (url.pathname === '/api/asset' && request.method === 'GET') {
          const image = await readAssetPreview(workspace.dataDir, string(url.searchParams.get('file'), 'Image'));
          response.setHeader('Content-Type', image.mimeType);
          response.setHeader('Content-Length', String(image.bytes.length));
          response.end(image.bytes); return;
        }
        if (url.pathname === '/api/assets' && request.method === 'POST') {
          if (busy()) throw new HttpError(409, 'Wait for the running check or build before uploading images.');
          send(200, await saveAsset((await workspace.snapshot()).dataDir, await jsonBody(request))); return;
        }
        if (url.pathname === '/api/drafts' && request.method === 'POST') { send(200, await workspace.saveDraft(await jsonBody(request) as Parameters<EditorWorkspace['saveDraft']>[0])); return; }
        if (url.pathname === '/api/apply' && request.method === 'POST') {
          if (busy()) throw new HttpError(409, 'Wait for the running check or build before applying changes.');
          const body = await jsonBody(request);
          if (!['draft', 'published'].includes(String(body.publication_status))) throw new HttpError(400, 'Choose draft or published.');
          send(200, await workspace.applyDraft(string(body.file, 'Record'), body.publication_status as 'draft' | 'published', body.expectedDraftHash as string | null)); return;
        }
        if (url.pathname === '/api/discard' && request.method === 'POST') { const body = await jsonBody(request); await workspace.discardDraft(string(body.file, 'Record'), body.expectedDraftHash as string | null); send(200, { discarded: true }); return; }
        if (url.pathname === '/api/jobs' && request.method === 'GET') { send(200, jobs.snapshot()); return; }
        if (url.pathname === '/api/jobs' && request.method === 'POST') {
          const body = await jsonBody(request);
          if (!['check', 'preview', 'package'].includes(String(body.kind))) throw new HttpError(400, 'Choose check, preview, or package.');
          send(200, await jobs.start(body.kind as 'check' | 'preview' | 'package', (await workspace.snapshot()).dataDir, typeof body.destination === 'string' ? body.destination : undefined)); return;
        }
        if (url.pathname === '/api/jobs/stop' && request.method === 'POST') { await jobs.stopPreview(); send(200, jobs.snapshot()); return; }
        throw new HttpError(404, 'Editor action not found.');
      }
      if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
      if (url.pathname === '/') {
        const html = (await readFile(path.join(rootDir, 'editor/index.html'), 'utf8')).replace('</head>', `<script type="application/json" id="editor-config">${JSON.stringify({ token })}</script></head>`);
        response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); return;
      }
      if (url.pathname === '/case-charts.js') {
        const bundle = await caseChartBundle();
        response.setHeader('Content-Type', 'text/javascript; charset=utf-8'); response.end(bundle); return;
      }
      if (mime[url.pathname]) {
        response.setHeader('Content-Type', mime[url.pathname]); response.end(await readFile(path.join(rootDir, 'editor', url.pathname.slice(1)))); return;
      }
      if (url.pathname === '/favicon.ico') { response.statusCode = 204; response.end(); return; }
      throw new HttpError(404, 'Not found.');
    } catch (error) {
      let message = error instanceof Error ? error.message : 'The editor could not complete that action.';
      if (error && typeof error === 'object' && 'issues' in error && Array.isArray(error.issues) && error.issues.length) message += `\n${error.issues.join('\n')}`;
      const statusCode = error instanceof HttpError ? error.status : error instanceof EditorWorkspaceError ? (error.code === 'CONFLICT' ? 409 : error.code === 'NOT_FOUND' ? 404 : 400) : /already exists/i.test(message) ? 409 : 400;
      if (!response.headersSent) send(statusCode, { error: message }); else response.end();
    } finally { releaseWrite?.(); }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(options.port ?? 4310, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
  port = (server.address() as { port: number }).port;
  return {
    server, token, url: `http://127.0.0.1:${port}/`,
    async close() { await jobs.dispose(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const port = Number(process.env.EDITOR_PORT ?? 4310);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('EDITOR_PORT must be a valid local port.');
    const editor = await startEditorServer({ port, dataDir: process.env.SITE_DATA_DIR });
    console.log(`Investigator Website Builder: ${editor.url}`);
    console.log('Local editing only. Changes are not deployed automatically.');
    let closing = false;
    const close = () => {
      if (closing) return;
      closing = true;
      void editor.close().then(() => process.exit(0), () => process.exit(1));
    };
    for (const signal of (process.platform === 'win32' ? ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] : ['SIGINT', 'SIGTERM', 'SIGHUP']) as NodeJS.Signals[]) process.once(signal, close);
  } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
