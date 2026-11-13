import { cp, mkdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { builderRoot, resolveSiteData } from './site-data';
import { loadContent } from './content';

export async function exportContent(destination: string, source = resolveSiteData()) {
  await loadContent(source.contentDir);
  const requested = path.resolve(builderRoot, destination);
  const target = path.join(await realpath(path.dirname(requested)), path.basename(requested));
  const relative = path.relative(await realpath(builderRoot), target);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('Export to a new directory outside the public builder repository.');
  }
  // No recursive mkdir here: an existing destination is never overwritten.
  await mkdir(target);
  for (const name of ['site.json', 'content', 'assets', 'public']) {
    const file = path.join(source.dataDir, name);
    try { await stat(file); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    await cp(file, path.join(target, name), { recursive: true, force: false, errorOnExist: true });
  }
  await writeFile(path.join(target, '.gitignore'), '.env\n.env.*\n*.log\n.DS_Store\n', { flag: 'wx' });
  return target;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: npm run content:export -- ../my-site-data');
    console.log(`Exported site data to ${await exportContent(process.argv[2])}. Original files are preserved.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
