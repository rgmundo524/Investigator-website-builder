import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { resolveNpmCli } from './npm-runtime.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const marker = path.join(root, 'node_modules', '.site-dependencies');

export function dependencyFingerprint(manifest, lockfile, runtime = process.version) {
  const pkg = JSON.parse(manifest);
  return createHash('sha256').update(JSON.stringify({
    dependencies: pkg.dependencies, devDependencies: pkg.devDependencies,
    optionalDependencies: pkg.optionalDependencies, engines: pkg.engines,
    runtime, platform: process.platform, architecture: process.arch,
  })).update(lockfile).digest('hex');
}

async function ensureDependencies() {
  // npm ci can clear a symlink's target before replacing the link. Never let
  // an isolated checkout install into another checkout's dependency directory.
  try {
    if ((await lstat(path.join(root, 'node_modules'))).isSymbolicLink()) {
      throw new Error('Refusing a symlinked node_modules directory. Give this checkout its own dependencies before running the build helper.');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const [manifest, lockfile] = await Promise.all([
    readFile(path.join(root, 'package.json'), 'utf8'), readFile(path.join(root, 'package-lock.json'), 'utf8'),
  ]);
  const fingerprint = dependencyFingerprint(manifest, lockfile);
  if (process.argv.includes('--record')) {
    await mkdir(path.dirname(marker), { recursive: true });
    await writeFile(marker, fingerprint);
    return;
  }
  const installed = await readFile(marker, 'utf8').catch(() => '');
  if (installed === fingerprint) return;
  console.log('Installing the locked project dependencies for this checkout…');
  const npm = await resolveNpmCli();
  // Invoke the JavaScript CLI directly: Windows npm.cmd needs a shell.
  // The local editor also needs the packages listed as development dependencies.
  const result = spawnSync(process.execPath, [npm, 'ci', '--include=dev'], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  await writeFile(marker, fingerprint);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await ensureDependencies();
}
