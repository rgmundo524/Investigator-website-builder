import type { ContentData } from '../content/schemas';

type Article = { id: string; data: ContentData<'articles'> };
type ArticlePage = { id: string; data: Pick<ContentData<'pages'>, 'publication_status' | 'section_order'> };

// An article section may live on any page. Keep route availability and return
// links tied to the same visible section, rather than a required page filename.
export function articleIndexPage<T extends ArticlePage>(pages: T[], includeDrafts: boolean): T | undefined {
  return pages.filter(({ data }) => (includeDrafts || data.publication_status === 'published')
    && data.section_order.includes('articles'))
    .sort((a, b) => Number(b.id === 'articles') - Number(a.id === 'articles') || a.id.localeCompare(b.id))[0];
}

export function visibleArticles<T extends Article>(entries: T[], includeDrafts: boolean): T[] {
  return entries.filter(({ data }) => includeDrafts || data.publication_status === 'published')
    .sort((a, b) => (b.data.published_on ?? '').localeCompare(a.data.published_on ?? '') || a.id.localeCompare(b.id));
}

export function articleDate(date: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}
