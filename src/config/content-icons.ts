import { icons } from '@iconify-json/lucide';

// Keep the familiar labels already used in the builder. Every other icon gets
// a readable label from its installed Lucide name, so the picker and renderer
// stay in step when the bundled collection changes.
const labels: Record<string, string> = {
  code: 'Code',
  database: 'Database',
  terminal: 'Terminal',
  network: 'Network',
  'chart-no-axes-combined': 'Data trends',
  'chart-pie': 'Pie chart',
  'hand-heart': 'Helping hand',
  users: 'People',
  landmark: 'Institution',
  bike: 'Cycling',
  beer: 'Brewing',
  box: 'Box',
  'mountain-snow': 'Mountains and snow',
  server: 'Server',
  puzzle: 'Puzzle',
  'shield-check': 'Verified shield',
  lightbulb: 'Idea',
};

const acronyms = new Set(['ai', 'api', 'cpu', 'cctv', 'dna', 'gpu', 'hdmi', 'id', 'nfc', 'qr', 'rss', 'tv', 'usb', 'voip', 'vpn', 'vr']);
function readableLabel(name: string): string {
  return name.split('-').map(word => acronyms.has(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export const CONTENT_ICONS: Readonly<Record<string, string>> = Object.freeze(Object.fromEntries(
  Object.keys(icons.icons).sort().map(name => [name, labels[name] ?? readableLabel(name)]),
));

export type ContentIconName = keyof typeof CONTENT_ICONS;
export const CONTENT_ICON_NAMES = Object.freeze(Object.keys(CONTENT_ICONS)) as readonly [ContentIconName, ...ContentIconName[]];

// Lucide ships alternate names for renamed icons. Accept those saved values
// while showing each design once in the picker.
function resolveAlias(name: string): string {
  const seen = new Set<string>();
  while (!Object.hasOwn(icons.icons, name)) {
    if (seen.has(name)) throw new Error(`The bundled icon alias is circular: ${name}.`);
    seen.add(name);
    const alias = icons.aliases?.[name];
    if (!alias || Object.keys(alias).some(key => key !== 'parent')) throw new Error(`The bundled icon alias is unsupported: ${name}.`);
    name = alias.parent;
  }
  return name;
}

export const CONTENT_ICON_ALIASES: Readonly<Record<string, string>> = Object.freeze(Object.fromEntries(
  Object.keys(icons.aliases ?? {}).sort().map(name => [name, resolveAlias(name)]),
));
export const SUPPORTED_CONTENT_ICON_NAMES = Object.freeze([
  ...CONTENT_ICON_NAMES, ...Object.keys(CONTENT_ICON_ALIASES),
]) as readonly [string, ...string[]];

export function canonicalContentIconName(name: string): ContentIconName | undefined {
  return Object.hasOwn(CONTENT_ICONS, name) ? name : Object.hasOwn(CONTENT_ICON_ALIASES, name) ? CONTENT_ICON_ALIASES[name] : undefined;
}
