import { constants } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isScalar, isSeq, parseDocument } from 'yaml';
import { loadContent } from './content';
import { resolveSiteData } from './site-data';

const previousAboutOrder = ['skills', 'volunteering', 'organizations', 'interests', 'github'];
const currentAboutOrder = ['interests', 'volunteering', 'organizations', 'skills', 'github'];
type UpgradeChange = { file: string; description: string };
type PlannedChange = UpgradeChange & { original: string; updated: string };

/** Apply only recognized starter migrations. Previewing is the default. */
export async function upgradeContent(options: { dataDirectory?: string; write?: boolean } = {}) {
  const source = resolveSiteData(options.dataDirectory);
  const records = await loadContent(source.contentDir);
  const changes: PlannedChange[] = [];
  for (const record of records) {
    if (record.collection !== 'pages' || record.data.slug !== 'about') continue;
    if (record.data.section_order.length !== previousAboutOrder.length
      || record.data.section_order.some((name, index) => name !== previousAboutOrder[index])) continue;

    const original = await readFile(record.file, 'utf8');
    const parts = original.match(/^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n---)((?:\r?\n|$)[\s\S]*)$/);
    if (!parts) throw new Error(`${record.file}: expected YAML frontmatter enclosed by --- lines.`);
    const document = parseDocument(parts[2], { uniqueKeys: true });
    if (document.errors.length) throw new Error(`${record.file}: ${document.errors.map((error) => error.message).join('; ')}`);
    const sequence = document.get('section_order', true);
    if (!isSeq(sequence)) continue;
    // Reuse the existing scalar nodes so quotes and attached comments survive.
    const originalNodes = [...sequence.items];
    sequence.items = currentAboutOrder.map((name) => originalNodes.find((node) => isScalar(node) && node.value === name)!);
    const newline = parts[1].endsWith('\r\n') ? '\r\n' : '\n';
    const frontmatter = document.toString({ lineWidth: 0 }).replace(/\n$/, '').replace(/\r?\n/g, newline);
    changes.push({
      file: record.file,
      description: 'Move hobbies and community participation before technical skills on About.',
      original,
      updated: `${parts[1]}${frontmatter}${parts[3]}${parts[4]}`,
    });
  }

  const result: { dataDir: string; changes: UpgradeChange[]; written: boolean; backupDir?: string } = {
    dataDir: source.dataDir,
    changes: changes.map(({ file, description }) => ({ file, description })),
    written: false,
  };
  if (!options.write || !changes.length) return result;

  for (const change of changes) {
    if (await readFile(change.file, 'utf8') !== change.original) {
      throw new Error(`${change.file} changed while preparing the upgrade. Run it again to review the current content.`);
    }
  }
  const backupRoot = path.join(source.dataDir, 'migration-backups');
  await mkdir(backupRoot, { recursive: true });
  const resolvedBackupRoot = await realpath(backupRoot);
  const relativeToContent = path.relative(source.contentDir, resolvedBackupRoot);
  if (!relativeToContent || (!relativeToContent.startsWith(`..${path.sep}`) && relativeToContent !== '..' && !path.isAbsolute(relativeToContent))) {
    throw new Error('The migration backup directory must be outside the content directory.');
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = await mkdtemp(path.join(resolvedBackupRoot, `${timestamp}-`));
  for (const change of changes) {
    const backup = path.join(backupDir, path.relative(source.dataDir, change.file));
    await mkdir(path.dirname(backup), { recursive: true });
    await copyFile(change.file, backup, constants.COPYFILE_EXCL);
  }
  await writeFile(path.join(backupDir, 'manifest.json'), JSON.stringify({
    migration: 'about-section-order',
    createdAt: new Date().toISOString(),
    files: changes.map(({ file, description }) => ({ file: path.relative(source.dataDir, file), description })),
  }, null, 2) + '\n', { flag: 'wx' });
  // All original files have a non-overwritten backup before the first edit.
  for (const change of changes) {
    if (await readFile(change.file, 'utf8') !== change.original) {
      throw new Error(`${change.file} changed after backup. No upgrade was applied to it; review ${backupDir}.`);
    }
    await writeFile(change.file, change.updated, 'utf8');
  }
  return { ...result, written: true, backupDir };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const flags = process.argv.slice(2);
    if (flags.length > 1 || flags.some((flag) => !['--write', '--dry-run'].includes(flag))) {
      throw new Error('Usage: npm run content:upgrade -- [--dry-run | --write]. Select content with SITE_DATA_DIR.');
    }
    const result = await upgradeContent({ write: flags.includes('--write') });
    console.log(`Selected site data: ${result.dataDir}`);
    if (!result.changes.length) console.log('No recognized starter migrations are needed. Customized section orders are preserved.');
    else {
      for (const change of result.changes) console.log(`${result.written ? 'Updated' : 'Would update'} ${change.file}: ${change.description}`);
      if (result.backupDir) console.log(`Original files backed up to ${result.backupDir}`);
      else console.log('Preview only. Run again with --write to apply these changes and create a backup.');
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
