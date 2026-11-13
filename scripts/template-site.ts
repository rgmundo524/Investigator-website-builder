import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blankTemplateRoot, templateDestination, templateFiles } from './init-site';
import { loadContent } from './content';

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Standard, uncompressed ZIP with fixed timestamps and no external archiver. */
export async function createTemplateZip(destination: string) {
  if (path.extname(destination).toLowerCase() !== '.zip') throw new Error('Choose a new filename ending in .zip.');
  const target = await templateDestination(destination);
  await loadContent(path.join(blankTemplateRoot, 'content'));
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const files = await templateFiles();
  if (files.length > 0xffff) throw new Error('Template contains too many files for this ZIP format.');
  for (const file of files) {
    const data = await readFile(path.join(blankTemplateRoot, file));
    const name = Buffer.from(`investigator-site/${file.split(path.sep).join('/')}`, 'utf8');
    if (data.length > 0xffffffff || name.length > 0xffff) throw new Error('Template entry exceeds ZIP limits.');
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(0x0021, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    locals.push(header, name, data);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x0800, 8);
    record.writeUInt16LE(0x0021, 14);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(data.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(offset, 42);
    central.push(record, name);
    offset += header.length + name.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  await writeFile(target, Buffer.concat([...locals, directory, end]), { flag: 'wx' });
  return target;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: npm run site:template -- ../investigator-website-template.zip');
    console.log(`Created blank fill-in pack: ${await createTemplateZip(process.argv[2])}. This is content to complete, not a deployment archive.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
