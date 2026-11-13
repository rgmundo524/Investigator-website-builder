import { categoryUrl } from './charts';
import type { ContentData } from '../content/schemas';

export type CaseStudy = { id: string; data: ContentData<'cases'> };
export type Chart = { id: string; data: ContentData<'charts'> };
export type CaseKind = CaseStudy['data']['content_kind'];
export const caseTitle = (data: Pick<CaseStudy['data'], 'case_number' | 'title'>) => data.case_number ? `Case ${data.case_number}` : data.title;
export const readable = (value: string) => value.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

export const subcategoryPath = (study: CaseStudy): string[] => {
  const value = study.data.subcategory;
  return value.length ? [...value] : ['unspecified'];
};
export const subcategoryId = (study: CaseStudy) => subcategoryPath(study)[0];
export const subcategoryAnchor = (kind: CaseKind, id: string) => `subcategory-${kind}-${id}`;

// Call with one category/dataset. Subcategories are discovered from case files,
// without maintaining another central category list.
export function caseSubcategories<S extends CaseStudy>(studies: S[]) {
  const groups = new Map<string, S[]>();
  for (const study of studies) {
    const id = subcategoryId(study);
    const group = groups.get(id) ?? [];
    group.push(study);
    groups.set(id, group);
  }
  return [...groups].map(([id, records]) => ({ id, label: readable(id), count: records.length, studies: records }))
    .sort((a, b) => a.id === 'unspecified' ? 1 : b.id === 'unspecified' ? -1 : a.label.localeCompare(b.label));
}

export function eligibleCases<C extends Chart, S extends CaseStudy>(charts: C[], studies: S[], includeDrafts = false): S[] {
  const chartIds = new Set(charts.filter(({ data }) => includeDrafts || data.publication_status === 'published').map(({ id }) => id));
  return studies.filter(({ data }) => chartIds.has(data.chart) && (includeDrafts || data.publication_status === 'published')
    && (includeDrafts || data.content_kind === 'case_study'))
    .sort((a, b) => (b.data.opened_on ?? '').localeCompare(a.data.opened_on ?? '') || a.id.localeCompare(b.id));
}

export function chartCategories(chart: Chart, studies: CaseStudy[]) {
  return chart.data.categories.map((category) => ({ ...category,
    count: studies.filter(({ data }) => data.chart === chart.id && data.category === category.id).length,
  }));
}

export function caseStatistics(studies: CaseStudy[]) {
  const groups = (values: string[]) => [...values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map<string, number>())]
    .map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const amount = (field: 'reported_loss_usd' | 'assets_reviewed_usd') => {
    const values = studies.map(({ data }) => data.metrics[field]).filter((value): value is number => value !== null);
    return { total: values.reduce((sum, value) => sum + value, 0), coverage: values.length };
  };
  return {
    total: studies.length,
    years: groups(studies.map(({ data }) => data.opened_on?.slice(0, 4) ?? 'Undated')).sort((a, b) => b.label.localeCompare(a.label)),
    networks: groups(studies.flatMap(({ data }) => [...new Set(data.networks)])),
    services: groups(studies.flatMap(({ data }) => [...new Set(data.services)])),
    reportedLoss: amount('reported_loss_usd'), assetsReviewed: amount('assets_reviewed_usd'),
  };
}

// Every chart, statistic, and category page uses the same visibility and dataset rules.
export function caseRoutes<C extends Chart, S extends CaseStudy>(charts: C[], studies: S[], includeDrafts = false) {
  const eligible = eligibleCases(charts, studies, includeDrafts);
  const primaryKind: CaseKind = eligible.some(({ data }) => data.content_kind === 'case_study') || !includeDrafts ? 'case_study' : 'example';
  const primary = eligible.filter(({ data }) => data.content_kind === primaryKind);
  return charts.filter(({ data }) => includeDrafts || data.publication_status === 'published').flatMap((chart) => {
    const categories = chartCategories(chart, primary);
    const kinds: CaseKind[] = includeDrafts ? ['case_study', 'example'] : ['case_study'];
    return categories.map((category) => ({ chart, category, categories, primaryKind,
      url: categoryUrl(chart.id, category.id),
      studies: eligible.filter(({ data }) => data.chart === chart.id && data.category === category.id),
      datasets: kinds.map((kind) => {
        const records = eligible.filter(({ data }) => data.content_kind === kind);
        const counts = chartCategories(chart, records);
        return { kind, categories: counts, category: counts.find(({ id }) => id === category.id)!,
          studies: records.filter(({ data }) => data.chart === chart.id && data.category === category.id) };
      }),
    }));
  });
}
