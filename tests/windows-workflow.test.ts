import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dependencyFingerprint } from '../scripts/ensure-dependencies.mjs';
import { initializeSite } from '../scripts/init-site';
import { resolveNpmCli } from '../scripts/npm-runtime.mjs';
import { resolveSiteData } from '../scripts/site-data';

const root = fileURLToPath(new URL('../', import.meta.url));

async function availablePort(): Promise<number> {
  const socket = createServer();
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  return port;
}

function portOpen(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let finished = false;
    const finish = (open: boolean) => {
      if (finished) return;
      finished = true; socket.destroy(); resolve(open);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(1000, () => finish(false));
  });
}

async function waitFor<T>(read: () => Promise<T>, accept: (value: T) => boolean, label: string, timeout = 30_000): Promise<T> {
  const until = Date.now() + timeout;
  let last: T | undefined;
  do {
    last = await read();
    if (accept(last)) return last;
    await delay(100);
  } while (Date.now() < until);
  throw new Error(`Timed out waiting for ${label}. Last value: ${JSON.stringify(last)}`);
}

function forceOwnedProcess(pid: number) {
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 10_000 });
  } else {
    try { process.kill(-pid, 'SIGKILL'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  }
}

test('the real local launcher edits, previews, checks and packages a content pack with spaces, then shuts down cleanly', { timeout: 300_000 }, async t => {
  // Never let a smoke test repair/install the checkout's real dependencies.
  // CI and isolated verification copies must prepare the current locked tree first.
  const [manifest, lockfile, installed] = await Promise.all([
    readFile(path.join(root, 'package.json'), 'utf8'), readFile(path.join(root, 'package-lock.json'), 'utf8'),
    readFile(path.join(root, 'node_modules/.site-dependencies'), 'utf8').catch(() => ''),
  ]);
  assert.equal(installed, dependencyFingerprint(manifest, lockfile),
    'Prepare this isolated checkout’s dependencies before running the workflow test; it must not trigger an installation.');

  const parent = await mkdtemp(path.join(tmpdir(), 'builder Windows workflow '));
  const dataDir = path.join(parent, 'Investigator Content With Spaces');
  let child: ChildProcess | undefined;
  let previewPid: number | null = null;
  let editorUrl = '';
  let workspaceId = '';
  let token = '';
  let logs = '';
  let exited = false;
  let exitCode: number | null = null;
  let spawnError: Error | undefined;
  const previewPort = await availablePort();
  let cacheKey: string | undefined;

  async function api(route: string, body?: object) {
    const response = await fetch(new URL(route, editorUrl), {
      method: body === undefined ? 'GET' : 'POST', signal: AbortSignal.timeout(10_000),
      headers: { 'X-Editor-Token': token, 'X-Workspace-Id': workspaceId,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json = await response.json();
    assert.equal(response.status, 200, `${route}: ${JSON.stringify(json)}\n${logs}`);
    return json;
  }

  t.after(async () => {
    if (!exited && editorUrl && token) await api('/api/jobs/stop', {}).catch(() => {});
    if (previewPid && await portOpen(previewPort)) forceOwnedProcess(previewPid);
    if (child?.pid && !exited) forceOwnedProcess(child.pid);
    if (child && !exited) await waitFor(async () => exited, Boolean, 'owned launcher cleanup', 10_000).catch(() => {});
    if (cacheKey) await rm(path.join(root, '.astro/sites', cacheKey), { recursive: true, force: true });
    await rm(parent, { recursive: true, force: true });
  });

  await initializeSite(dataDir);
  cacheKey = resolveSiteData(dataDir, root, {}).cacheKey;
  const npmCli = await resolveNpmCli();
  const args: string[] = [];
  if (process.platform === 'win32') {
    // Windows child.kill('SIGINT') terminates a process rather than delivering
    // its console event. Exercise the launcher's installed handler through IPC;
    // the actual launcher CLI and all managed jobs still run as real children.
    const signalBridge = path.join(parent, 'console signal bridge.cjs');
    await writeFile(signalBridge, `process.once('message', message => {
  if (message !== 'workflow-test-sigint') return;
  process.emit('SIGINT', 'SIGINT');
  process.disconnect();
});\n`);
    args.push('--require', signalBridge);
  }
  args.push(path.join(root, 'scripts/start-builder.mjs'), '--no-open');
  const env: NodeJS.ProcessEnv = { ...process.env, npm_execpath: npmCli, SITE_DATA_DIR: dataDir,
    EDITOR_PORT: '0', SITE_EDITOR_PREVIEW_PORT: String(previewPort) };
  delete env.CONTENT_PREVIEW;
  delete env.TAILSCALE_HOSTNAME;
  child = spawn(process.execPath, args, {
    cwd: root, env, shell: false, detached: process.platform !== 'win32', windowsHide: true,
    stdio: process.platform === 'win32' ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'],
  });
  const capture = (chunk: Buffer | string) => { logs = (logs + String(chunk)).slice(-64 * 1024); };
  child.stdout?.on('data', capture); child.stderr?.on('data', capture);
  child.once('error', error => { spawnError = error; });
  child.once('close', code => { exitCode = code; exited = true; });
  editorUrl = await waitFor(async () => {
    if (spawnError) throw spawnError;
    assert.equal(exited, false, `Launcher exited before readiness (${exitCode}).\n${logs}`);
    return logs.match(/Investigator Website Builder: (http:\/\/127\.0\.0\.1:\d+\/)/)?.[1] ?? '';
  }, Boolean, 'the real launcher address');
  const editorPort = Number(new URL(editorUrl).port);
  const home = await fetch(editorUrl, { signal: AbortSignal.timeout(10_000) });
  assert.equal(home.status, 200);
  const config = (await home.text()).match(/<script[^>]*id="editor-config"[^>]*>([^<]+)<\/script>/)?.[1];
  assert.ok(config, 'The launched editor provides its session configuration');
  token = JSON.parse(config).token;
  const state = await api('/api/state');
  workspaceId = state.workspaceId;
  assert.equal(state.workspace.dataDir, await realpath(dataDir));

  const file = 'content/profile/investigator.md';
  const original = await api('/api/record?file=' + encodeURIComponent(file));
  const name = `Workflow Reviewer ${process.pid}`;
  const draft = await api('/api/drafts', {
    file, data: { ...original.data, name }, body: original.body,
    sourceHash: original.sourceHash, expectedDraftHash: original.draftHash,
  });
  assert.equal(draft.canApply, true, JSON.stringify(draft.issues));
  assert.doesNotMatch(await readFile(path.join(dataDir, file), 'utf8'), new RegExp(name));
  const review = await api('/api/review?file=' + encodeURIComponent(file));
  assert.equal(review.draft.data.name, name);
  await api('/api/apply', { file, publication_status: 'draft', expectedDraftHash: review.draftHash });
  assert.match(await readFile(path.join(dataDir, file), 'utf8'), new RegExp(name));

  async function startPreview() {
    await api('/api/jobs', { kind: 'preview' });
    const jobs = await waitFor(() => api('/api/jobs'), jobs => {
      const failure = jobs.recent.find((job: { kind: string; status: string }) => job.kind === 'preview' && job.status === 'failed');
      assert.equal(Boolean(failure), false, failure?.logs);
      return jobs.preview?.status === 'running';
    }, 'managed preview readiness', 60_000);
    previewPid = jobs.preview.pid;
    assert.equal(jobs.preview.url, `http://127.0.0.1:${previewPort}/`);
    assert.ok(previewPid, 'The real preview has an owned child process');
    const response = await fetch(jobs.preview.url, { signal: AbortSignal.timeout(30_000) });
    assert.equal(response.status, 200);
    assert.match(await response.text(), new RegExp(name));
  }
  await startPreview();
  await api('/api/jobs', { kind: 'check' });
  await waitFor(async () => !(await portOpen(previewPort)), Boolean, 'the preview stopping before content validation');
  previewPid = null;
  await waitFor(() => api('/api/jobs'), jobs => {
    const check = jobs.recent.find((job: { kind: string }) => job.kind === 'check');
    if (!check) return false;
    assert.equal(check.status, 'succeeded', check.logs);
    assert.equal(check.exitCode, 0);
    return true;
  }, 'the real content check', 30_000);

  // Publish only this disposable blank pack, through the same review API as
  // the editor. Referenced records must be ready before their pages.
  const publicationOrder: Record<string, number> = { profile: 0, contacts: 1, charts: 2, pages: 3 };
  const appliedState = await api('/api/state');
  const records = [...appliedState.workspace.records].sort((a, b) =>
    (publicationOrder[a.collection] ?? 0) - (publicationOrder[b.collection] ?? 0)
      || a.file.localeCompare(b.file));
  assert.equal(records.length, 11, 'The workflow fixture is the blank pack, without personal content');
  for (const record of records) {
    const current = await api('/api/record?file=' + encodeURIComponent(record.file));
    const reviewed = await api('/api/drafts', {
      file: record.file, data: { ...current.data, publication_status: 'published' }, body: current.body,
      sourceHash: current.sourceHash, expectedDraftHash: current.draftHash,
    });
    assert.equal(reviewed.canApply, true, `${record.file}: ${JSON.stringify(reviewed.issues)}`);
    await api('/api/apply', { file: record.file, publication_status: 'published', expectedDraftHash: reviewed.draftHash });
  }
  const releaseDir = path.join(parent, 'Release Output With Spaces');
  const packaging = await api('/api/jobs', { kind: 'package', destination: releaseDir });
  assert.equal(packaging.active?.kind, 'package');
  const packageId = packaging.active.id;
  const completedPackaging = await waitFor(() => api('/api/jobs'), jobs => {
    const release = jobs.recent.find((job: { id: string }) => job.id === packageId);
    if (!release) return false;
    assert.equal(release.status, 'succeeded', release.logs);
    assert.equal(release.exitCode, 0);
    return true;
  }, 'the real production package using Node and npm_execpath', 120_000);
  assert.equal(await realpath(completedPackaging.recent.find((job: { id: string }) => job.id === packageId).destination), await realpath(releaseDir));
  const productionHome = await readFile(path.join(releaseDir, 'index.html'), 'utf8');
  assert.match(productionHome, new RegExp(name));
  assert.doesNotMatch(productionHome, /Development preview · Draft content included/);
  assert.match(productionHome, /<meta\s+name="robots"\s+content="index, follow"/);
  assert.match(productionHome, /rel="sitemap"[^>]+sitemap-index\.xml/);
  const identity = productionHome.match(/<script[^>]*type="application\/ld\+json"[^>]*>([^<]+)<\/script>/)?.[1];
  assert.ok(identity, 'Published home retains public Person metadata');
  assert.equal(JSON.parse(identity).name, name);
  assert.equal(JSON.parse(identity)['@type'], 'Person');
  assert.equal(JSON.parse(identity).address, undefined);
  const robots = await readFile(path.join(releaseDir, 'robots.txt'), 'utf8');
  assert.match(robots, /Sitemap: https:\/\/example\.com\/sitemap-index\.xml/);
  const sitemap = await readFile(path.join(releaseDir, 'sitemap-0.xml'), 'utf8');
  assert.doesNotMatch(sitemap, /<loc>[^<]*\/404(?:\/|\.html)<\/loc>/);
  const notFound = await readFile(path.join(releaseDir, '404.html'), 'utf8');
  assert.match(notFound, /<meta\s+name="robots"\s+content="noindex, nofollow"/);

  await startPreview();
  if (process.platform === 'win32') child.send!('workflow-test-sigint');
  else assert.equal(child.kill('SIGINT'), true);
  await waitFor(async () => exited, Boolean, 'launcher signal shutdown', 15_000);
  assert.equal(exitCode, 0, logs);
  await waitFor(async () => !(await portOpen(previewPort)), Boolean, 'owned preview port closing');
  previewPid = null;
  assert.equal(await portOpen(editorPort), false, 'The editor port closes with its owned preview');
});
