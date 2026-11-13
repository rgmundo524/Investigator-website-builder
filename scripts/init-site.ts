import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFile, mkdir, readdir, realpath, rm } from 'node:fs/promises';
import { builderRoot } from './site-data';
import { loadContent } from './content';

export const blankTemplateRoot = path.join(builderRoot, 'templates/investigator-site');

export async function templateFiles(directory = blankTemplateRoot, prefix = ''): Promise<string[]> {
  const files: string[] = [];
  for (const entry of (await readdir(path.join(directory, prefix), { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const relative = path.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`The blank template cannot contain symbolic links: ${relative}`);
    if (entry.isDirectory()) files.push(...await templateFiles(directory, relative));
    else if (entry.isFile()) files.push(relative);
    else throw new Error(`Unexpected template entry: ${relative}`);
  }
  return files;
}

export async function templateDestination(destination: string) {
  const requested = path.resolve(builderRoot, destination);
  const target = path.join(await realpath(path.dirname(requested)), path.basename(requested));
  const relative = path.relative(await realpath(builderRoot), target);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('Create the fill-in pack outside the public builder repository.');
  }
  return target;
}

// Never copy the selected person's content or a fictional casebook.
export async function initializeSite(destination: string) {
  await loadContent(path.join(blankTemplateRoot, 'content'));
  const files = await templateFiles();
  const target = await templateDestination(destination);
  await mkdir(target);
  try {
    for (const file of files) {
      const to = path.join(target, file);
      await mkdir(path.dirname(to), { recursive: true });
      await copyFile(path.join(blankTemplateRoot, file), to);
    }
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
  return target;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: npm run site:init -- ../employee-site-data');
    const target = await initializeSite(process.argv[2]);
    console.log(`Created a blank investigator fill-in pack in ${target}. Start with START-HERE.md.`);
    console.log(`Open this folder in Investigator Website Builder: ${target}`);
    console.log('Start with Start Builder.cmd on Windows or npm start, then choose Start local preview.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
