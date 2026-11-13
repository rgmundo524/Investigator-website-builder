import type { ContentData } from '../content/schemas';

type CardSection = 'expertise' | 'projects';
type SectionPage = {
  id: string;
  data: Pick<ContentData<'pages'>, 'publication_status' | 'section_order' | CardSection>;
};
type SectionRecord = { id: string; data: { publication_status: 'draft' | 'published' } };

/** Link to a page that actually renders the selected records in a full section. */
export function sectionDestination(pages: SectionPage[], section: CardSection, records: SectionRecord[],
  { includeDrafts = false, recordId }: { includeDrafts?: boolean; recordId?: string } = {}): string | undefined {
  const visible = new Set(records.filter(({ data }) => includeDrafts || data.publication_status === 'published').map(({ id }) => id));
  if (recordId && !visible.has(recordId)) return undefined;
  const preferred = section === 'expertise' ? 'work-history' : 'casework';
  const page = pages.filter(({ id, data }) => id !== 'home' && (includeDrafts || data.publication_status === 'published')
    && data.section_order.includes(section)
    && (recordId ? data[section].includes(recordId) : data[section].some((id) => visible.has(id))))
    .sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred) || a.id.localeCompare(b.id))[0];
  return page ? `/${page.id}/#${recordId ?? `section-${section}`}` : undefined;
}
