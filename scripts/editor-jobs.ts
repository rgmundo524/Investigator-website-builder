import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { resolveSiteData } from './site-data';

export type EditorJobKind = 'check' | 'preview' | 'package';
export type EditorJobStatus = 'starting' | 'running' | 'succeeded' | 'failed' | 'stopped';
export type EditorJob = {
  id: string;
  kind: EditorJobKind;
  dataDir: string;
  destination: string | null;
  status: EditorJobStatus;
  startedAt: string;
  finishedAt: string | null;
  pid: number | null;
  exitCode: number | null;
  logs: string;
  url: string | null;
};
export type EditorJobsSnapshot = { active: EditorJob | null; preview: EditorJob | null; recent: EditorJob[] };
type JobSpawn = (command: string, args: string[], options: SpawnOptions) => ChildProcess;
export type EditorJobsOptions = {
  rootDir: string;
  env?: NodeJS.ProcessEnv;
  port?: number;
  logLimit?: number;
  stopTimeoutMs?: number;
  spawn?: JobSpawn;
  terminate?: (child: ChildProcess, signal: NodeJS.Signals) => void;
  now?: () => Date;
};
type OwnedJob = {
  record: EditorJob;
  child: ChildProcess;
  stopping: boolean;
  finished: boolean;
  closed: Promise<void>;
  resolveClosed: () => void;
  readyText: string;
};

function within(parent: string, target: string) {
  const relative = path.relative(parent, target);
  return !relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function terminateOwned(child: ChildProcess, signal: NodeJS.Signals) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    const killer = nodeSpawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
    killer.once('error', () => child.kill(signal));
    return;
  }
  try { process.kill(-child.pid, signal); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
}

/** Owns only this editor's children. No shell commands, deployment or unrelated process termination. */
export class EditorJobs {
  private readonly options: EditorJobsOptions;
  private readonly env: NodeJS.ProcessEnv;
  private readonly port: number;
  private readonly logLimit: number;
  private active: OwnedJob | null = null;
  private recent: EditorJob[] = [];
  private transitioning = false;
  private disposed = false;

  constructor(options: EditorJobsOptions) {
    this.options = options;
    this.env = { ...(options.env ?? process.env) };
    this.port = options.port ?? Number(this.env.SITE_EDITOR_PREVIEW_PORT ?? 4323);
    this.logLimit = options.logLimit ?? 64 * 1024;
    if (!Number.isInteger(this.port) || this.port < 1024 || this.port > 65535) throw new Error('Invalid preview port.');
    if (!Number.isInteger(this.logLimit) || this.logLimit < 64 || this.logLimit > 1024 * 1024) throw new Error('Invalid log limit.');
  }

  get isBusy() { return this.transitioning || Boolean(this.active && this.active.record.kind !== 'preview'); }

  snapshot(): EditorJobsSnapshot {
    const active = this.active ? { ...this.active.record } : null;
    return { active, preview: active?.kind === 'preview' ? { ...active } : null, recent: this.recent.map((job) => ({ ...job })) };
  }

  async start(kind: EditorJobKind, dataDir: string, destination?: string): Promise<EditorJobsSnapshot> {
    if (this.disposed) throw new Error('The editor job manager is closed.');
    if (!['check', 'preview', 'package'].includes(kind)) throw new Error('Unknown editor job.');
    if (this.isBusy) throw new Error('A check or package job is already running. Wait for it to finish.');
    this.transitioning = true;
    try {
      if (!dataDir?.trim()) throw new Error('Select an investigator content folder first.');
      const root = await realpath(this.options.rootDir);
      const selected = resolveSiteData(dataDir, root, this.env).dataDir;
      let target: string | null = null;
      if (kind === 'package') {
        if (!destination?.trim()) throw new Error('Choose a new output folder for the production package.');
        const requested = path.resolve(root, destination);
        target = path.join(await realpath(path.dirname(requested)), path.basename(requested));
        if (within(root, target) || within(selected, target)) throw new Error('Package output must be outside the builder and selected content folder.');
        try { await lstat(target); throw new Error('Package output already exists. Choose a new folder.'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        if (!this.env.npm_execpath) throw new Error('Start the editor with npm run editor before creating a package.');
      }
      if (this.active?.record.kind === 'preview') {
        if (kind === 'preview' && this.active.record.dataDir === selected) return this.snapshot();
        await this.stopOwned(this.active);
      }
      if (this.disposed) throw new Error('The editor job manager is closed.');
      const env: NodeJS.ProcessEnv = { ...this.env, SITE_DATA_DIR: selected };
      delete env.CONTENT_PREVIEW;
      delete env.TAILSCALE_HOSTNAME;
      let args: string[];
      if (kind === 'preview') {
        env.CONTENT_PREVIEW = 'drafts';
        env.SITE_EDITOR_PREVIEW_PORT = String(this.port);
        args = ['--import', 'tsx', path.join(root, 'scripts/editor-preview.ts')];
      } else {
        args = ['--import', 'tsx', path.join(root, kind === 'check' ? 'scripts/check-content.ts' : 'scripts/package-site.ts')];
        if (target) args.push(target);
      }
      const record: EditorJob = {
        id: randomUUID(), kind, dataDir: selected, destination: target,
        status: 'starting', startedAt: this.time(), finishedAt: null,
        pid: null, exitCode: null, logs: '', url: null,
      };
      const child = (this.options.spawn ?? nodeSpawn)(process.execPath, args, {
        cwd: root, env, shell: false, detached: process.platform !== 'win32', windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let resolveClosed = () => {};
      const closed = new Promise<void>((resolve) => { resolveClosed = resolve; });
      const owned: OwnedJob = { record, child, closed, resolveClosed, stopping: false, finished: false, readyText: '' };
      this.active = owned;
      record.pid = child.pid ?? null;
      child.once('spawn', () => { if (kind !== 'preview' && !owned.finished) record.status = 'running'; });
      child.stdout?.on('data', (chunk: Buffer | string) => this.capture(owned, String(chunk), true));
      child.stderr?.on('data', (chunk: Buffer | string) => this.capture(owned, String(chunk), false));
      child.once('error', (error) => {
        this.capture(owned, `${error.message}\n`, false);
        if (!child.pid) this.finish(owned, null, true);
      });
      child.once('close', (code) => this.finish(owned, code, kind === 'preview'));
      return this.snapshot();
    } finally { this.transitioning = false; }
  }

  async stopPreview() {
    if (this.transitioning) throw new Error('A job transition is in progress.');
    this.transitioning = true;
    try { if (this.active?.record.kind === 'preview') await this.stopOwned(this.active); }
    finally { this.transitioning = false; }
    return this.snapshot();
  }

  async dispose() {
    this.disposed = true;
    if (this.active) await this.stopOwned(this.active);
  }

  private time() { return (this.options.now?.() ?? new Date()).toISOString(); }

  private capture(job: OwnedJob, text: string, stdout: boolean) {
    if (job.finished) return;
    job.record.logs = (job.record.logs + text).slice(-this.logLimit);
    if (stdout && job.record.kind === 'preview') {
      job.readyText = (job.readyText + text).slice(-4096);
      const url = `http://127.0.0.1:${this.port}/`;
      if (job.readyText.split(/\r?\n/).includes(`SERVER_READY ${url}`)) {
        job.record.status = 'running';
        job.record.url = url;
      }
    }
  }

  private finish(job: OwnedJob, code: number | null, failed = false) {
    if (job.finished) return;
    job.finished = true;
    job.record.exitCode = code;
    job.record.finishedAt = this.time();
    job.record.status = job.stopping ? 'stopped' : failed || code !== 0 ? 'failed' : 'succeeded';
    job.record.url = null;
    this.recent.unshift({ ...job.record });
    this.recent = this.recent.slice(0, 12);
    if (this.active === job) this.active = null;
    job.resolveClosed();
  }

  private async stopOwned(job: OwnedJob) {
    if (job.finished) return;
    job.stopping = true;
    const terminate = this.options.terminate ?? terminateOwned;
    terminate(job.child, 'SIGTERM');
    if (await this.waitClosed(job)) return;
    terminate(job.child, 'SIGKILL');
    if (!await this.waitClosed(job)) throw new Error('The owned job did not stop; a new job cannot start safely.');
  }

  private async waitClosed(job: OwnedJob) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        job.closed.then(() => true),
        new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), this.options.stopTimeoutMs ?? 2000); }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  }
}
