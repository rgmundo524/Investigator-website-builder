import { spawnSync } from 'node:child_process';
import { copyFile, lstat, mkdir, readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { builderRoot, resolveSiteData } from './site-data';
import { loadContent } from './content';

type PackageOptions = {
  root?: string;
  env?: NodeJS.ProcessEnv;
  runBuild?: (env: NodeJS.ProcessEnv) => void | Promise<void>;
};

function contains(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return !relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function listFiles(directory: string, prefix = ''): Promise<string[]> {
  const files: string[] = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Cannot package a symbolic link in the build: ${relative}`);
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
    else throw new Error(`Cannot package a non-file build entry: ${relative}`);
  }
  return files;
}

async function protectBuildInputs(output: string, data: ReturnType<typeof resolveSiteData>, selectedDirectory: string) {
  const outputLocations = [output];
  try { outputLocations.push(await realpath(output)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const inputs = [
    { directory: selectedDirectory, allowParent: true },
    { directory: data.dataDir, allowParent: true },
    { directory: path.join(data.dataDir, 'site.json'), allowParent: false },
    { directory: data.contentDir, allowParent: false },
    { directory: data.assetsDir, allowParent: false },
    { directory: data.publicDir, allowParent: false },
  ];
  for (const input of inputs) {
    let resolved: string;
    try { resolved = await realpath(input.directory); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    // Bundled data may live at the builder root, but its actual inputs must not
    // overlap dist, which is cleared before every production package build.
    if (outputLocations.some((location) => [input.directory, resolved].some((inputPath) => contains(location, inputPath)
      || (!input.allowParent && contains(inputPath, location))))) {
      throw new Error(`Selected site input overlaps the build output: ${input.directory}. Move the input outside dist before packaging.`);
    }
  }
}

/** Build published content and copy only the static result to a new, portable upload folder. */
export async function packageSite(destination: string, options: PackageOptions = {}) {
  const env = { ...(options.env ?? process.env) };
  if (!env.SITE_DATA_DIR?.trim()) {
    throw new Error('Set SITE_DATA_DIR to the completed investigator content folder before packaging.');
  }
  if (env.CONTENT_PREVIEW?.trim()) {
    throw new Error('Site packaging requires published content. Unset CONTENT_PREVIEW and use build:drafts only for local review.');
  }
  const root = await realpath(options.root ?? builderRoot);
  const data = resolveSiteData(env.SITE_DATA_DIR, root, env);
  const output = path.join(root, 'dist');
  await protectBuildInputs(output, data, path.resolve(root, env.SITE_DATA_DIR ?? ''));
  const requested = path.resolve(root, destination);
  const target = path.join(await realpath(path.dirname(requested)), path.basename(requested));
  if (contains(root, target) || contains(data.dataDir, target)) {
    throw new Error('Choose a new output folder outside the builder and site-data directories.');
  }
  try {
    await lstat(target);
    throw new Error(`Output already exists; choose a new folder: ${target}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const records = await loadContent(data.contentDir);
  const home = records.find((record) => record.collection === 'pages' && record.data.slug === 'home');
  if (!home || home.data.publication_status !== 'published') {
    throw new Error('The Home page is not published. Publish the reviewed homepage and its referenced content before packaging; draft previews are not production releases.');
  }

  delete env.CONTENT_PREVIEW;
  // A failed build must never result in packaging stale output from a previous site.
  await rm(output, { recursive: true, force: true });
  const runBuild = options.runBuild ?? ((buildEnv) => {
    const npm = buildEnv.npm_execpath;
    if (!npm) throw new Error('Run this helper with npm run site:package so it can use the current npm installation.');
    const result = spawnSync(process.execPath, [npm, 'run', 'build'], { cwd: root, env: buildEnv, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Production build failed${result.status === null ? '' : ` with exit code ${result.status}`}.`);
  });
  await runBuild(env);
  const files = await listFiles(output);
  if (!files.includes('index.html')) throw new Error('Production build did not produce dist/index.html.');

  // The destination is created exclusively and never reused or overwritten.
  await mkdir(target);
  try {
    for (const relative of files) {
      const to = path.join(target, relative);
      await mkdir(path.dirname(to), { recursive: true });
      await copyFile(path.join(output, relative), to);
    }
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
  return { directory: target, files: files.length, url: data.url };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: npm run site:package -- ../employee-site-release');
    const result = await packageSite(process.argv[2]);
    console.log(`Prepared ${result.files} published-site files for ${result.url} in ${result.directory}. Nothing was uploaded.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
