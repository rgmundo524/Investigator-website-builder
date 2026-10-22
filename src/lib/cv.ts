import type { CollectionEntry } from 'astro:content';

type Page = Pick<CollectionEntry<'pages'>, 'id' | 'data'>;
type Profile = Pick<CollectionEntry<'profile'>, 'id' | 'data'>;
type Entry = { id: string; data: { publication_status: string } };

// A CV is another view of the same visible profile and page selections. It must
// not become a way to discover drafts or records omitted from those pages.
export function cvSources<P extends Profile, C extends Page>(pages: C[], profiles: P[], includeDrafts = false) {
  const visible = (entry: Entry) => includeDrafts || entry.data.publication_status === 'published';
  const home = pages.find((entry) => entry.id === 'home' && visible(entry));
  if (!home) return undefined;
  const profile = profiles.find((entry) => entry.id === home.data.profile && visible(entry));
  if (!profile) return undefined;
  const page = (id: string) => pages.find((entry) => entry.id === id
    && entry.data.profile === profile.id && visible(entry));
  return { home, profile, workHistory: page('work-history'), credentials: page('credentials'), contact: page('contact') };
}

export function cvEntries<T extends Entry>(entries: T[], ids: string[], includeDrafts = false, all = false): T[] {
  const visible = (entry: T) => includeDrafts || entry.data.publication_status === 'published';
  if (all) return entries.filter(visible);
  return ids.map((id) => entries.find((entry) => entry.id === id))
    .filter((entry): entry is T => Boolean(entry && visible(entry)));
}
