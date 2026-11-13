import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeZip } from './zip.mjs';

const builderRoot = fileURLToPath(new URL('../', import.meta.url));
const rootFiles = ['Start Builder.cmd', 'START-HERE.txt', 'package.json', 'package-lock.json', 'astro.config.mjs', 'tsconfig.json', 'README.md', '.node-version', '.editorconfig', '.gitignore'];
const directories = ['src', 'scripts', 'editor', 'integrations', 'templates', 'docs', 'licenses', 'examples/site-data'];
const excluded = new Set(['.git', 'node_modules', '.astro', '.devenv', '.direnv', '.website-editor', '.site-data', 'dist', 'dist-drafts', '.DS_Store']);
const within = (parent, child) => { const rel = path.relative(parent, child); return !rel || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)); };

function shareable(name) {
  return !excluded.has(name) && !/^\.env(?:\.|$)/i.test(name) && !/\.(?:log|zip|pdf|docx?|xlsx?|csv|bak|tmp)$/i.test(name);
}

export async function builderFiles(root = builderRoot) {
  const files = [];
  async function visit(relative, required = true) {
    if (relative.split(path.sep).some(part => !shareable(part))) return;
    const full = path.join(root, relative);
    let info;
    try { info = await lstat(full); }
    catch (error) { if (!required && error.code === 'ENOENT') return; throw error; }
    if (info.isSymbolicLink()) throw new Error(`Shared builder files cannot be symbolic links: ${relative}`);
    if (info.isDirectory()) {
      for (const name of (await readdir(full)).sort()) await visit(path.join(relative, name));
    } else if (info.isFile()) {
      const portable = relative.split(path.sep).join('/');
      if (portable.split('/').some(part => /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error(`Filename cannot be extracted on Windows: ${portable}`);
      files.push(portable);
    } else throw new Error(`Unexpected builder entry: ${relative}`);
  }
  for (const file of rootFiles) await visit(file);
  for (const directory of directories) await visit(directory, directory !== 'examples/site-data');
  return files.sort();
}

export async function packageBuilder(destination, options = {}) {
  const root = await realpath(options.rootDir ?? builderRoot);
  if (path.extname(destination).toLowerCase() !== '.zip') throw new Error('Choose a new filename ending in .zip.');
  const requested = path.resolve(root, destination);
  const target = path.join(await realpath(path.dirname(requested)), path.basename(requested));
  if (within(root, target)) throw new Error('Create the builder ZIP outside the source directory.');
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const entries = [], manifest = [];
  for (const name of await builderFiles(root)) {
    let data = await readFile(path.join(root, ...name.split('/')));
    if (name.endsWith('.cmd') || name === 'START-HERE.txt') data = Buffer.from(data.toString('utf8').replace(/\r?\n/g, '\r\n'));
    entries.push({ name: `investigator-website-builder/${name}`, data });
    manifest.push({ file: name, sha256: createHash('sha256').update(data).digest('hex') });
  }
  entries.push({ name: 'investigator-website-builder/DISTRIBUTION.json', data: JSON.stringify({
    name: 'Investigator Website Builder', version: pkg.version, node_major: 24, platform: 'Windows',
    dependencies: 'Installed on this computer at first launch; no platform-specific dependencies are bundled.',
    content: 'Open or create a separate investigator content folder. No personal catalog is included.',
    files: manifest,
  }, null, 2) + '\n' });
  await writeZip(target, entries);
  return { file: target, version: pkg.version, files: entries.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: npm run builder:package -- ../investigator-website-builder-v1.0.0-windows.zip');
    const result = await packageBuilder(process.argv[2]);
    console.log(`Created Windows builder v${result.version}: ${result.file} (${result.files} files). No personal content or installed dependencies included.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
