import { z } from 'astro/zod';
import { caseDateRange, isCaseDate } from '../lib/case-dates';
import { caseMoneyMetrics } from '../lib/case-metadata';

const text = z.string().trim().min(1);
const slug = text.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase words separated by hyphens.');
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a quoted YYYY-MM date.');
const webUrl = z.url({ protocol: /^https?$/ });
const portraitImage = z.strictObject({
  image: text.regex(/^[a-z0-9-]+\.(png|jpe?g|webp)$/, 'Use an image filename from the selected assets directory.'),
  alt: text,
  source_url: webUrl.optional(),
});
const link = z.strictObject({ label: text, url: webUrl });
const contactDetails = {
  email: z.email().nullable().optional(),
  phone: z.strictObject({
    label: text,
    number: text.regex(/^\+[1-9]\d{6,14}$/, 'Use an international phone number, such as +19035550123.'),
  }).nullable().optional(),
};
const contactService = z.strictObject({
  id: slug, name: text, description: text,
  audience: text.optional(),
  primary: z.boolean().default(false),
  display_order: z.number().int().nonnegative().default(100),
  enabled: z.boolean().default(true),
  website: link.optional(), action: link,
  booking: z.strictObject({
    label: text,
    url: webUrl.refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.hostname === 'calendar.google.com'
          && /^\/calendar\/appointments\/schedules\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
      } catch { return false; }
    }, 'Use the full Google Calendar appointment schedule URL.'),
    enabled: z.boolean().default(true),
  }).optional(),
  ...contactDetails,
});
const refs = () => z.array(slug).default([]);
export const resourceCategory = z.enum(['first-steps', 'reporting', 'avoid-scams', 'reports']);
const githubAccount = text.regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/, 'Use a GitHub user or organization name.');
const githubRepository = text.regex(/^[A-Za-z0-9_.-]+$/, 'Use a repository name, without its owner or URL.')
  .refine((name) => name !== '.' && name !== '..', 'Use a repository name.');
const githubGroup = z.strictObject({
  id: slug, title: text,
  account: githubAccount.nullable(),
  enabled: z.boolean().default(true),
}).refine((group) => !group.enabled || group.account !== null, 'An enabled GitHub group needs an account name.');
const common = {
  slug,
  publication_status: z.enum(['draft', 'published']).default('draft'),
  description_short: text,
  blocks: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), text).default({}),
  links: z.array(link).default([]),
  editorial_note: text.optional(),
};
const aboutIcon = z.enum(['code', 'database', 'terminal', 'network', 'chart-no-axes-combined', 'chart-pie', 'hand-heart', 'users', 'landmark', 'bike', 'beer', 'box', 'mountain-snow', 'server', 'puzzle', 'shield-check', 'lightbulb']);
const aboutFields = {
  ...common, title: text,
  display_order: z.number().int().nonnegative().default(100),
  content_kind: z.enum(['profile', 'example']).default('profile'),
};
const reviewedAboutEntry = (entry: { content_kind: string; publication_status: string }) =>
  entry.content_kind !== 'example' || entry.publication_status !== 'published';
const exampleMessage = 'Replace example content with reviewed profile content before publishing.';

export const periodSchema = z.strictObject({ start: month, end: month.nullable() })
  .refine((period) => period.end === null || period.end >= period.start,
    { message: 'End month must be on or after start month.', path: ['end'] });

export const timelineSchema = z.strictObject({
  // null starts at January of the earliest recorded role.
  start: month.nullable().default(null),
  scale: z.number().min(0.75).max(1.75).default(1.2),
  levels: z.strictObject({
    desktop: z.number().int().min(2).max(8).default(3),
    mobile: z.number().int().min(2).max(8).default(5),
  }).default({ desktop: 3, mobile: 5 }),
}).default({ start: null, scale: 1.2, levels: { desktop: 3, mobile: 5 } });

const periods = z.array(periodSchema).superRefine((items, ctx) => {
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start));
  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1];
    if (previous.end === null || sorted[index].start <= previous.end) {
      ctx.addIssue({ code: 'custom', message: 'Employment periods must not overlap; only the last period may be open.' });
    }
  }
});

const highlights = z.array(z.strictObject({ id: slug, text })).default([])
  .refine((items) => new Set(items.map((item) => item.id)).size === items.length,
    'Each highlight must have a unique id.');

const caseCategories = z.array(z.strictObject({
  id: slug,
  label: text,
})).min(1).refine((items) => new Set(items.map(({ id }) => id)).size === items.length,
  'Each chart category must have a unique id.')
  .refine((items) => new Set(items.map(({ label }) => label.toLowerCase())).size === items.length,
    'Each chart category must have a unique label.');

export const schemas = {
  profile: z.strictObject({
    ...common, name: text, headline: text,
    location: text.optional(),
    cv: z.strictObject({
      url: text.regex(/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.pdf$/, 'Use a root-relative PDF path from your public directory, such as /files/professional-cv.pdf.'),
      label: text.optional(),
    }).optional(),
    portrait: z.union([
      portraitImage,
      z.strictObject({
        images: z.array(portraitImage).min(1)
          .refine((images) => new Set(images.map(({ image }) => image)).size === images.length, 'List each portrait filename once.'),
        autoplay: z.boolean().default(true),
        interval_ms: z.number().int().min(2000).max(60000).default(6000),
      }),
    ]).optional(),
  }),
  contacts: z.strictObject({
    ...common,
    services_heading: text,
    services: z.array(contactService).default([])
      .refine((items) => new Set(items.map(({ id }) => id)).size === items.length, 'Each service must have a unique id.')
      .refine((items) => items.filter((item) => item.enabled && item.primary).length <= 1, 'Choose at most one enabled primary contact route.'),
    social: z.strictObject({
      title: text, name: text, description: text,
      enabled: z.boolean().default(true),
      ...contactDetails,
      links: z.array(link).default([]),
    }).optional(),
  }),
  experience: z.strictObject({
    ...common, organization: text, role: text, location: text.optional(),
    periods, highlights, expertise: refs(), projects: refs(),
    display_order: z.number().int().min(0).optional(),
    active_position: z.boolean().optional(),
  }).superRefine((entry, ctx) => {
    if (!entry.periods.length && entry.active_position === undefined) ctx.addIssue({ code: 'custom', path: ['periods'], message: 'Supply employment periods, or active_position when dates are unknown.' });
    if (entry.periods.length && entry.active_position !== undefined) ctx.addIssue({ code: 'custom', path: ['active_position'], message: 'Current status is derived from known periods. Use active_position only when periods is empty.' });
  }),
  education: z.strictObject({
    ...common, institution: text, program: text,
    credential_type: z.enum(['degree', 'attendance']),
    start: month, end: month.nullable(),
    completion_status: z.enum(['completed', 'in_progress', 'not_completed', 'unspecified']),
  }).refine((entry) => entry.end === null || entry.end >= entry.start,
    { message: 'End month must be on or after start month.', path: ['end'] }),
  credentials: z.strictObject({
    ...common, name: text, issuer: text,
    credential_type: z.enum(['certification', 'certificate', 'training']),
    issued_year: z.number().int().min(1900).max(2200),
    expires_on: z.iso.date().optional(), verification_url: webUrl.optional(),
    course_url: webUrl.optional(),
    badge: z.strictObject({
      image: text.regex(/^[a-z0-9-]+\.(png|jpe?g|webp|svg)$/, 'Use an image filename from the selected assets/credentials directory.'),
      alt: text,
      source_url: webUrl.optional(),
    }).optional(),
    expertise: refs(),
  }),
  expertise: z.strictObject({ ...common, title: text }),
  projects: z.strictObject({
    ...common, title: text, contribution: text,
    experience: refs(), expertise: refs(),
  }),
  repositories: z.strictObject({
    ...common, title: text, contribution: text,
    owner: githubAccount, repository: githubRepository, group: slug,
    display_order: z.number().int().nonnegative().default(100),
    show_stats: z.boolean().default(true),
  }),
  skills: z.strictObject({
    ...aboutFields, group: text, icon: aboutIcon.default('code'),
    proficiency: z.number().min(1).max(5).multipleOf(0.5).nullable().default(null),
    assessed_on: z.iso.date().nullable().default(null),
  }).refine(reviewedAboutEntry, { message: exampleMessage, path: ['content_kind'] }),
  activities: z.strictObject({
    ...aboutFields, kind: z.enum(['volunteering', 'memberships', 'daos']),
    organization: text.optional(), role: text.optional(),
    participation: text.optional(), periods: periods.default([]),
    icon: aboutIcon.default('users'),
  }).refine(reviewedAboutEntry, { message: exampleMessage, path: ['content_kind'] }),
  interests: z.strictObject({ ...common, title: text, icon: aboutIcon.default('lightbulb') }),
  callouts: z.strictObject({ ...common, title: text }),
  charts: z.strictObject({
    ...common,
    title: text,
    categories: caseCategories,
    subcategory_paths: z.array(z.array(slug).min(1)).default([])
      .refine((paths) => new Set(paths.map((parts) => parts.join('/'))).size === paths.length,
        'List each classification path once.'),
  }).refine((chart) => chart.subcategory_paths.every((parts) => chart.categories.some(({ id }) => id === parts[0])),
    { path: ['subcategory_paths'], message: 'Each classification path must start with a category from this chart.' }),
  articles: z.strictObject({
    ...common, title: text,
    published_on: z.iso.date().nullable().default(null),
    updated_on: z.iso.date().nullable().default(null),
    tags: z.array(slug).default([]).refine((items) => new Set(items).size === items.length, 'Use each tag once.'),
    related_cases: refs(),
  }).superRefine((entry, ctx) => {
    if (entry.publication_status === 'published' && !entry.published_on) ctx.addIssue({ code: 'custom', path: ['published_on'], message: 'Published articles need a publication date.' });
    if (entry.updated_on && (!entry.published_on || entry.updated_on < entry.published_on)) ctx.addIssue({ code: 'custom', path: ['updated_on'], message: 'An update date requires a publication date and cannot precede it.' });
  }),
  resources: z.strictObject({
    ...common, title: text,
    category: resourceCategory,
    display_order: z.number().int().nonnegative().default(100),
    action_label: text.default('Open resource'),
    source: z.strictObject({
      url: webUrl, publisher: text, author: text.optional(),
      published_on: z.iso.date().nullable().default(null),
    }),
    reviewed_on: z.iso.date().nullable().default(null),
  }).superRefine((entry, ctx) => {
    if (entry.publication_status === 'published' && !entry.reviewed_on) ctx.addIssue({ code: 'custom', path: ['reviewed_on'], message: 'Published resources need a reviewed_on date for the destination and description.' });
  }),
  cases: z.strictObject({
    ...common,
    title: text,
    chart: slug,
    category: slug,
    // A scalar is one level; a list is one ordered path, never parallel tags.
    subcategory: z.union([slug, z.array(slug).min(1)]).nullable().default(null),
    content_kind: z.enum(['example', 'case_study']).default('example'),
    case_status: z.enum(['active', 'completed', 'on_hold', 'unspecified']).default('unspecified'),
    opened_on: z.string().refine(isCaseDate, 'Use a quoted YYYY, YYYY-MM, or YYYY-MM-DD date.').nullable().default(null),
    closed_on: z.string().refine(isCaseDate, 'Use a quoted YYYY, YYYY-MM, or YYYY-MM-DD date.').nullable().default(null),
    role: text.optional(),
    experience: slug.optional(),
    networks: z.array(slug).default([]).refine((items) => new Set(items).size === items.length, 'Use each network once per case.'),
    assets: z.array(text).default([]),
    jurisdictions: z.array(text).default([]),
    services: z.array(z.enum(['tracing', 'osint', 'forensic-report', 'expert-report', 'deposition', 'testimony'])).default([]),
    metrics: z.strictObject({
      addresses_reviewed: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().default(null),
      wallets_reviewed: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().default(null),
      transactions_reviewed: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().default(null),
      reported_loss_usd: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().default(null),
      assets_reviewed_usd: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().default(null),
      valuation_date: z.iso.date().nullable().default(null),
      amount_note: text.optional(),
      reported_loss_valuation_date: z.iso.date().nullable().default(null),
      reported_loss_note: text.optional(),
      assets_reviewed_valuation_date: z.iso.date().nullable().default(null),
      assets_reviewed_note: text.optional(),
    }).default({ addresses_reviewed: null, wallets_reviewed: null, transactions_reviewed: null, reported_loss_usd: null, assets_reviewed_usd: null, valuation_date: null, reported_loss_valuation_date: null, assets_reviewed_valuation_date: null }),
  }).superRefine((entry, ctx) => {
    const opened = entry.opened_on ? caseDateRange(entry.opened_on) : undefined;
    const closed = entry.closed_on ? caseDateRange(entry.closed_on) : undefined;
    if (opened && closed && closed.end < opened.start) ctx.addIssue({ code: 'custom', path: ['closed_on'], message: 'Closing date cannot precede opening date.' });
    if (entry.closed_on && entry.case_status !== 'completed') ctx.addIssue({ code: 'custom', path: ['closed_on'], message: 'Only completed cases can have a closing date.' });
    if (entry.content_kind === 'example' && entry.publication_status === 'published') ctx.addIssue({ code: 'custom', path: ['content_kind'], message: 'Examples remain drafts and cannot be published as real cases.' });
    for (const metric of caseMoneyMetrics(entry.metrics)) {
      if (metric.value !== null && (!metric.note || !metric.valuationDate)) ctx.addIssue({ code: 'custom', path: ['metrics', metric.field], message: `${metric.label} requires a valuation date and amount note, using its own fields or the shared valuation_date and amount_note.` });
    }
  }),
  pages: z.strictObject({
    ...common, title: text, profile: slug,
    contact: slug.optional(),
    github_groups: z.array(githubGroup).default([])
      .refine((items) => new Set(items.map((item) => item.id)).size === items.length, 'Each GitHub group needs a unique id.'),
    experience: refs(), education: refs(), credentials: refs(),
    expertise: refs(), projects: refs(), interests: refs(), callouts: refs(), charts: refs(),
    repositories: refs(), skills: refs(), volunteering: refs(), memberships: refs(), daos: refs(),
    skill_symbols: z.enum(['dots', 'stars']).default('dots'),
    skill_group_order: z.array(text).default([])
      .refine((items) => new Set(items).size === items.length, 'List each skill group once.'),
    organization_group_order: z.array(z.enum(['memberships', 'daos'])).length(2)
      .refine((items) => new Set(items).size === items.length, 'List memberships and daos once each.')
      .default(['memberships', 'daos']),
    resource_group_order: z.array(resourceCategory).min(1)
      .refine((items) => new Set(items).size === items.length, 'List each resource group once.')
      .default(['first-steps', 'reporting', 'avoid-scams', 'reports']),
    navigation: z.strictObject({ label: text, order: z.number().int().min(0) }).optional(),
    experience_source: z.enum(['selected', 'all']).default('selected'),
    credentials_source: z.enum(['selected', 'all']).default('selected'),
    issuer_order: z.array(text).default([]).refine((issuers) => new Set(issuers.map((issuer) => issuer.replace(/\s+/g, ' ').toLocaleLowerCase('en-US'))).size === issuers.length,
      'List each issuer once; capitalization and repeated spaces are ignored.'),
    timeline: timelineSchema,
    section_order: z.array(z.enum(['experience', 'biography', 'expertise', 'projects', 'credentials', 'education', 'interests', 'github', 'skills', 'volunteering', 'organizations', 'callouts', 'charts', 'articles', 'resources'])).default(['charts', 'experience', 'expertise', 'projects', 'credentials', 'education', 'interests', 'callouts'])
      .refine((items) => new Set(items).size === items.length, 'Each section can appear only once.'),
  }),
};

export type CollectionName = keyof typeof schemas;
export type ContentData<K extends CollectionName> = z.infer<(typeof schemas)[K]>;
export type ContentRecord = {
  [K in CollectionName]: { collection: K; data: ContentData<K>; body: string; file: string }
}[CollectionName];

// Relationships are declared once and checked before Astro loads any content.
export const relationships: Partial<Record<CollectionName, Record<string, CollectionName>>> = {
  experience: { expertise: 'expertise', projects: 'projects' },
  credentials: { expertise: 'expertise' },
  projects: { experience: 'experience', expertise: 'expertise' },
  cases: { chart: 'charts', experience: 'experience' },
  articles: { related_cases: 'cases' },
  pages: {
    profile: 'profile', contact: 'contacts', experience: 'experience', education: 'education',
    credentials: 'credentials', expertise: 'expertise', projects: 'projects',
    interests: 'interests', callouts: 'callouts', charts: 'charts',
    repositories: 'repositories', skills: 'skills', volunteering: 'activities', memberships: 'activities', daos: 'activities',
  },
};
