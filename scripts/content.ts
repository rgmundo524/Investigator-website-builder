import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { createProcessor } from '@mdx-js/mdx';
import { schemas, relationships, type CollectionName, type ContentRecord } from '../src/content/schemas';
import { resolveSiteData } from './site-data';

export async function loadContent(root = resolveSiteData().contentDir): Promise<ContentRecord[]> {
  const records: ContentRecord[] = [];
  for (const collection of Object.keys(schemas) as CollectionName[]) {
    for (const file of await markdownFiles(path.join(root, collection))) {
      const source = (await readFile(file, 'utf8')).replace(/^\uFEFF/, '');
      const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
      if (!match) throw new Error(`${file}: expected YAML frontmatter enclosed by --- lines.`);
      const document = parseDocument(match[1], { uniqueKeys: true });
      if (document.errors.length) throw new Error(`${file}: ${document.errors.map((error) => error.message).join('; ')}`);
      const parsed = schemas[collection].safeParse(document.toJS());
      if (!parsed.success) {
        throw new Error(`${file}:\n${parsed.error.issues.map((issue) => `  ${issue.path.join('.') || 'frontmatter'}: ${issue.message}`).join('\n')}`);
      }
      const body = source.slice(match[0].length).trim();
      if (!body) throw new Error(`${file}: add the long description below the frontmatter.`);
      if (file.endsWith('.mdx')) createProcessor().parse({ path: file, value: body });
      records.push({ collection, data: parsed.data, body, file } as ContentRecord);
    }
  }
  const dataRoot = path.dirname(root);
  for (const record of records) {
    if (record.collection === 'profile' && record.data.cv
      && !existsSync(path.join(dataRoot, 'public', record.data.cv.url.slice(1)))) {
      throw new Error(`${record.file}: prepared CV is missing from public${record.data.cv.url}.`);
    }
    if (record.collection === 'pages' && record.data.slug === 'cv') {
      throw new Error(`${record.file}: cv is reserved for the generated professional CV.`);
    }
  }
  const networks = existsSync(path.join(dataRoot, 'site.json')) ? resolveSiteData(dataRoot).caseNetworks : undefined;
  validateRecords(records, { networks });
  return records;
}

async function markdownFiles(directory: string): Promise<string[]> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  const files = await Promise.all(entries.map(async (entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(file);
    return entry.isFile() && /\.mdx?$/.test(entry.name) ? [file] : [];
  }));
  return files.flat().sort();
}

export function validateRecords(records: ContentRecord[], options: { networks?: string[] } = {}): void {
  const index = new Map<string, ContentRecord>();
  const repositories = new Set<string>();
  for (const record of records) {
    const key = `${record.collection}/${record.data.slug}`;
    if (index.has(key)) throw new Error(`${record.file}: duplicate slug ${key}; also used by ${index.get(key)!.file}.`);
    index.set(key, record);
    if (record.collection === 'repositories') {
      const repository = `${record.data.owner}/${record.data.repository}`.toLowerCase();
      if (repositories.has(repository)) throw new Error(`${record.file}: duplicate GitHub repository ${repository}. Use one Markdown record per repository.`);
      repositories.add(repository);
    }
  }
  for (const record of records) {
    if (record.collection === 'cases') {
      const chart = index.get(`charts/${record.data.chart}`);
      if (chart?.collection === 'charts' && !chart.data.categories.some(({ id }) => id === record.data.category)) {
        throw new Error(`${record.file}: category references missing charts/${record.data.chart}/${record.data.category}.`);
      }
      if (options.networks) {
        const unknown = record.data.networks.filter((network) => !options.networks!.includes(network));
        if (unknown.length) throw new Error(`${record.file}: unknown network IDs: ${unknown.join(', ')}. Use or extend case_networks in site.json.`);
      }
      if (chart?.collection === 'charts' && chart.data.subcategory_paths.length) {
        const value = record.data.subcategory;
        const casePath = [record.data.category, ...(Array.isArray(value) ? value : value ? [value] : [])];
        if (!chart.data.subcategory_paths.some((allowed) => casePath.every((part, index) => allowed[index] === part))) {
          throw new Error(`${record.file}: classification is not a configured subcategory_paths prefix in charts/${chart.data.slug}.`);
        }
      }
    }
    for (const [field, collection] of Object.entries(relationships[record.collection] ?? {})) {
      const value = (record.data as unknown as Record<string, unknown>)[field];
      if (value === undefined) continue;
      const ids = typeof value === 'string' ? [value] : value as string[];
      if (new Set(ids).size !== ids.length) throw new Error(`${record.file}: duplicate reference in ${field}.`);
      for (const id of ids) {
        const target = index.get(`${collection}/${id}`);
        if (!target) throw new Error(`${record.file}: ${field} references missing ${collection}/${id}.`);
        if (record.data.publication_status === 'published' && target.data.publication_status !== 'published') {
          throw new Error(`${record.file}: published content references draft ${collection}/${id}. Publish both or remove the reference.`);
        }
        if (record.collection === 'pages' && target.collection === 'activities' && target.data.kind !== field) {
          throw new Error(`${record.file}: ${field} references ${id}, which belongs to ${target.data.kind}.`);
        }
        if (record.collection === 'pages' && target.collection === 'repositories') {
          const group = record.data.github_groups.find(({ id }) => id === target.data.group);
          if (!group) throw new Error(`${record.file}: repository ${id} references missing GitHub group ${target.data.group}.`);
          if (group.account && group.account.toLowerCase() !== target.data.owner.toLowerCase()) {
            throw new Error(`${record.file}: repository ${id} owner does not match GitHub group ${group.id}.`);
          }
        }
      }
    }
  }
}
