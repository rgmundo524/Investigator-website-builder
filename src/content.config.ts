import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { schemas, type CollectionName } from './content/schemas';
import { loadContent } from '../scripts/content';
import { resolveSiteData } from '../scripts/site-data';
import { sharedPageLoader } from '../scripts/shared-page-loader';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Also validate direct `astro dev` / `astro build` calls, not just npm scripts.
const { contentDir } = resolveSiteData();
const records = await loadContent(contentDir);

function loader(name: CollectionName) {
  // An empty function loader clears old entries. Astro's glob loader otherwise
  // returns early for an empty folder, retaining records from its last build.
  if (!records.some(({ collection }) => collection === name)) return async () => [];
  return glob({
    pattern: '**/*.{md,mdx}', base: pathToFileURL(`${path.join(contentDir, name)}/`),
    generateId: ({ data }) => String(data.slug),
  });
}

export const collections = {
  profile: defineCollection({ loader: loader('profile'), schema: schemas.profile }),
  contacts: defineCollection({ loader: loader('contacts'), schema: schemas.contacts }),
  experience: defineCollection({ loader: loader('experience'), schema: schemas.experience }),
  education: defineCollection({ loader: loader('education'), schema: schemas.education }),
  credentials: defineCollection({ loader: loader('credentials'), schema: schemas.credentials }),
  // Library records are reusable; pages own portraits, skill groups, selections, order and written sections.
  expertise: defineCollection({ loader: loader('expertise'), schema: schemas.expertise }),
  projects: defineCollection({ loader: loader('projects'), schema: schemas.projects }),
  repositories: defineCollection({ loader: loader('repositories'), schema: schemas.repositories }),
  skills: defineCollection({ loader: loader('skills'), schema: schemas.skills }),
  activities: defineCollection({ loader: loader('activities'), schema: schemas.activities }),
  interests: defineCollection({ loader: loader('interests'), schema: schemas.interests }),
  callouts: defineCollection({ loader: loader('callouts'), schema: schemas.callouts }),
  charts: defineCollection({ loader: loader('charts'), schema: schemas.charts }),
  cases: defineCollection({ loader: loader('cases'), schema: schemas.cases }),
  articles: defineCollection({ loader: loader('articles'), schema: schemas.articles }),
  resources: defineCollection({ loader: loader('resources'), schema: schemas.resources }),
  // Page composition includes compact previews and a shared-service enquiry;
  // these remain independent of the contact-directory introduction.
  // Page sections are explicitly included; an omitted section_order is empty.
  pages: defineCollection({ loader: sharedPageLoader(contentDir), schema: schemas.pages }),
};
