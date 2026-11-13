import { z } from 'astro/zod';
import { OFF_CHAIN_LEAD_TYPES } from '../lib/off-chain-leads';
import { credentialIssuerKey } from '../lib/credentials';
import { SUPPORTED_CONTENT_ICON_NAMES } from '../config/content-icons';

const text = z.string().trim().min(1);
const slug = text.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase words separated by hyphens.');
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a quoted YYYY-MM date.');
const webUrl = z.url({ protocol: /^https?$/ });
const portraitImage = z.strictObject({
  image: text.regex(/^[a-z0-9-]+\.(png|jpe?g|webp)$/, 'Use an image filename from the selected assets directory.'),
  alt: text,
  source_url: webUrl.optional(),
});
const pagePortrait = z.strictObject({
  enabled: z.boolean().default(true),
  images: z.array(portraitImage).default([])
    .refine((images) => new Set(images.map(({ image }) => image)).size === images.length, 'List each portrait filename once.'),
  autoplay: z.boolean().default(true),
  interval_ms: z.number().int().min(2000).max(60000).default(6000),
  caption: text.optional(),
}).refine((portrait) => !portrait.enabled || portrait.images.length > 0,
  { message: 'Choose at least one portrait or turn off the portrait on this page.', path: ['images'] });
const personalPhoto = z.strictObject({
  image: text.regex(/^[a-z0-9-]+\.(png|jpe?g|webp)$/, 'Use an image filename from the selected assets/images/personal directory.'),
  alt: text,
  caption: text,
});
const organizationLogo = z.strictObject({
  image: text.regex(/^[a-z0-9-]+\.(png|jpe?g|webp)$/, 'Use an image filename from the selected assets/organizations directory.'),
  alt: text,
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

const pageSkillGroups = z.array(z.strictObject({ name: text, skills: refs() })).default([])
  .superRefine((groups, ctx) => {
    const names = new Set<string>();
    const skills = new Set<string>();
    groups.forEach((group, groupIndex) => {
      const name = group.name.replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
      if (names.has(name)) ctx.addIssue({ code: 'custom', path: [groupIndex, 'name'],
        message: 'Each skill group needs a unique name; capitalization and repeated spaces are ignored.' });
      names.add(name);
      group.skills.forEach((id, skillIndex) => {
        if (skills.has(id)) ctx.addIssue({ code: 'custom', path: [groupIndex, 'skills', skillIndex],
          message: 'Select each skill only once on this page.' });
        skills.add(id);
      });
    });
  });
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
const aboutIcon = z.enum(SUPPORTED_CONTENT_ICON_NAMES, { error: 'Choose an available Lucide icon.' });
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
    // Retain optional source summaries without asking for text the website never displays.
    description_short: text.optional(),
    location: text.optional(),
    show_location: z.boolean().default(false),
  }).refine((entry) => !entry.show_location || Boolean(entry.location),
    { message: 'Enter a location before showing it on the website.', path: ['location'] }),
  contacts: z.strictObject({
    ...common,
    services_heading: text,
    services: z.array(contactService).default([])
      .refine((items) => new Set(items.map(({ id }) => id)).size === items.length, 'Each service must have a unique id.'),
    social: z.strictObject({
      title: text, name: z.string().trim().optional(), description: text,
      enabled: z.boolean().default(true),
      ...contactDetails,
      links: z.array(link).default([]),
    }).optional(),
  }),
  experience: z.strictObject({
    ...common, organization: text, role: text, location: text.optional(),
    logo: organizationLogo.optional(),
    show_location: z.boolean().default(false),
    periods, highlights, expertise: refs(), projects: refs(),
    display_order: z.number().int().min(0).optional(),
    active_position: z.boolean().optional(),
  }).superRefine((entry, ctx) => {
    if (entry.show_location && !entry.location) ctx.addIssue({ code: 'custom', path: ['location'], message: 'Enter a location before showing it on the website.' });
    if (!entry.periods.length && entry.active_position === undefined) ctx.addIssue({ code: 'custom', path: ['periods'], message: 'Supply employment periods, or active_position when dates are unknown.' });
    if (entry.periods.length && entry.active_position !== undefined) ctx.addIssue({ code: 'custom', path: ['active_position'], message: 'Current status is derived from known periods. Use active_position only when periods is empty.' });
  }),
  education: z.strictObject({
    ...common, institution: text, program: text,
    logo: organizationLogo.optional(),
    credential_type: z.enum(['degree', 'attendance']),
    start: month, end: month.nullable(),
    completion_status: z.enum(['completed', 'in_progress', 'not_completed', 'unspecified']).optional(),
  }).refine((entry) => entry.end === null || entry.end >= entry.start,
    { message: 'End month must be on or after start month.', path: ['end'] }),
  credentials: z.strictObject({
    ...common, name: text, issuer: text,
    credential_type: z.enum(['certification', 'certificate', 'training']).optional(),
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
    ...aboutFields, icon: aboutIcon.default('code'),
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
  }),
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
    case_number: text.optional(),
    scope_summary: text.optional(),
    chart: slug,
    category: slug,
    // One ordered path, never parallel tags. An empty path is unspecified.
    subcategory: z.array(slug).default([]),
    content_kind: z.enum(['example', 'case_study']).default('example'),
    opened_on: z.iso.date().nullable().default(null),
    closed_on: z.iso.date().nullable().default(null),
    role: text.optional(),
    networks: z.array(slug).default([]).refine((items) => new Set(items).size === items.length, 'Use each network once per case.'),
    off_chain_leads: z.array(z.enum(OFF_CHAIN_LEAD_TYPES.map(({ id }) => id))).default([])
      .refine((items) => new Set(items).size === items.length, 'Use each off-chain lead type once per case.'),
    assets: z.array(text).default([]),
    jurisdictions: z.array(text).default([]),
    services: z.array(z.enum(['tracing', 'osint', 'forensic-report', 'expert-report', 'deposition', 'testimony'])).default([]),
    metrics: z.strictObject({
      reported_loss_usd: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().default(null),
      assets_reviewed_usd: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().default(null),
      amount_note: text.optional(),
    }).default({ reported_loss_usd: null, assets_reviewed_usd: null }),
  }).superRefine((entry, ctx) => {
    if (entry.closed_on && entry.opened_on && entry.closed_on < entry.opened_on) ctx.addIssue({ code: 'custom', path: ['closed_on'], message: 'Closing date cannot precede opening date.' });
    if (entry.content_kind === 'example' && entry.publication_status === 'published') ctx.addIssue({ code: 'custom', path: ['content_kind'], message: 'Examples remain drafts and cannot be published as real cases.' });
  }),
  pages: z.strictObject({
    ...common, title: text, profile: slug,
    portrait: pagePortrait.optional(),
    biography: text.optional(),
    page_sections: z.array(z.strictObject({ id: slug, title: text, body: text })).default([])
      .refine((sections) => new Set(sections.map(({ id }) => id)).size === sections.length, 'Each written section needs a unique id.'),
    contact: slug.optional(),
    contact_cta: z.strictObject({ contact: slug, service: slug }).optional(),
    compact_sections: z.array(z.enum(['expertise', 'projects'])).default([])
      .refine((items) => new Set(items).size === items.length, 'List each compact section once.'),
    personal_photos: z.array(personalPhoto).default([])
      .refine((photos) => new Set(photos.map(({ image }) => image)).size === photos.length, 'List each personal photo filename once.'),
    github_groups: z.array(githubGroup).default([])
      .refine((items) => new Set(items.map((item) => item.id)).size === items.length, 'Each GitHub group needs a unique id.'),
    experience: refs(), education: refs(), credentials: refs(),
    expertise: refs(), projects: refs(), interests: refs(), callouts: refs(), charts: refs(),
    repositories: refs(), volunteering: refs(), memberships: refs(), daos: refs(),
    skill_groups: pageSkillGroups,
    skill_symbols: z.enum(['dots', 'stars']).default('dots'),
    organization_group_order: z.array(z.enum(['memberships', 'daos'])).length(2)
      .refine((items) => new Set(items).size === items.length, 'List memberships and daos once each.')
      .default(['memberships', 'daos']),
    resource_group_order: z.array(resourceCategory).min(1)
      .refine((items) => new Set(items).size === items.length, 'List each resource group once.')
      .default(['first-steps', 'reporting', 'avoid-scams', 'reports']),
    navigation: z.strictObject({ label: text, order: z.number().int().min(0) }).optional(),
    experience_source: z.enum(['selected', 'all']).default('selected'),
    credentials_source: z.enum(['selected', 'all']).default('selected'),
    issuer_order: z.array(text).default([]).refine((issuers) => new Set(issuers.map(credentialIssuerKey)).size === issuers.length,
      'List each issuer once; capitalization and repeated spaces are ignored.'),
    issuer_logos: z.array(z.strictObject({
      issuer: text,
      image: text.regex(/^[a-z0-9-]+\.(png|jpe?g|webp)$/, 'Use an image filename from the selected assets/organizations directory.'),
      alt: text,
    })).default([]).refine((logos) => new Set(logos.map(({ issuer }) => credentialIssuerKey(issuer))).size === logos.length,
      'Add only one logo per issuer; capitalization and repeated spaces are ignored.'),
    timeline: timelineSchema,
    section_order: z.array(z.enum(['experience', 'biography', 'page_sections', 'expertise', 'projects', 'credentials', 'education', 'interests', 'personal_photos', 'github', 'skills', 'volunteering', 'organizations', 'callouts', 'charts', 'articles', 'resources', 'contact_cta'])).default([])
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
  cases: { chart: 'charts' },
  articles: { related_cases: 'cases' },
  pages: {
    profile: 'profile', contact: 'contacts', experience: 'experience', education: 'education',
    credentials: 'credentials', expertise: 'expertise', projects: 'projects',
    interests: 'interests', callouts: 'callouts', charts: 'charts',
    repositories: 'repositories', skill_groups: 'skills', volunteering: 'activities', memberships: 'activities', daos: 'activities',
  },
};
