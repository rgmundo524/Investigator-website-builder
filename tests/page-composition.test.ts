import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { stringify } from 'yaml';
import { schemas, type ContentRecord } from '../src/content/schemas';
import { contactCtaDestination } from '../src/lib/contact-cta';
import { validateRecords } from '../scripts/content';
import { groupCredentials } from '../src/lib/credentials';

const root = fileURLToPath(new URL('..', import.meta.url));
const pageData = { slug: 'about', profile: 'person', title: 'About', description_short: 'Technical background.' };
const serviceData = {
  id: 'work', name: 'Example Agency', description: 'Professional enquiries.', email: 'agency@example.test',
  action: { label: 'Agency enquiry form', url: 'https://agency.example.test/report-fraud' },
  booking: { label: 'Book a conversation', url: 'https://calendar.google.com/calendar/appointments/schedules/ExampleSchedule' },
};

function fixture(): ContentRecord[] {
  return [{
    collection: 'profile', file: '/pack/content/profile/person.md', body: 'Biography.',
    data: schemas.profile.parse({ slug: 'person', publication_status: 'published', name: 'Example Person', headline: 'Investigator' }),
  }, {
    collection: 'contacts', file: '/pack/content/contacts/main.md', body: 'Contact introduction sentinel.',
    data: schemas.contacts.parse({ slug: 'main', publication_status: 'published', description_short: 'Contact details.', services_heading: 'Services', services: [serviceData] }),
  }, {
    collection: 'pages', file: '/pack/content/pages/about.md', body: 'Technical About introduction sentinel.',
    data: schemas.pages.parse({ ...pageData, publication_status: 'published', section_order: ['contact_cta'], contact_cta: { contact: 'main', service: 'work' } }),
  }];
}

test('compact sections and service contact invitations are optional explicit page settings', () => {
  const initial = schemas.pages.parse(pageData);
  assert.deepEqual(initial.compact_sections, []);
  assert.equal(initial.contact_cta, undefined);
  const configured = schemas.pages.parse({ ...pageData, compact_sections: ['expertise', 'projects'], contact_cta: { contact: 'main', service: 'work' }, section_order: ['expertise', 'contact_cta'] });
  assert.deepEqual(configured.compact_sections, ['expertise', 'projects']);
  assert.deepEqual(configured.contact_cta, { contact: 'main', service: 'work' });
  assert.equal(configured.contact, undefined, 'A closing invitation does not activate page-level contact cards');
  for (const compact_sections of [['expertise', 'expertise'], ['skills'], ['full']]) {
    assert.equal(schemas.pages.safeParse({ ...pageData, compact_sections }).success, false);
  }
  for (const contact_cta of [{ contact: 'main' }, { service: 'work' }, { contact: 'main', service: '' }, { contact: 'main', service: 'work', email: 'copied@example.test' }]) {
    assert.equal(schemas.pages.safeParse({ ...pageData, contact_cta }).success, false);
  }
});

test('pages own biography and ordered written sections with unique identifiers', () => {
  const empty = schemas.pages.parse(pageData);
  assert.equal(empty.biography, undefined);
  assert.deepEqual(empty.page_sections, []);
  const configured = schemas.pages.parse({ ...pageData, biography: 'Professional **background**.',
    page_sections: [{ id: 'approach', title: 'My approach', body: 'Evidence and explanation.' },
      { id: 'availability', title: 'Availability', body: 'Contact the team.' }],
    section_order: ['experience', 'page_sections', 'biography'] });
  assert.deepEqual(configured.page_sections.map(({ id }) => id), ['approach', 'availability']);
  assert.equal(schemas.pages.safeParse({ ...pageData, page_sections: [configured.page_sections[0], configured.page_sections[0]] }).success, false);
  assert.equal(schemas.pages.safeParse({ ...pageData, page_sections: [{ id: 'invalid id', title: 'Title', body: 'Text' }] }).success, false);
});

test('omitted page section lists include no implicit library sections', () => {
  const page = schemas.pages.parse({ ...pageData, expertise: ['analysis'], projects: ['tooling'] });
  assert.deepEqual(page.section_order, []);
  assert.deepEqual(page.expertise, ['analysis'], 'Stored references do not implicitly enable a section');
  assert.deepEqual(schemas.pages.parse({ ...pageData, section_order: ['expertise'] }).section_order, ['expertise'],
    'An explicitly included empty section retains the author’s placement intent');
});

test('curated credentials preserve the page order within issuers while automatic lists sort by year', () => {
  const entries = [{ id: 'older', data: { issuer: 'Authority', name: 'Earlier course', issued_year: 2020 } },
    { id: 'newer', data: { issuer: 'Authority', name: 'Later course', issued_year: 2025 } }];
  assert.deepEqual(groupCredentials(entries, [], true)[0].entries.map(({ id }) => id), ['older', 'newer']);
  assert.deepEqual(groupCredentials(entries)[0].entries.map(({ id }) => id), ['newer', 'older']);
  assert.deepEqual(entries.map(({ id }) => id), ['older', 'newer']);
});

test('contact invitations validate source visibility, service existence, and enabled status before applying', () => {
  assert.doesNotThrow(() => validateRecords(fixture()));
  for (const scenario of ['missing-contact', 'missing-service', 'disabled-service', 'draft-contact']) {
    const records = fixture();
    const page = records.find((entry) => entry.collection === 'pages')! as Extract<ContentRecord, { collection: 'pages' }>;
    const contact = records.find((entry) => entry.collection === 'contacts')! as Extract<ContentRecord, { collection: 'contacts' }>;
    if (scenario === 'missing-contact') page.data.contact_cta!.contact = 'missing';
    if (scenario === 'missing-service') page.data.contact_cta!.service = 'missing';
    if (scenario === 'disabled-service') contact.data.services[0].enabled = false;
    if (scenario === 'draft-contact') contact.data.publication_status = 'draft';
    assert.throws(() => validateRecords(records), (error: Error) => error.message.includes(page.file)
      && error.message.includes('contact_cta') && error.message.includes(scenario.split('-')[0]), scenario);
  }
  const draftRecords = fixture();
  for (const entry of draftRecords) entry.data.publication_status = 'draft';
  assert.doesNotThrow(() => validateRecords(draftRecords), 'Draft pages can preview draft contact records');
});

test('contact destinations reuse current booking, email, and action values in that priority', () => {
  const service = schemas.contacts.parse({ slug: 'main', description_short: 'Contacts.', services_heading: 'Services', services: [serviceData] }).services[0];
  assert.deepEqual(contactCtaDestination(service), { url: service.booking!.url, label: service.booking!.label, kind: 'booking' });
});

test('contact destinations skip disabled booking and never activate a disabled service', () => {
  const service = schemas.contacts.parse({ slug: 'main', description_short: 'Contacts.', services_heading: 'Services', services: [serviceData] }).services[0];
  service.booking!.enabled = false;
  assert.deepEqual(contactCtaDestination(service), { url: 'mailto:agency@example.test', label: 'Email Example Agency', kind: 'email' });
  service.email = 'updated@example.test';
  assert.equal(contactCtaDestination(service)?.url, 'mailto:updated@example.test');
  service.email = null;
  assert.deepEqual(contactCtaDestination(service), { ...service.action, kind: 'action' });
  service.enabled = false;
  assert.equal(contactCtaDestination(service), undefined);
});

test('static pages keep their own introduction, collapse opted-in sections, and resolve visible service destinations', { timeout: 60_000 }, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'page-composition-render-'));
  try {
    for (const directory of ['src/pages', 'src/components', 'src/layouts', 'src/lib', 'src/scripts', 'assets/organizations', 'assets/credentials']) {
      await mkdir(path.join(temporary, directory), { recursive: true });
    }
    await symlink(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    await cp(path.join(root, 'src/pages/[page].astro'), path.join(temporary, 'src/pages/[page].astro'));
    for (const name of ['ContentEntry', 'PageContactCta', 'PageHeader', 'PagePortrait', 'Portrait']) {
      await cp(path.join(root, `src/components/${name}.astro`), path.join(temporary, `src/components/${name}.astro`));
    }
    await cp(path.join(root, 'src/scripts/portrait-restore.js'), path.join(temporary, 'src/scripts/portrait-restore.js'));
    for (const name of ['CaseDashboard', 'ExperienceTimeline', 'ArticleList', 'ResourceList', 'CredentialGroups', 'ContactCards', 'GitHubProjects', 'SkillsSection', 'ActivitySection', 'OrganizationsSection', 'PersonalPhotos']) {
      await writeFile(path.join(temporary, `src/components/${name}.astro`), '<!-- Unused section fixture -->');
    }
    for (const name of ['content', 'experience', 'dates', 'site-settings', 'public-profile', 'education', 'image-privacy', 'contact-cta', 'page-markdown', 'portrait-carousel']) {
      await cp(path.join(root, `src/lib/${name}.ts`), path.join(temporary, `src/lib/${name}.ts`));
    }
    await writeFile(path.join(temporary, 'src/layouts/SiteLayout.astro'), '---\nconst { title } = Astro.props;\n---\n<html><head><title>{title}</title></head><body><slot /></body></html>');
    await writeFile(path.join(temporary, 'package.json'), '{"type":"module","dependencies":{"@iconify-json/lucide":"1.2.129"}}');
    await writeFile(path.join(temporary, 'astro.config.mjs'), `
import { defineConfig } from 'astro/config';
import icon from 'astro-icon';
export default defineConfig({ output: 'static', cacheDir: './.astro-cache', integrations: [icon()],
  vite: { cacheDir: './.vite-cache', define: { __SITE_SETTINGS__: JSON.stringify({ locale: 'en-US' }) }, resolve: { alias: { '@site-assets': ${JSON.stringify(path.join(temporary, 'assets'))} } } },
});
`);
    await writeFile(path.join(temporary, 'src/content.config.ts'), `
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
const names = ['pages','profile','contacts','expertise','projects','experience','education','credentials','interests','callouts','charts'];
export const collections = Object.fromEntries(names.map((name) => [name, defineCollection({ loader: glob({ pattern: '*.md', base: './src/content/' + name }) })]));
`);
    const records = fixture();
    const about = records.find((entry) => entry.collection === 'pages')! as Extract<ContentRecord, { collection: 'pages' }>;
    const contact = records.find((entry) => entry.collection === 'contacts')! as Extract<ContentRecord, { collection: 'contacts' }>;
    about.data.section_order = ['expertise', 'projects', 'page_sections', 'biography', 'contact_cta'];
    about.data.biography = 'Page-owned **biography sentinel**.\n\nA separate paragraph.';
    about.data.page_sections = [{ id: 'approach', title: 'Written approach sentinel', body: 'Clear **findings**.\n\n- First item\n- Second item' },
      { id: 'availability', title: 'Written availability sentinel', body: 'Discuss an engagement.' }];
    about.data.compact_sections = ['expertise', 'projects'];
    about.data.expertise = ['analysis'];
    about.data.projects = ['tooling'];
    about.data.blocks = { contact_heading: 'Discuss your investigation', contact_description: 'A concise invitation.', contact_button_label: 'Talk with the investigator' };
    contact.data.services.push({ ...contact.data.services[0], id: 'email', booking: undefined },
      { ...contact.data.services[0], id: 'action', booking: undefined, email: null },
      { ...contact.data.services[0], id: 'disabled', enabled: false });
    records.push({ collection: 'expertise', file: '', body: 'Full expertise details sentinel.', data: schemas.expertise.parse({ slug: 'analysis', publication_status: 'published', title: 'Technical analysis', description_short: 'Expertise summary.' }) },
      { collection: 'projects', file: '', body: 'Full project details sentinel.', data: schemas.projects.parse({ slug: 'tooling', publication_status: 'published', title: 'Investigation tools', contribution: 'Tool development', description_short: 'Project summary.' }) },
      { ...structuredClone(contact), data: { ...structuredClone(contact.data), slug: 'private', publication_status: 'draft' } });
    for (const [slug, reference] of [['email', { contact: 'main', service: 'email' }], ['action', { contact: 'main', service: 'action' }], ['disabled', { contact: 'main', service: 'disabled' }], ['private', { contact: 'private', service: 'work' }], ['none', undefined]] as const) {
      records.push({ ...structuredClone(about), data: { ...structuredClone(about.data), slug, expertise: [], contact_cta: reference ? { ...reference } : undefined, compact_sections: [], section_order: ['contact_cta'] } });
    }
    const analysis = records.find((entry) => entry.collection === 'expertise')! as Extract<ContentRecord, { collection: 'expertise' }>;
    records.push({ ...structuredClone(analysis), data: { ...structuredClone(analysis.data), slug: 'standard-analysis' } });
    records.push({ ...structuredClone(about), data: { ...structuredClone(about.data), slug: 'standard', expertise: ['standard-analysis'], compact_sections: [], contact_cta: undefined, section_order: ['expertise', 'projects'] } });
    records.push({ ...structuredClone(about), data: schemas.pages.parse({ ...pageData, slug: 'implicit', publication_status: 'published', expertise: ['analysis'], projects: ['tooling'] }) });
    records.push({ ...structuredClone(about), data: schemas.pages.parse({ ...pageData, slug: 'empty-selected', publication_status: 'published', section_order: ['expertise'] }) });
    for (const record of records) {
      const directory = path.join(temporary, 'src/content', record.collection);
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, `${record.data.slug}.md`), `---\n${stringify(record.data)}---\n${record.body}\n`);
    }
    const build = spawnSync(process.execPath, [await realpath(path.join(root, 'node_modules/.bin/astro')), 'build'], {
      cwd: temporary, encoding: 'utf8', timeout: 55_000, env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', CONTENT_PREVIEW: '' },
    });
    assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
    const html = await readFile(path.join(temporary, 'dist/about/index.html'), 'utf8');
    assert.match(html, /Technical About introduction sentinel/);
    assert.doesNotMatch(html, /Contact introduction sentinel/);
    assert.match(html, /class="[^"]*\bcompact-expertise\b/);
    assert.equal((html.match(/<details>/g) ?? []).length, 2);
    assert.match(html, /Full expertise details sentinel/);
    assert.match(html, /Full project details sentinel/);
    assert.match(html, /Page-owned <strong>biography sentinel<\/strong>/);
    assert.match(html, /<strong>findings<\/strong>/);
    assert.match(html, /<li>First item<\/li>/);
    assert.doesNotMatch(html, />Biography\.</, 'The profile body is saved source, not page text');
    assert.ok(html.indexOf('page-section-approach') > html.indexOf('section-projects'));
    assert.ok(html.indexOf('Written availability sentinel') > html.indexOf('Written approach sentinel'));
    assert.ok(html.indexOf('Page-owned') > html.indexOf('Written availability sentinel'));
    assert.ok(html.indexOf('section-contact_cta') > html.indexOf('section-projects'));
    assert.match(html, /Discuss your investigation/);
    assert.match(html, /A concise invitation/);
    assert.match(html, /Talk with the investigator/);
    assert.match(html, /href="https:\/\/calendar\.google\.com\/calendar\/appointments\/schedules\/ExampleSchedule"/);
    assert.doesNotMatch(html, /agency\.example\.test\/report-fraud|mailto:/);
    const standard = await readFile(path.join(temporary, 'dist/standard/index.html'), 'utf8');
    assert.doesNotMatch(standard, /class="[^"]*\bcompact-expertise\b|<details>|section-contact_cta/);
    assert.doesNotMatch(standard, /biography sentinel|Written approach sentinel/, 'Unlisted sections stay out of the output');
    assert.match(standard, /Full expertise details sentinel/);
    for (const slug of ['implicit', 'empty-selected']) {
      const omitted = await readFile(path.join(temporary, `dist/${slug}/index.html`), 'utf8');
      assert.match(omitted, /Technical About introduction sentinel/);
      assert.doesNotMatch(omitted, /id="section-expertise"|id="section-projects"|Full expertise details sentinel|Full project details sentinel/);
    }
    assert.match(await readFile(path.join(temporary, 'dist/email/index.html'), 'utf8'), /href="mailto:agency@example.test"/);
    assert.match(await readFile(path.join(temporary, 'dist/action/index.html'), 'utf8'), /href="https:\/\/agency\.example\.test\/report-fraud"/);
    for (const slug of ['disabled', 'private', 'none']) {
      const hidden = await readFile(path.join(temporary, `dist/${slug}/index.html`), 'utf8');
      assert.doesNotMatch(hidden, /section-contact_cta|Talk with the investigator|mailto:|ExampleSchedule/);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
