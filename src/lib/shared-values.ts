import { createProcessor } from '@mdx-js/mdx';
import type { ContentRecord } from '../content/schemas';
import { publicLocation } from './public-profile';

type PageRecord = Extract<ContentRecord, { collection: 'pages' }>;
type PositionNode = {
  type: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: PositionNode[];
};

const tokenPattern = /\{\{([^{}]*?)\}\}/g;
const slug = '[a-z0-9]+(?:-[a-z0-9]+)*';
const personalContact = new RegExp(`^contact\\.(${slug})\\.(email|phone)$`);
const serviceContact = new RegExp(`^contact\\.(${slug})\\.service\\.(${slug})\\.(name|email|phone|website)$`);
const markdownPunctuation = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~');

function sharedError(page: PageRecord, field: string, token: string, detail: string): never {
  throw new Error(`${page.file}: ${field}: shared value {{${token}}} ${detail}`);
}

function sharedValue(page: PageRecord, records: ContentRecord[], token: string, field: string): string {
  const fail = (detail: string): never => sharedError(page, field, token, detail);
  const find = <K extends 'profile' | 'contacts'>(collection: K, id: string) => {
    const record = records.find((entry) => entry.collection === collection && entry.data.slug === id);
    if (!record) return fail(`refers to missing ${collection}/${id}.`);
    if (page.data.publication_status === 'published' && record.data.publication_status !== 'published') {
      return fail(`uses draft ${collection}/${id}. Publish that record before publishing this page.`);
    }
    return record as Extract<ContentRecord, { collection: K }>;
  };
  let value: string | undefined | null;
  if (['profile.name', 'profile.headline', 'profile.location'].includes(token)) {
    const profile = find('profile', page.data.profile).data;
    value = token === 'profile.name' ? profile.name
      : token === 'profile.headline' ? profile.headline : publicLocation(profile);
    if (token === 'profile.location' && !profile.show_location) return fail('is hidden. Enable the profile’s location display or remove this reference.');
  } else {
    const personal = token.match(personalContact);
    const organization = token.match(serviceContact);
    if (personal) {
      const social = find('contacts', personal[1]).data.social;
      if (!social?.enabled) return fail('is unavailable because the personal contact card is disabled or missing.');
      value = personal[2] === 'email' ? social.email : social.phone?.label;
    } else if (organization) {
      const service = find('contacts', organization[1]).data.services.find(({ id }) => id === organization[2]);
      if (!service?.enabled) return fail(`is unavailable because service ${organization[2]} is disabled or missing.`);
      switch (organization[3]) {
        case 'name': value = service.name; break;
        case 'email': value = service.email; break;
        case 'phone': value = service.phone?.label; break;
        case 'website': value = service.website?.url; break;
      }
    } else return fail('is not supported. Insert a value from the shared-values menu.');
  }
  if (!value?.trim()) return fail('has no saved value. Fill it in at its source or remove this reference.');
  if (value.includes('{{')) return fail('contains another shared-value reference. Shared values must contain their final text.');
  return value;
}

function markdownText(value: string): string {
  // Values are prose, never Markdown, HTML, URLs to execute, or new block syntax.
  return [...value.replace(/[\r\n\t]+/g, ' ')].map((character) => {
    if (character === '&') return '&amp;';
    if (character === '<') return '&lt;';
    if (character === '>') return '&gt;';
    return markdownPunctuation.has(character) ? `\\${character}` : character;
  }).join('');
}

function proseRanges(body: string): [number, number][] {
  const ranges: [number, number][] = [];
  const tree = createProcessor({ format: 'md' }).parse(body) as PositionNode;
  const visit = (node: PositionNode) => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (node.type === 'text' && start !== undefined && end !== undefined) ranges.push([start, end]);
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  return ranges;
}

function resolveText(page: PageRecord, records: ContentRecord[], value: string, field: string, markdown = false): string {
  if (!value.includes('{{')) return value;
  if (markdown && field === 'body' && page.file.endsWith('.mdx')) {
    return sharedError(page, field, '…', 'is not supported in MDX bodies. Use a Markdown (.md) page for shared values in prose.');
  }
  const ranges = markdown ? proseRanges(value) : [];
  let lastEnd = 0;
  const result = value.replace(tokenPattern, (match, rawToken: string, offset: number) => {
    if (value.slice(lastEnd, offset).includes('{{')) return sharedError(page, field, '…', 'is incomplete. Use the complete reference from the shared-values menu.');
    lastEnd = offset + match.length;
    const token = rawToken.trim();
    if (markdown && !ranges.some(([start, end]) => start <= offset && end >= lastEnd)) {
      return sharedError(page, field, token, 'must appear in ordinary prose, not code, HTML, or a link/image destination.');
    }
    const resolved = sharedValue(page, records, token, field);
    return markdown ? markdownText(resolved) : resolved;
  });
  if (value.slice(lastEnd).includes('{{')) return sharedError(page, field, '…', 'is incomplete. Use the complete reference from the shared-values menu.');
  return result;
}

/** Resolve only public page text. Content files and editor values remain untouched. */
export function resolveSharedPage(page: PageRecord, records: ContentRecord[]): PageRecord {
  return {
    ...page,
    data: {
      ...page.data,
      title: resolveText(page, records, page.data.title, 'title'),
      description_short: resolveText(page, records, page.data.description_short, 'description_short'),
      ...(page.data.biography ? { biography: resolveText(page, records, page.data.biography, 'biography', true) } : {}),
      page_sections: (page.data.page_sections ?? []).map((section, index) => ({ ...section,
        title: resolveText(page, records, section.title, `page_sections.${index}.title`),
        body: resolveText(page, records, section.body, `page_sections.${index}.body`, true),
      })),
      blocks: Object.fromEntries(Object.entries(page.data.blocks).map(([key, value]) => [key, resolveText(page, records, value, `blocks.${key}`)])),
    },
    body: resolveText(page, records, page.body, 'body', true),
  };
}

export function validateSharedPages(records: ContentRecord[]): void {
  for (const record of records) if (record.collection === 'pages') resolveSharedPage(record, records);
}
