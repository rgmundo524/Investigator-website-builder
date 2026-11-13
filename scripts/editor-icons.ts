import { icons } from '@iconify-json/lucide';
import { CONTENT_ICONS, CONTENT_ICON_ALIASES, CONTENT_ICON_NAMES } from '../src/config/content-icons';

const shapes = new Set(['g', 'path', 'rect', 'ellipse', 'circle', 'line', 'polyline', 'polygon']);
const numbers = new Set(['x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'stroke-width']);
const number = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

function safeAttribute(name: string, value: string): boolean {
  if (numbers.has(name)) return number.test(value);
  if (name === 'fill' || name === 'stroke') return /^(?:none|currentColor)$/.test(value);
  if (name === 'stroke-linecap') return /^(?:round|butt|square)$/.test(value);
  if (name === 'stroke-linejoin') return /^(?:round|bevel|miter)$/.test(value);
  if (name === 'fill-rule' || name === 'clip-rule') return /^(?:nonzero|evenodd)$/.test(value);
  if (name === 'd') return /^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]+$/.test(value);
  if (name === 'points') return /^[0-9eE+.,\s-]+$/.test(value);
  return false;
}

// Only bundled geometric SVG markup may reach the preview. Reject unexpected
// markup rather than trying to repair it after an icon-package change.
export function contentIconPreview(body: string, width = 24, height = 24): string {
  if (![width, height].every(value => Number.isFinite(value) && value > 0 && value <= 1024)) throw new Error('Invalid icon dimensions.');
  const tags = /<(\/?)([a-z]+)((?:\s+[^<>]*?)?)(\/?)>/g;
  const stack: string[] = [];
  let end = 0;
  for (const match of body.matchAll(tags)) {
    if (body.slice(end, match.index).trim() || !shapes.has(match[2])) throw new Error('Unsupported icon markup.');
    const [, closing, name, rawAttributes, selfClosing] = match;
    if (closing) {
      if (rawAttributes.trim() || selfClosing || stack.pop() !== name) throw new Error('Invalid icon markup.');
    } else {
      let remaining = rawAttributes;
      const seen = new Set<string>();
      while (remaining.trim()) {
        const attribute = /^\s+([a-z][a-z0-9-]*)="([^"]*)"/.exec(remaining);
        if (!attribute || seen.has(attribute[1]) || !safeAttribute(attribute[1], attribute[2])) throw new Error('Unsupported icon attribute.');
        seen.add(attribute[1]);
        remaining = remaining.slice(attribute[0].length);
      }
      if (!selfClosing) stack.push(name);
    }
    end = match.index! + match[0].length;
  }
  if (!end || body.slice(end).trim() || stack.length) throw new Error('Invalid icon markup.');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" fill="none" color="#176a61">${body}</svg>`;
}

let cachedCatalog: ReadonlyArray<{ name: string; label: string; svg: string; aliases: readonly string[] }> | undefined;

export function contentIconCatalog() {
  if (cachedCatalog) return cachedCatalog;
  const aliasesByName = new Map<string, string[]>();
  for (const [alias, name] of Object.entries(CONTENT_ICON_ALIASES)) {
    const aliases = aliasesByName.get(name) ?? [];
    aliases.push(alias);
    aliasesByName.set(name, aliases);
  }
  cachedCatalog = Object.freeze(CONTENT_ICON_NAMES.map(name => {
    const icon = icons.icons[name];
    if (!icon) throw new Error(`The bundled icon is unavailable: ${name}.`);
    return Object.freeze({ name, label: CONTENT_ICONS[name], svg: contentIconPreview(icon.body, icon.width ?? icons.width ?? 24, icon.height ?? icons.height ?? 24), aliases: Object.freeze(aliasesByName.get(name) ?? []) });
  }));
  return cachedCatalog;
}
