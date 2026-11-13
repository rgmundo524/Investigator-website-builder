import { caseVisuals, type CaseSunburstData } from '../src/lib/case-visuals';
import { readable, type CaseStudy, type Chart } from '../src/lib/cases';

type Data = Record<string, unknown>;
type ChartDocument = { collection: string | null; id: string; file: string; data: Data; draft?: { data: Data } };
export type EditorCaseCharts = { groups: CaseSunburstData[]; unclassifiedFiles: string[] };
const isSlug = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const text = (value: unknown, fallback: string) => typeof value === 'string' && value.trim() ? value : fallback;
const base = { publication_status: 'draft' as const, description_short: '', blocks: {}, links: [] };

/** Navigation reflects saved working drafts, without requiring publishable records. */
export function editorCaseCharts(documents: ChartDocument[]): EditorCaseCharts {
  const charts: Chart[] = [];
  const seen = new Set<string>();
  for (const document of documents.filter(({ collection }) => collection === 'charts')) {
    const data = document.draft?.data ?? document.data;
    const id = data.slug ?? document.id;
    if (!isSlug(id) || seen.has(id)) continue;
    seen.add(id);
    const categories: Chart['data']['categories'] = [];
    for (const candidate of Array.isArray(data.categories) ? data.categories : []) {
      if (!candidate || typeof candidate !== 'object' || !isSlug(candidate.id)
        || categories.some(({ id: category }) => category === candidate.id)) continue;
      categories.push({ id: candidate.id, label: text(candidate.label, readable(candidate.id)) });
    }
    charts.push({ id, data: { ...base, slug: id, title: text(data.title, readable(id)), categories } });
  }
  const studies: CaseStudy[] = [];
  const unclassifiedFiles: string[] = [];
  for (const document of documents.filter(({ collection }) => collection === 'cases')) {
    const data = document.draft?.data ?? document.data;
    const chart = charts.find(({ id }) => id === data.chart);
    const subcategory = data.subcategory ?? [];
    if (!chart || !chart.data.categories.some(({ id }) => id === data.category)
      || !Array.isArray(subcategory) || !subcategory.every(isSlug)) {
      unclassifiedFiles.push(document.file);
      continue;
    }
    // Only the fields needed by the shared visualization are projected. Invalid
    // dates, metrics, or publication fields must not hide a case being repaired.
    studies.push({ id: document.file, data: {
      ...base, slug: 'editor-case', title: text(data.title, document.id),
      description_short: text(data.description_short, ''),
      case_number: typeof data.case_number === 'string' ? data.case_number : undefined,
      chart: chart.id, category: data.category as string, subcategory: [...subcategory], content_kind: 'case_study',
      opened_on: typeof data.opened_on === 'string' ? data.opened_on : null,
      closed_on: typeof data.closed_on === 'string' ? data.closed_on : null,
      networks: Array.isArray(data.networks) ? data.networks.filter((value): value is string => typeof value === 'string') : [],
      off_chain_leads: [], assets: [], jurisdictions: [], services: [],
      metrics: { reported_loss_usd: null, assets_reviewed_usd: null },
    } });
  }
  return { groups: caseVisuals(charts, studies, 'case_study', true).groups, unclassifiedFiles };
}
