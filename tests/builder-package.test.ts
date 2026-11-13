import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { test } from 'node:test';
import { builderFiles, packageBuilder } from '../scripts/package-builder.mjs';
import { launcherOptions, localBrowserCommand, openLocalBrowser } from '../scripts/start-builder.mjs';

function unzip(bytes: Buffer) {
  const files = new Map<string, Buffer>();
  for (let offset = 0; bytes.readUInt32LE(offset) === 0x04034b50;) {
    const method = bytes.readUInt16LE(offset + 8), size = bytes.readUInt32LE(offset + 18);
    const length = bytes.readUInt16LE(offset + 26), extra = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + length).toString('utf8');
    const start = offset + 30 + length + extra;
    assert.equal(method, 8);
    files.set(name, inflateRawSync(bytes.subarray(start, start + size)));
    offset = start + size;
  }
  return files;
}

async function fixture() {
  const parent = await mkdtemp(path.join(tmpdir(), 'builder package with spaces '));
  const root = path.join(parent, 'source'); await mkdir(root);
  for (const file of ['Start Builder.cmd', 'START-HERE.txt', 'package.json', 'package-lock.json', 'astro.config.mjs', 'tsconfig.json', 'README.md', '.node-version', '.editorconfig', '.gitignore']) {
    await writeFile(path.join(root, file), file === 'package.json' ? '{"name":"investigator-website-builder","version":"1.0.0"}' : 'example\n');
  }
  for (const directory of ['src', 'scripts', 'editor', 'integrations', 'templates/investigator-site/content/profile', 'docs', 'licenses', 'examples/site-data/content/profile']) await mkdir(path.join(root, directory), { recursive: true });
  await writeFile(path.join(root, 'src/app.ts'), 'export const shared = true;');
  await writeFile(path.join(root, 'templates/investigator-site/content/profile/investigator.md'), 'Blank profile.');
  await writeFile(path.join(root, 'examples/site-data/content/profile/example.md'), 'Fictional example.');
  return { parent, root, zip: path.join(parent, 'builder.zip') };
}

test('builder ZIP is deterministic, portable, complete and excludes private or generated folders', async t => {
  const f = await fixture(); t.after(() => rm(f.parent, { recursive: true, force: true }));
  for (const file of ['.git/config', 'node_modules/native.node', 'dist/index.html', 'content/cases/private.md',
    'examples/site-data/.website-editor/backups/private.json', 'templates/investigator-site/.website-editor/drafts/private.json', 'docs/.env', 'docs/source-report.pdf']) {
    await mkdir(path.dirname(path.join(f.root, file)), { recursive: true }); await writeFile(path.join(f.root, file), 'PRIVATE_SENTINEL');
  }
  const result = await packageBuilder(f.zip, { rootDir: f.root });
  const files = unzip(await readFile(f.zip));
  const prefix = 'investigator-website-builder/';
  assert.ok(files.has(`${prefix}Start Builder.cmd`));
  assert.ok(files.has(`${prefix}templates/investigator-site/content/profile/investigator.md`));
  assert.ok(files.has(`${prefix}examples/site-data/content/profile/example.md`));
  assert.ok([...files.keys()].every(name => name.startsWith(prefix) && !name.includes('\\')));
  assert.ok([...files.values()].every(data => !data.includes('PRIVATE_SENTINEL')));
  assert.equal(files.get(`${prefix}Start Builder.cmd`)!.toString(), 'example\r\n');
  const manifest = JSON.parse(files.get(`${prefix}DISTRIBUTION.json`)!.toString());
  assert.equal(manifest.version, '1.0.0'); assert.equal(manifest.node_major, 24);
  assert.equal(manifest.files.length + 1, result.files);
  const second = path.join(f.parent, 'second.zip'); await packageBuilder(second, { rootDir: f.root });
  assert.deepEqual(await readFile(second), await readFile(f.zip));
});

test('builder packaging refuses overwrites, source destinations, links and conflicting Windows names', async t => {
  const f = await fixture(); t.after(() => rm(f.parent, { recursive: true, force: true }));
  await writeFile(f.zip, 'keep');
  await assert.rejects(packageBuilder(f.zip, { rootDir: f.root }), { code: 'EEXIST' });
  assert.equal(await readFile(f.zip, 'utf8'), 'keep');
  await assert.rejects(packageBuilder(path.join(f.root, 'inside.zip'), { rootDir: f.root }), /outside the source/);
  await assert.rejects(packageBuilder(path.join(f.parent, 'builder.exe'), { rootDir: f.root }), /ending in .zip/);
  if (process.platform !== 'win32') {
    await writeFile(path.join(f.root, 'docs/CON.md'), 'reserved');
    await assert.rejects(builderFiles(f.root), /cannot be extracted on Windows/);
    await rm(path.join(f.root, 'docs/CON.md'));
  }
  const target = path.join(f.parent, 'external'); await mkdir(target);
  await symlink(target, path.join(f.root, 'docs/linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(builderFiles(f.root), /symbolic links/);
});

test('launcher accepts explicit content paths and rejects unknown options and nonlocal browser targets', () => {
  assert.deepEqual(launcherOptions(['--no-open', '--data-dir', 'C:\\My Websites\\Alex content'], {}), { open: false, dataDir: 'C:\\My Websites\\Alex content' });
  assert.deepEqual(launcherOptions([], { SITE_DATA_DIR: 'chosen content' }), { open: true, dataDir: 'chosen content' });
  assert.throws(() => launcherOptions(['--data-dir'], {}), /Usage:/);
  assert.throws(() => launcherOptions(['--something-else'], {}), /Usage:/);
  for (const url of ['https://example.com', 'http://localhost:4310/', 'http://127.0.0.1:4310/?cmd=unwanted', 'http://127.0.0.1:4310/other']) assert.throws(() => openLocalBrowser(url), /Only the local/);
});

test('Windows browser opening keeps cmd quoting intact and never uses a supplied URL as a command', () => {
  const plan = localBrowserCommand('http://127.0.0.1:4310/', 'win32', { ComSpec: 'C:\\Windows\\System32\\cmd.exe' });
  assert.deepEqual(plan, {
    command: 'C:\\Windows\\System32\\cmd.exe', args: ['/d', '/s', '/c', '"start "" "http://127.0.0.1:4310/""'], windowsVerbatimArguments: true,
  });
  if (process.platform === 'win32') {
    // Let the actual Windows shell parse the same quoting, without opening a browser in CI.
    const result = spawnSync(process.env.ComSpec || 'cmd.exe', [...plan.args.slice(0, -1), plan.args.at(-1)!.replace('start "" ', 'echo ')], {
      windowsVerbatimArguments: plan.windowsVerbatimArguments, encoding: 'utf8', windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), '"http://127.0.0.1:4310/"');
  }
  assert.throws(() => localBrowserCommand('http://bad@127.0.0.1:4310/', 'win32'), /Only the local/);
});
