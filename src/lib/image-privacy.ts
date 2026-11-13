import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ImageMetadata } from 'astro';
import sharpService from 'astro/assets/services/sharp';

type ImageConfig = Parameters<typeof sharpService.transform>[2];
type ImageInfo = { format?: 'jpeg' | 'png' | 'webp'; metadata: boolean; frames: number };

const rasterExtension = /\.(?:png|jpe?g|webp|avif|gif)$/i;
const referenceExtension = /\.(?:html?|css|[cm]?js|json|webmanifest|xml|svg|txt|map)$/i;

async function outputFiles(directory: string, prefix = ''): Promise<{ files: string[]; hasLinks: boolean }> {
  let entries;
  try { entries = await readdir(path.join(directory, prefix), { withFileTypes: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { files: [], hasLinks: false };
    throw error;
  }
  const files: string[] = [];
  let hasLinks = false;
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    if (entry.isSymbolicLink()) hasLinks = true;
    else if (entry.isDirectory()) {
      const nested = await outputFiles(directory, relative);
      files.push(...nested.files);
      hasLinks ||= nested.hasLinks;
    } else if (entry.isFile()) files.push(relative);
  }
  return { files, hasLinks };
}

// URLs can be escaped in HTML, CSS, JSON, or bundled JavaScript. Matching the
// decoded filename (rather than resolving a URL) also covers srcset, queries,
// relative URLs, deployment prefixes and references shared by several pages.
function decodedReferences(text: string): string {
  for (let pass = 0; pass < 3; pass++) {
    const decoded = text
      .replace(/\\u\{([\da-f]{1,6})\}|\\u([\da-f]{4})|\\x([\da-f]{2})/gi,
        (value, codePoint, unicode, hex) => {
          const code = parseInt(codePoint ?? unicode ?? hex, 16);
          return code <= 0x10ffff ? String.fromCodePoint(code) : value;
        })
      .replace(/\\([\da-f]{1,6})(?:\r\n|[\t\n\r\f ])?/gi, (_value, hex) => {
        const code = parseInt(hex, 16);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '\ufffd';
      })
      .replace(/\\\r?\n/g, '')
      .replace(/\\(.)/g, '$1')
      .replace(/&#(?:x([\da-f]+)|(\d+));?/gi, (value, hex, decimal) => {
        const code = parseInt(hex ?? decimal, hex === undefined ? 10 : 16);
        return code <= 0x10ffff ? String.fromCodePoint(code) : value;
      })
      .replace(/&(?:sol|period|lowbar|percnt|amp);/gi, (value) => ({
        '&sol;': '/', '&period;': '.', '&lowbar;': '_', '&percnt;': '%', '&amp;': '&',
      })[value.toLowerCase()]!)
      .replace(/(?:%[\da-f]{2})+/gi, (value) => {
        try { return decodeURIComponent(value); }
        catch { return value; }
      });
    if (decoded === text) break;
    text = decoded;
  }
  return text;
}

function hasComputedImageUrl(text: string): boolean {
  // A filename assembled at runtime cannot be proven unused by a static scan.
  // Keep every generated image if an asset-directory prefix or an image suffix
  // is used on its own, or an image URL contains a template expression.
  return /_astro\/["'`]|_astro\/[^"'`\n]*\$\{|["'`]\.(?:png|jpe?g|webp|avif|gif)(?:[?#][^"'`]*)?["'`]|["'`][^"'`\n]*\$\{[^"'`\n]*\.(?:png|jpe?g|webp|avif|gif)/i.test(text);
}

/** Remove only generated raster files with no static output reference. */
export async function pruneUnusedBuildImages(directory: string, publicDirectory?: string): Promise<number> {
  const output = await outputFiles(directory);
  // Do not follow links or make assumptions about references in linked files.
  if (output.hasLinks) return 0;
  const publicFiles = publicDirectory ? await outputFiles(publicDirectory) : { files: [], hasLinks: false };
  if (publicFiles.hasLinks) return 0;
  const protectedFiles = new Set(publicFiles.files);
  const candidates = output.files.filter((file) => file.startsWith(`_astro${path.sep}`)
    && rasterExtension.test(file) && !protectedFiles.has(file)
    // Arbitrary Unicode/entity filenames need a broader URL parser. The normal
    // generated filenames are ASCII; keep unusual names rather than guessing.
    && /^[a-z\d._-]+$/i.test(path.basename(file)));
  if (!candidates.length) return 0;

  const names = new Set(candidates.map((file) => path.basename(file)));
  const referenced = new Set<string>();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (const file of output.files.filter((file) => referenceExtension.test(file))) {
    let text: string;
    try { text = decoder.decode(await readFile(path.join(directory, file))); }
    catch { return 0; } // Unknown text encodings are not grounds for deleting assets.
    text = decodedReferences(text);
    if (hasComputedImageUrl(text)) return 0;
    for (const name of names) if (text.includes(name)) referenced.add(name);
  }
  const unused = candidates.filter((file) => !referenced.has(path.basename(file)));
  for (const file of unused) await rm(path.join(directory, file));
  return unused.length;
}

// Inspect container metadata, including compressed text, without interpreting its contents.
export function imagePrivacyInfo(input: Uint8Array): ImageInfo {
  const bytes = Buffer.from(input);
  const info: ImageInfo = { metadata: false, frames: 1 };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    info.format = 'jpeg';
    let offset = 2;
    while (offset + 3 < bytes.length && bytes[offset] === 0xff) {
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) throw new Error('Invalid JPEG metadata segment.');
      if ([0xe1, 0xe2, 0xed, 0xfe].includes(marker)) info.metadata = true;
      offset += length;
    }
  } else if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    info.format = 'png';
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.toString('ascii', offset + 4, offset + 8);
      if (offset + length + 12 > bytes.length) throw new Error('Invalid PNG metadata chunk.');
      if (['eXIf', 'tEXt', 'zTXt', 'iTXt', 'iCCP'].includes(type)) info.metadata = true;
      if (type === 'acTL' && length >= 8) info.frames = bytes.readUInt32BE(offset + 8);
      offset += length + 12;
    }
  } else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    info.format = 'webp';
    let frames = 0;
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const type = bytes.toString('ascii', offset, offset + 4);
      const length = bytes.readUInt32LE(offset + 4);
      if (offset + length + 8 > bytes.length) throw new Error('Invalid WebP metadata chunk.');
      if (['EXIF', 'XMP ', 'ICCP'].includes(type)) info.metadata = true;
      if (type === 'ANMF') frames++;
      offset += length + 8 + length % 2;
    }
    info.frames = frames || 1;
  }
  return info;
}

// Sharp does not decode APNG animation. Refuse it before optimization can flatten it.
export async function assertSupportedPhoto(source: ImageMetadata): Promise<void> {
  const file = (source as ImageMetadata & { fsPath?: string }).fsPath;
  if (!file?.toLowerCase().endsWith('.png')) return;
  if (imagePrivacyInfo(await readFile(file)).frames > 1) {
    throw new Error(`Animated PNG is not supported for website photos: ${path.basename(file)}. Use animated WebP to preserve every frame.`);
  }
}

export async function sanitizePublishedImages(directory: string, config: ImageConfig): Promise<number> {
  let sanitized = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      sanitized += await sanitizePublishedImages(file, config);
      continue;
    }
    if (!entry.isFile() || !/\.(?:png|jpe?g|webp)$/i.test(entry.name)) continue;
    const original = await readFile(file);
    const before = imagePrivacyInfo(original);
    if (!before.metadata || !before.format) continue;
    if (before.format === 'png' && before.frames > 1) {
      throw new Error(`Cannot remove metadata from animated PNG without losing animation: ${entry.name}. Use animated WebP instead.`);
    }
    const result = await sharpService.transform(original, { src: file, format: before.format, quality: 'high' }, config, {
      info() {}, warn(message) { throw new Error(message); }, error(message) { throw new Error(message); },
    });
    const after = imagePrivacyInfo(result.data);
    if (after.metadata || after.format !== before.format || after.frames !== before.frames) {
      throw new Error(`Could not safely remove image metadata while preserving the format and animation: ${entry.name}`);
    }
    await writeFile(file, result.data);
    sanitized++;
  }
  return sanitized;
}
