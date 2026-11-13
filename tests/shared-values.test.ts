import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { cp, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { createProcessor } from '@mdx-js/mdx';
import type { LoaderContext } from 'astro/loaders';
import { stringify } from 'yaml';
import { schemas, type ContentRecord } from '../src/content/schemas';
import { resolveSharedPage, validateSharedPages } from '../src/lib/shared-values';
import { sharedPageLoader } from '../scripts/shared-page-loader';
import { astroWorkspace } from '../scripts/astro-workspace';
import { builderRoot, resolveSiteData } from '../scripts/site-data';

type PageRecord = Extract<ContentRecord, { collection: 'pages' }>;
type DataEntry = NonNullable<ReturnType<LoaderContext['store']['get']>>;
function fixture(): { records: ContentRecord[]; page: PageRecord } {
  const page: PageRecord = {
    collection: 'pages', file: '/pack/content/pages/home.md',
    data: schemas.pages.parse({ slug: 'home', profile: 'investigator', title: 'About {{profile.name}}', description_short: '{{profile.headline}}', blocks: { contact_heading: '{{contact.main.email}} / {{contact.main.service.work.email}}' } }),
    body: 'Meet {{profile.name}} in {{profile.location}}.',
  };
  return {
    page,
    records: [page, {
      collection: 'profile', file: '/pack/content/profile/investigator.md', body: 'Biography.',
      data: schemas.profile.parse({ slug: 'investigator', name: 'Alex Investigator', headline: 'Blockchain investigator', location: 'Denver, CO', show_location: true }),
    }, {
      collection: 'contacts', file: '/pack/content/contacts/main.md', body: 'Contact introduction.',
      data: schemas.contacts.parse({ slug: 'main', description_short: 'Public contacts.', services_heading: 'Services', social: { title: 'Connect', name: 'Alex', description: 'Personal enquiries.', email: 'personal@example.test', phone: { label: '555 111 2222', number: '+15551112222' } }, services: [{ id: 'work', name: 'Example Agency', description: 'Work enquiries.', email: 'agency@example.test', phone: { label: '555 333 4444', number: '+15553334444' }, website: { label: 'Website', url: 'https://agency.example.test/' }, action: { label: 'Contact', url: 'https://agency.example.test/contact' } }] }),
    }],
  };
}

test('shared page text reuses explicit profile and distinct personal/service contacts without changing sources', () => {
  const { page, records } = fixture();
  page.body += '\n\n{{contact.main.phone}}, {{contact.main.service.work.name}}, {{contact.main.service.work.phone}}, {{contact.main.service.work.website}}';
  const before = structuredClone(records);
  const resolved = resolveSharedPage(page, records);
  assert.equal(resolved.data.title, 'About Alex Investigator');
  assert.equal(resolved.data.description_short, 'Blockchain investigator');
  assert.equal(resolved.data.blocks.contact_heading, 'personal@example.test / agency@example.test');
  assert.ok(resolved.body.includes('Denver\\, CO'));
  assert.ok(resolved.body.includes('555 111 2222'));
  assert.ok(resolved.body.includes('Example Agency'));
  assert.ok(resolved.body.includes('555 333 4444'));
  assert.ok(resolved.body.includes('https\\:\\/\\/agency\\.example\\.test\\/'));
  assert.equal(resolved.data.contact, undefined, 'text references do not place a contact card on the page');
  assert.deepEqual(records, before);
});

test('only approved values can be referenced, with useful field and source errors', () => {
  for (const token of ['profile.editorial_note', 'contact.main.social.email', 'contact.missing.email', 'contact.main.service.missing.email', 'unknown.name']) {
    const { page, records } = fixture();
    page.data.blocks.contact_heading = `Value {{${token}}}`;
    assert.throws(() => validateSharedPages(records), (error: Error) => error.message.includes(page.file) && error.message.includes('blocks.contact_heading') && error.message.includes(token));
  }
  const { page, records } = fixture();
  page.data.title = '{{profile.name';
  assert.throws(() => resolveSharedPage(page, records), /title:.*incomplete/);
});

test('hidden, disabled, absent, and unpublished source values cannot be substituted', () => {
  for (const scenario of ['location', 'personal', 'service', 'missing-email', 'draft-contact', 'draft-profile']) {
    const { page, records } = fixture();
    const profile = records.find((record) => record.collection === 'profile')! as Extract<ContentRecord, { collection: 'profile' }>;
    const contacts = records.find((record) => record.collection === 'contacts')! as Extract<ContentRecord, { collection: 'contacts' }>;
    if (scenario === 'location') profile.data.show_location = false;
    if (scenario === 'personal') contacts.data.social!.enabled = false;
    if (scenario === 'service') contacts.data.services[0].enabled = false;
    if (scenario === 'missing-email') contacts.data.social!.email = null;
    if (scenario.startsWith('draft-')) {
      page.data.publication_status = 'published';
      if (scenario === 'draft-contact') profile.data.publication_status = 'published';
      else contacts.data.publication_status = 'published';
    }
    assert.throws(() => resolveSharedPage(page, records), /shared value.*(hidden|disabled|no saved value|draft)/, scenario);
  }
});

test('Markdown substitutions remain prose even when a source contains HTML or Markdown syntax', () => {
  const { page, records } = fixture();
  const profile = records.find((record) => record.collection === 'profile')! as Extract<ContentRecord, { collection: 'profile' }>;
  profile.data.name = '<img src=x onerror="bad"> [link](https://bad.test) **bold**\n# Heading';
  page.body = 'Name: {{profile.name}}.';
  const resolved = resolveSharedPage(page, records);
  const tree = createProcessor({ format: 'md' }).parse(resolved.body);
  const types: string[] = [];
  const visit = (node: { type: string; children?: unknown[] }) => {
    types.push(node.type);
    node.children?.forEach((child) => visit(child as typeof node));
  };
  visit(tree);
  assert.deepEqual(types, ['root', 'paragraph', 'text']);
  assert.ok(resolved.body.includes('&lt;img'));
  assert.ok(!resolved.body.includes('\n'));
});

test('shared values in code, raw HTML, and link/image destinations are rejected; link labels and headings work', () => {
  for (const body of ['`{{profile.name}}`', '```text\n{{profile.name}}\n```', '<a title="{{profile.name}}">Link</a>', '[Email](mailto:{{contact.main.email}})', '![Photo]({{profile.name}})']) {
    const { page, records } = fixture();
    page.body = body;
    assert.throws(() => resolveSharedPage(page, records), /ordinary prose/, body);
  }
  const { page, records } = fixture();
  page.body = '# {{profile.name}}\n\n[{{profile.name}}](https://example.test/)';
  assert.equal(resolveSharedPage(page, records).body, '# Alex Investigator\n\n[Alex Investigator](https://example.test/)');
});

test('MDX keeps ordinary bodies and resolved metadata, and gives an explicit error for body references', () => {
  const { page, records } = fixture();
  page.file = '/pack/content/pages/home.mdx';
  page.body = '<p>Plain MDX content</p>';
  assert.equal(resolveSharedPage(page, records).data.title, 'About Alex Investigator');
  page.body = 'Meet {{profile.name}}.';
  assert.throws(() => resolveSharedPage(page, records), /not supported in MDX bodies/);
});

test('page-owned biography and written sections resolve shared values in Markdown even on MDX pages', () => {
  const { page, records } = fixture();
  page.file = '/pack/content/pages/about.mdx';
  page.body = '<p>Ordinary MDX introduction</p>';
  page.data.biography = 'Background of **{{profile.name}}**.';
  page.data.page_sections = [{ id: 'enquiries', title: 'Contact {{profile.name}}', body: 'Email {{contact.main.email}}.' }];
  const resolved = resolveSharedPage(page, records);
  assert.equal(resolved.data.biography, 'Background of **Alex Investigator**.');
  assert.equal(resolved.data.page_sections[0].title, 'Contact Alex Investigator');
  assert.equal(resolved.data.page_sections[0].body, 'Email personal\\@example\\.test.');
  assert.equal(page.data.page_sections[0].body, 'Email {{contact.main.email}}.');
  page.data.page_sections[0].body = '[Contact](mailto:{{contact.main.email}})';
  assert.throws(() => resolveSharedPage(page, records), /page_sections\.0\.body:.*ordinary prose/);
});

async function until(predicate: () => boolean, detail: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(detail);
}

test('page loader updates resolved content on source edits, preserves assets/MDX, and clears invalid cached values', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'shared-page-loader-'));
  try {
    const { records, page } = fixture();
    const contentDir = path.join(temporary, 'content');
    for (const record of records) {
      record.file = path.join(contentDir, record.collection, `${record.data.slug}.md`);
      await mkdir(path.dirname(record.file), { recursive: true });
      await writeFile(record.file, `---\n${stringify(record.data)}---\n${record.body}\n`);
    }
    const mdx = { ...page, file: path.join(contentDir, 'pages/mdx.mdx'), data: { ...page.data, slug: 'mdx' }, body: '<p>Plain MDX</p>' };
    await writeFile(mdx.file, `---\n${stringify(mdx.data)}---\n${mdx.body}\n`);
    const store = new Map<string, DataEntry>();
    const modules: string[] = [];
    const errors: string[] = [];
    const watcher = Object.assign(new EventEmitter(), { add: () => undefined });
    const context = {
      config: { root: pathToFileURL(`${temporary}/`) }, watcher,
      logger: { error: (message: string) => errors.push(message) },
      store: { get: (id: string) => store.get(id), keys: () => [...store.keys()], set: (entry: DataEntry) => store.set(entry.id, entry), delete: (id: string) => store.delete(id), clear: () => store.clear(), addModuleImport: (file: string) => modules.push(file) },
      parseData: async ({ data }: { data: unknown }) => schemas.pages.parse(data),
      generateDigest: (data: unknown) => createHash('sha256').update(JSON.stringify(data)).digest('hex'),
      renderMarkdown: async (body: string, options: { fileURL: URL }) => ({ html: `<p>${body}</p>`, metadata: { imagePaths: ['photo.png'], source: options.fileURL.href } }),
    } as unknown as LoaderContext;
    await sharedPageLoader(contentDir).load(context);
    assert.equal(store.get('home')!.data.title, 'About Alex Investigator');
    assert.equal(store.get('home')!.rendered!.metadata!.source, pathToFileURL(page.file).href);
    assert.deepEqual(store.get('home')!.assetImports, ['photo.png']);
    assert.equal(store.get('mdx')!.deferredRender, true);
    assert.ok(modules.includes('content/pages/mdx.mdx'));
    const oldDigest = store.get('home')!.digest;
    const profile = records.find((record) => record.collection === 'profile')! as Extract<ContentRecord, { collection: 'profile' }>;
    profile.data.name = 'Updated Investigator';
    await writeFile(profile.file, `---\n${stringify(profile.data)}---\n${profile.body}\n`);
    watcher.emit('change', profile.file);
    await until(() => store.get('home')?.data.title === 'About Updated Investigator', 'Profile edits did not refresh pages.');
    assert.notEqual(store.get('home')!.digest, oldDigest);
    assert.ok(store.get('home')!.body!.includes('Updated Investigator'));
    assert.ok((await readFile(page.file, 'utf8')).includes('{{profile.name}}'));
    profile.data.show_location = false;
    await writeFile(profile.file, `---\n${stringify(profile.data)}---\n${profile.body}\n`);
    watcher.emit('change', profile.file);
    await until(() => errors.length > 0, 'Hidden shared location was not rejected.');
    assert.equal(store.size, 0, 'Invalid source must not leave its former public value cached.');
    assert.match(errors[0], /body:.*profile.location.*hidden/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('static builds resolve shared page values, preserve Markdown images, and refresh changed sources', { timeout: 60_000 }, async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'shared-page-build-'));
  let generatedRoot: string | undefined;
  try {
    await symlink(path.join(builderRoot, 'node_modules'), path.join(temporary, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    await cp(path.join(builderRoot, 'package.json'), path.join(temporary, 'package.json'));
    await mkdir(path.join(temporary, 'src'));
    await cp(path.join(builderRoot, 'src/icons'), path.join(temporary, 'src/icons'), { recursive: true });
    const { records, page } = fixture();
    const contentDir = path.join(temporary, 'content');
    await writeFile(path.join(temporary, 'site.json'), JSON.stringify({ version: 1, url: 'https://example.test' }));
    await mkdir(path.join(temporary, 'assets'));
    await mkdir(path.join(temporary, 'public'));
    page.body = 'Hello **{{profile.name}}**. Email: {{contact.main.email}}.\n\n![Shared value test photo](./photo.png)';
    for (const record of records) {
      record.file = path.join(contentDir, record.collection, `${record.data.slug}.md`);
      await mkdir(path.dirname(record.file), { recursive: true });
      await writeFile(record.file, `---\n${stringify(record.data)}---\n${record.body}\n`);
    }
    await cp(path.join(builderRoot, 'tests/fixtures/image-privacy/gps-photo.png'), path.join(contentDir, 'pages/photo.png'));
    await writeFile(path.join(contentDir, 'pages/mdx.mdx'), `---\n${stringify({ ...page.data, slug: 'mdx', title: 'MDX {{profile.name}}' })}---\n<p>MDX kept intact.</p>\n`);
    generatedRoot = path.dirname(astroWorkspace(resolveSiteData(temporary).cacheKey, builderRoot, { CONTENT_PREVIEW: 'drafts' }).root);
    const build = async () => {
      const result = spawnSync(process.execPath, [await realpath(path.join(builderRoot, 'node_modules/.bin/astro')), 'build', '--config', path.relative(temporary, path.join(builderRoot, 'astro.config.mjs')), '--outDir', path.join(temporary, 'dist')], {
        cwd: temporary, encoding: 'utf8', timeout: 25_000,
        env: { ...process.env, SITE_DATA_DIR: temporary, CONTENT_PREVIEW: 'drafts', ASTRO_TELEMETRY_DISABLED: '1' },
      });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      return readFile(path.join(temporary, 'dist/index.html'), 'utf8');
    };
    let html = await build();
    assert.match(html, /<title>About Alex Investigator<\/title>/);
    assert.match(html, /name="description" content="Blockchain investigator"/);
    assert.match(html, /<strong>Alex Investigator<\/strong>/);
    assert.match(html.replace(/<[^>]*>/g, ''), /Email: personal@example\.test/);
    assert.match(html, /<img[^>]*src="\/_astro\/photo\.[^"]+"/);
    assert.doesNotMatch(html, /\{\{(?:profile|contact)\./);
    const mdxHtml = await readFile(path.join(temporary, 'dist/mdx/index.html'), 'utf8');
    assert.match(mdxHtml, /<title>MDX Alex Investigator<\/title>/);
    assert.match(mdxHtml, /<p>MDX kept intact\.<\/p>/);
    const profile = records.find((record) => record.collection === 'profile')! as Extract<ContentRecord, { collection: 'profile' }>;
    const contacts = records.find((record) => record.collection === 'contacts')! as Extract<ContentRecord, { collection: 'contacts' }>;
    profile.data.name = 'Updated Investigator';
    contacts.data.social!.email = 'updated@example.test';
    for (const record of [profile, contacts]) await writeFile(record.file, `---\n${stringify(record.data)}---\n${record.body}\n`);
    html = await build();
    assert.match(html, /<strong>Updated Investigator<\/strong>/);
    assert.match(html.replace(/<[^>]*>/g, ''), /Email: updated@example\.test/);
    assert.match(html, /<img[^>]*src="\/_astro\/photo\.[^"]+"/);
    assert.doesNotMatch(html, /personal@example\.test/);
    assert.match(await readFile(page.file, 'utf8'), /\{\{profile\.name\}\}/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
    if (generatedRoot) await rm(generatedRoot, { recursive: true, force: true });
  }
});
