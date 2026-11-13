import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { EditorJobs } from '../scripts/editor-jobs';

class FakeChild extends EventEmitter {
  pid = 34567;
  stdout = new PassThrough();
  stderr = new PassThrough();
}

async function fixture(t: { after: (fn: () => Promise<void>) => void }, extra = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'editor-jobs-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const rootDir = path.join(root, 'builder');
  await mkdir(rootDir);
  const folders = [path.join(root, 'person one'), path.join(root, 'person two')];
  for (const folder of folders) {
    await mkdir(path.join(folder, 'content'), { recursive: true });
    await writeFile(path.join(folder, 'site.json'), JSON.stringify({ version: 1, url: 'https://example.com' }));
  }
  const spawned: Array<{ command: string; args: string[]; options: SpawnOptions; child: FakeChild }> = [];
  const killed: NodeJS.Signals[] = [];
  const jobs = new EditorJobs({
    rootDir, env: { npm_execpath: '/npm/npm-cli.js', CONTENT_PREVIEW: 'drafts' }, port: 4323,
    spawn: (command, args, options) => {
      const child = new FakeChild();
      spawned.push({ command, args, options, child });
      queueMicrotask(() => child.emit('spawn'));
      return child as unknown as ChildProcess;
    },
    terminate: (child, signal) => { killed.push(signal); child.emit('close', null, signal); },
    ...extra,
  });
  t.after(() => jobs.dispose());
  return { jobs, folders, spawned, killed, root, rootDir };
}

test('preview waits for its exact loopback readiness marker and bounds logs', async (t) => {
  const f = await fixture(t, { logLimit: 80 });
  await f.jobs.start('preview', f.folders[0]);
  assert.equal(f.jobs.snapshot().preview?.status, 'starting');
  const child = f.spawned[0].child;
  child.stdout.write('SERVER_READY http://127.0.0.1:');
  assert.equal(f.jobs.snapshot().preview?.url, null);
  child.stdout.write('4323/\n');
  assert.equal(f.jobs.snapshot().preview?.status, 'running');
  assert.equal(f.jobs.snapshot().preview?.url, 'http://127.0.0.1:4323/');
  child.stderr.write('x'.repeat(120));
  assert.equal(f.jobs.snapshot().active?.logs.length, 80);
  const copy = f.jobs.snapshot();
  copy.active!.logs = 'changed';
  assert.notEqual(f.jobs.snapshot().active?.logs, 'changed');
  assert.equal(f.spawned[0].options.env?.SITE_DATA_DIR, f.folders[0]);
  assert.equal(f.spawned[0].options.env?.CONTENT_PREVIEW, 'drafts');
  assert.equal(f.spawned[0].options.shell, false);
});

test('switching selection stops owned preview; active validation blocks all new jobs', async (t) => {
  const f = await fixture(t);
  await f.jobs.start('preview', f.folders[0]);
  await f.jobs.start('check', f.folders[1]);
  assert.deepEqual(f.killed, ['SIGTERM']);
  assert.equal(f.jobs.snapshot().recent[0].status, 'stopped');
  assert.equal(f.jobs.snapshot().active?.dataDir, f.folders[1]);
  assert.equal(f.jobs.isBusy, true);
  assert.equal(f.spawned[1].options.env?.CONTENT_PREVIEW, undefined);
  await assert.rejects(f.jobs.start('preview', f.folders[0]), /already running/);
  f.spawned[1].child.emit('close', 0);
  assert.equal(f.jobs.isBusy, false);
  assert.equal(f.jobs.snapshot().recent[0].status, 'succeeded');
});

test('package uses argument arrays and refuses invalid destinations before stopping preview', async (t) => {
  const f = await fixture(t);
  await f.jobs.start('preview', f.folders[0]);
  await assert.rejects(f.jobs.start('package', f.folders[0], f.folders[0]), /outside/);
  await assert.rejects(f.jobs.start('package', f.folders[0], f.rootDir), /outside/);
  assert.equal(f.killed.length, 0);
  const destination = path.join(f.root, 'release; literal $(text)');
  await f.jobs.start('package', f.folders[0], destination);
  assert.equal(f.spawned[1].args.at(-1), destination);
  assert.equal(f.spawned[1].command, process.execPath);
  assert.equal(f.spawned[1].options.env?.CONTENT_PREVIEW, undefined);
  f.spawned[1].child.emit('close', 1);
  assert.equal(f.jobs.snapshot().recent[0].status, 'failed');
});

test('process launch errors remain observable and allow a later retry', async (t) => {
  const f = await fixture(t);
  await f.jobs.start('check', f.folders[0]);
  const child = f.spawned[0].child;
  (child as { pid?: number }).pid = undefined;
  child.emit('error', new Error('cannot start child'));
  assert.equal(f.jobs.snapshot().active, null);
  assert.equal(f.jobs.snapshot().recent[0].status, 'failed');
  assert.match(f.jobs.snapshot().recent[0].logs, /cannot start child/);
  await f.jobs.start('check', f.folders[0]);
});

test('dispose escalates owned termination and closes the manager', async (t) => {
  const signals: NodeJS.Signals[] = [];
  const f = await fixture(t, {
    stopTimeoutMs: 1,
    terminate: (child: ChildProcess, signal: NodeJS.Signals) => {
      signals.push(signal);
      if (signal === 'SIGKILL') child.emit('close', null, signal);
    },
  });
  await f.jobs.start('preview', f.folders[0]);
  await f.jobs.dispose();
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(f.jobs.snapshot().active, null);
  await assert.rejects(f.jobs.start('check', f.folders[0]), /closed/);
});

test('a preview crash is failed, not successful, even with exit code zero', async (t) => {
  const f = await fixture(t);
  await f.jobs.start('preview', f.folders[0]);
  f.spawned[0].child.emit('close', 0);
  assert.equal(f.jobs.snapshot().recent[0].status, 'failed');
  assert.equal(f.jobs.snapshot().preview, null);
});
