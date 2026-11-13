import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { resolveNpmCli } from '../scripts/npm-runtime.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'npm-runtime-'));
  const nodePath = path.join(root, 'Program Files', 'nodejs', 'node.exe');
  return { root, nodePath, cleanup: () => rm(root, { recursive: true, force: true }) };
}

async function cli(filename: string, source = '// npm JavaScript fixture\n') {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, source);
  return realpath(filename);
}

test('npm_execpath is preferred over a Windows installation next to Node, including paths with spaces', async () => {
  const f = await fixture();
  try {
    await cli(path.join(path.dirname(f.nodePath), 'node_modules/npm/bin/npm-cli.js'));
    const preferred = await cli(path.join(f.root, 'Preferred npm', 'npm-cli.js'));
    assert.equal(await resolveNpmCli({ env: { npm_execpath: preferred, PATH: '' }, nodePath: f.nodePath }), preferred);
  } finally { await f.cleanup(); }
});

test('Windows node_modules/npm layout resolves without trying to execute npm.cmd', async () => {
  const f = await fixture();
  try {
    const installed = await cli(path.join(path.dirname(f.nodePath), 'node_modules/npm/bin/npm-cli.js'));
    const commandFile = path.join(f.root, 'npm.cmd');
    await writeFile(commandFile, '@echo This command must never execute\r\n');
    assert.equal(await resolveNpmCli({ env: { npm_execpath: commandFile, Path: '' }, nodePath: f.nodePath }), installed);
  } finally { await f.cleanup(); }
});

test('Unix prefix/lib/node_modules installation resolves from prefix/bin/node', async () => {
  const f = await fixture();
  try {
    const prefix = path.join(f.root, 'Unix Node');
    const installed = await cli(path.join(prefix, 'lib/node_modules/npm/bin/npm-cli.js'));
    assert.equal(await resolveNpmCli({ env: { PATH: '' }, nodePath: path.join(prefix, 'bin/node') }), installed);
  } finally { await f.cleanup(); }
});

test('PATH lookup supports quoted directories with spaces and Windows environment-key casing', async () => {
  const f = await fixture();
  try {
    const directory = path.join(f.root, 'Another Node Installation');
    const installed = await cli(path.join(directory, 'node_modules/npm/bin/npm-cli.js'));
    assert.equal(await resolveNpmCli({ env: { Path: `"${directory}"` }, nodePath: f.nodePath }), installed);
  } finally { await f.cleanup(); }
});

test('missing npm, command wrappers, and directories produce an actionable error', async () => {
  const f = await fixture();
  try {
    const commandFile = path.join(f.root, 'npm.cmd');
    await writeFile(commandFile, '@echo off\r\n');
    const directory = path.join(f.root, 'npm-cli.js');
    await mkdir(directory);
    for (const preferred of [undefined, commandFile, directory]) {
      await assert.rejects(resolveNpmCli({ env: { npm_execpath: preferred, PATH: '' }, nodePath: f.nodePath }),
        /Could not find npm.*JavaScript CLI.*Install Node\.js 24 with npm.*npm_execpath/);
    }
  } finally { await f.cleanup(); }
});

test('dependency preparation runs the JavaScript CLI with development dependencies even in production mode', async () => {
  const f = await fixture();
  try {
    const scripts = path.join(f.root, 'scripts');
    await mkdir(scripts);
    for (const filename of ['ensure-dependencies.mjs', 'npm-runtime.mjs']) {
      await copyFile(new URL(`../scripts/${filename}`, import.meta.url), path.join(scripts, filename));
    }
    await writeFile(path.join(f.root, 'package.json'), '{"type":"module","dependencies":{},"devDependencies":{}}');
    await writeFile(path.join(f.root, 'package-lock.json'), '{}');
    const fake = await cli(path.join(f.root, 'Fake npm with spaces', 'npm-cli.js'), `
import { appendFileSync, mkdirSync } from 'node:fs';
mkdirSync('node_modules', { recursive: true });
appendFileSync('installer-arguments.jsonl', JSON.stringify(process.argv.slice(2)) + '\\n');
`);
    const env = { ...process.env, npm_execpath: fake, NODE_ENV: 'production' };
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = spawnSync(process.execPath, [path.join(scripts, 'ensure-dependencies.mjs')], { cwd: f.root, env, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    }
    assert.deepEqual(JSON.parse((await readFile(path.join(f.root, 'installer-arguments.jsonl'), 'utf8')).trim()), ['ci', '--include=dev']);
    assert.match(await readFile(path.join(f.root, 'node_modules/.site-dependencies'), 'utf8'), /^[a-f0-9]{64}$/);
  } finally { await f.cleanup(); }
});
