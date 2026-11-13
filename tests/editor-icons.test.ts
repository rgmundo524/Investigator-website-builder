import assert from 'node:assert/strict';
import test from 'node:test';
import { icons } from '@iconify-json/lucide';
import { canonicalContentIconName, CONTENT_ICONS, CONTENT_ICON_ALIASES, CONTENT_ICON_NAMES, SUPPORTED_CONTENT_ICON_NAMES } from '../src/config/content-icons';
import { schemas } from '../src/content/schemas';
import { contentIconCatalog, contentIconPreview } from '../scripts/editor-icons';
import { startEditorServer } from '../scripts/editor-server';

test('the visual icon catalog includes every installed Lucide design for every icon-bearing record', () => {
  const catalog = contentIconCatalog();
  assert.deepEqual(catalog.map(icon => icon.name), CONTENT_ICON_NAMES);
  assert.deepEqual(catalog.map(icon => icon.name), Object.keys(icons.icons).sort());
  assert.equal(new Set(catalog.map(icon => icon.name)).size, catalog.length);
  assert.ok(catalog.length > 1800, 'The picker must expose the full collection, not a curated subset.');
  assert.equal(contentIconCatalog(), catalog, 'Validated local previews are cached for subsequent requests.');
  assert.equal(CONTENT_ICONS.code, 'Code');
  assert.equal(CONTENT_ICONS['chart-no-axes-combined'], 'Data trends');
  assert.equal(CONTENT_ICONS['accessibility'], 'Accessibility');
  assert.equal(CONTENT_ICONS['usb'], 'USB');
  const base = { slug: 'catalog-test', title: 'Catalog test', description_short: 'Catalog test summary.' };
  for (const icon of catalog) {
    assert.equal(icon.label, CONTENT_ICONS[icon.name]);
    const bundled = icons.icons[icon.name];
    assert.ok(icon.svg.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bundled.width ?? icons.width ?? 24} ${bundled.height ?? icons.height ?? 24}" `));
    assert.match(icon.svg, /<path|<circle|<rect|<ellipse/);
    assert.doesNotMatch(icon.svg, /<script|<image|<use|foreignObject|\son[a-z]+=|\shref=|\sstyle=|url\(|<!/i);
    assert.equal(schemas.skills.parse({ ...base, icon: icon.name }).icon, icon.name);
    assert.equal(schemas.interests.parse({ ...base, icon: icon.name }).icon, icon.name);
    assert.equal(schemas.activities.parse({ ...base, kind: 'volunteering', icon: icon.name }).icon, icon.name);
  }
  assert.equal(schemas.skills.safeParse({ ...base, icon: 'unsupported-symbol' }).success, false);
  assert.equal(schemas.interests.safeParse({ ...base, icon: 'unsupported-symbol' }).success, false);
  assert.equal(schemas.activities.safeParse({ ...base, kind: 'volunteering', icon: 'unsupported-symbol' }).success, false);
  const invalid = schemas.skills.safeParse({ ...base, icon: 'unsupported-symbol' });
  assert.equal(invalid.success, false);
  if (!invalid.success) assert.equal(invalid.error.issues.find(issue => issue.path[0] === 'icon')?.message, 'Choose an available Lucide icon.');
});

test('bundled aliases remain valid and resolve to one canonical picker design', () => {
  const catalog = contentIconCatalog();
  const aliases = catalog.flatMap(icon => icon.aliases.map(alias => [alias, icon.name] as const));
  assert.deepEqual(Object.fromEntries(aliases), CONTENT_ICON_ALIASES);
  assert.deepEqual(Object.keys(CONTENT_ICON_ALIASES), Object.keys(icons.aliases ?? {}).sort());
  assert.equal(new Set(aliases.map(([alias]) => alias)).size, aliases.length);
  assert.equal(SUPPORTED_CONTENT_ICON_NAMES.length, catalog.length + aliases.length);
  const base = { slug: 'alias-test', title: 'Alias test', description_short: 'Alias test summary.' };
  for (const [alias, name] of aliases) {
    assert.equal(canonicalContentIconName(alias), name);
    assert.equal(canonicalContentIconName(name), name);
    assert.ok(!catalog.some(icon => icon.name === alias), 'Aliases must not become duplicate visual choices.');
    assert.equal(schemas.skills.parse({ ...base, icon: alias }).icon, alias, 'Reading an alias must not rewrite its saved value.');
    assert.equal(schemas.interests.parse({ ...base, icon: alias }).icon, alias);
    assert.equal(schemas.activities.parse({ ...base, kind: 'volunteering', icon: alias }).icon, alias);
  }
  for (const name of ['unsupported-symbol', '__proto__', 'constructor', 'toString']) assert.equal(canonicalContentIconName(name), undefined);
});

test('icon previews reject scripts, external references, styling, malformed markup and unsafe dimensions', () => {
  assert.match(contentIconPreview('<g stroke="currentColor"><path d="M0 0L24 24"/></g>'), /<\/g><\/svg>$/);
  assert.match(contentIconPreview('<path d="M0 0" fill-rule="evenodd" clip-rule="nonzero"/>'), /fill-rule="evenodd" clip-rule="nonzero"/);
  for (const body of [
    '<script>alert(1)</script>',
    '<image href="https://outside.example/photo.png"/>',
    '<use href="#other"/>',
    '<foreignObject><p>HTML</p></foreignObject>',
    '<path d="M0 0" onclick="alert(1)"/>',
    '<path d="M0 0" style="stroke:url(https://outside.example)"/>',
    '<path d="M0 0" fill="url(https://outside.example)"/>',
    '<path d="M0 0" stroke="red"/>',
    '<path d="M0 0" fill-rule="url(https://outside.example)"/>',
    '<path d="M0 0" clip-rule="inherit"/>',
    '<path d="M0 0" d="M1 1"/>',
    '<g><path d="M0 0"/></path>',
    '<g><path d="M0 0"/>',
    '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///private">]><path d="M0 0"/>',
    '<path d="M0 0"/>&xxe;',
    '<!-- hidden --><path d="M0 0"/>',
    '<path d="M0 0"/>unexpected text',
    '',
  ]) assert.throws(() => contentIconPreview(body), /icon (markup|attribute)/, body);
  for (const size of [0, -1, NaN, Infinity, 1025]) {
    assert.throws(() => contentIconPreview('<path d="M0 0"/>', size), /dimensions/);
    assert.throws(() => contentIconPreview('<path d="M0 0"/>', 24, size), /dimensions/);
  }
});

test('the icon catalog is local read-only session data and does not require or change an investigator folder', async t => {
  const editor = await startEditorServer({ port: 0 });
  t.after(() => editor.close());
  const route = new URL('/api/icons', editor.url);
  const headers = { 'X-Editor-Token': editor.token };
  assert.equal((await fetch(route)).status, 403);
  assert.equal((await fetch(route, { headers: { ...headers, Origin: 'https://outside.example' } })).status, 403);
  const response = await fetch(route, { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(await response.json(), { icons: contentIconCatalog() });
  const state = await (await fetch(new URL('/api/state', editor.url), { headers })).json();
  assert.equal(state.workspace, null);
  assert.equal(state.workspaceId, null);
  assert.equal((await fetch(route, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' })).status, 409);
});
