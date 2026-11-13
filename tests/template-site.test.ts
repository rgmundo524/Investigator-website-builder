import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { crc32 } from 'node:zlib';
import { createTemplateZip } from '../scripts/template-site';
import { blankTemplateRoot, templateFiles } from '../scripts/init-site';
import { builderRoot } from '../scripts/site-data';

test('fill-in ZIP is deterministic, complete, readable and independent of selected personal data', async (t) => {
  const parent = await mkdtemp(path.join(tmpdir(), 'investigator-template-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const first = path.join(parent, 'first.zip');
  const second = path.join(parent, 'second.zip');
  const old = process.env.SITE_DATA_DIR;
  process.env.SITE_DATA_DIR = 'unrelated-private-person';
  try {
    assert.equal(await createTemplateZip(first), first);
    await createTemplateZip(second);
  } finally {
    if (old === undefined) delete process.env.SITE_DATA_DIR;
    else process.env.SITE_DATA_DIR = old;
  }
  const zip = await readFile(first);
  assert.deepEqual(zip, await readFile(second));
  const files = await templateFiles();
  const found: string[] = [];
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(zip.readUInt16LE(offset + 8), 0, 'ordinary uncompressed ZIP entry');
    const length = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const name = zip.toString('utf8', offset + 30, offset + 30 + nameLength);
    assert.ok(name.startsWith('investigator-site/'));
    const relative = name.slice('investigator-site/'.length);
    assert.ok(!relative.includes('..'));
    const start = offset + 30 + nameLength + extraLength;
    const data = zip.subarray(start, start + length);
    assert.equal(crc32(data), zip.readUInt32LE(offset + 14), name);
    assert.deepEqual(data, await readFile(path.join(blankTemplateRoot, ...relative.split('/'))), name);
    found.push(relative);
    offset = start + length;
  }
  assert.deepEqual(found.sort(), files.map((file) => file.split(path.sep).join('/')).sort());
  assert.ok(found.includes('START-HERE.md'));
  assert.ok(found.includes('record-templates/case.md'));
  assert.equal(zip.readUInt32LE(offset), 0x02014b50, 'central directory follows file entries');
  const end = zip.length - 22;
  assert.equal(zip.readUInt32LE(end), 0x06054b50);
  assert.equal(zip.readUInt16LE(end + 10), files.length);
  assert.equal(zip.readUInt32LE(end + 16), offset);
});

test('fill-in ZIP refuses overwrites and output paths in the builder', async (t) => {
  const parent = await mkdtemp(path.join(tmpdir(), 'investigator-template-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const target = path.join(parent, 'existing.zip');
  await writeFile(target, 'keep');
  await assert.rejects(createTemplateZip(target), /EEXIST/);
  assert.equal(await readFile(target, 'utf8'), 'keep');
  await assert.rejects(createTemplateZip(path.join(builderRoot, 'forbidden.zip')), /outside the public builder/);
  await assert.rejects(createTemplateZip(path.join(parent, 'not-a-zip.txt')), /ending in .zip/);
});
