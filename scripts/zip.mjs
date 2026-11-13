import { writeFile } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** A portable ZIP with deterministic dates and no system archiver dependency. */
export async function writeZip(destination, entries) {
  if (entries.length > 0xffff) throw new Error('Too many files for this ZIP format.');
  const local = [], central = [], seen = new Set();
  let offset = 0;
  for (const entry of entries) {
    if (!entry.name || entry.name.includes('\\') || entry.name.startsWith('/') || entry.name.split('/').some(part => !part || part === '.' || part === '..') || seen.has(entry.name.toLowerCase())) throw new Error(`Invalid or duplicate archive path: ${entry.name}`);
    seen.add(entry.name.toLowerCase());
    const data = Buffer.from(entry.data), compressed = deflateRawSync(data, { level: 9 });
    const name = Buffer.from(entry.name, 'utf8'), checksum = crc32(data);
    if (data.length > 0xffffffff || compressed.length > 0xffffffff || name.length > 0xffff || offset > 0xffffffff) throw new Error('ZIP entry exceeds the archive limits.');
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(8, 8); header.writeUInt16LE(0x0021, 12);
    header.writeUInt32LE(checksum, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
    local.push(header, name, compressed);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x0800, 8); record.writeUInt16LE(8, 10); record.writeUInt16LE(0x0021, 14);
    record.writeUInt32LE(checksum, 16); record.writeUInt32LE(compressed.length, 20); record.writeUInt32LE(data.length, 24); record.writeUInt16LE(name.length, 28); record.writeUInt32LE(offset, 42);
    central.push(record, name); offset += header.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  await writeFile(destination, Buffer.concat([...local, directory, end]), { flag: 'wx' });
}
