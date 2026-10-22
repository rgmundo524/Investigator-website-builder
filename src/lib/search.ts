import type { ContentRecord } from '../content/schemas';
import { caseUrl, eligibleCases, readable, selectedCaseCharts, statusLabels, subcategoryPath } from './cases';
import { mdxSearchText } from './mdx-text';
import { markdownSearchText } from './markdown-text';
import { classificationKeys, datasetLabel } from './case-search-filters';

// Explicitly select rendered fields. Editorial notes and unused blocks never enter search.
export function caseSearchRecords(records: ContentRecord[], includeDrafts: boolean) {
  const page = records.find((record) => record.collection === 'pages' && record.data.slug === 'casework');
  if (page?.collection !== 'pages' || (!includeDrafts && page.data.publication_status !== 'published') || !page.data.section_order.includes('charts')) return [];
  const charts = selectedCaseCharts(page, records.filter((record) => record.collection === 'charts')
    .map((record) => ({ ...record, id: record.data.slug })), includeDrafts);
  const cases = records.filter((record) => record.collection === 'cases').map((record) => ({ ...record, id: record.data.slug }));
  return eligibleCases(charts, cases, includeDrafts).map(({ id, data, body, file }) => {
    const chart = charts.find((chart) => chart.id === data.chart)!;
    const category = chart.data.categories.find(({ id }) => id === data.category)!.label;
    const dataset = datasetLabel(data.content_kind);
    return {
      url: caseUrl(id),
      language: 'en',
      content: [data.title, data.description_short, chart.data.title, category, ...subcategoryPath({ id, data }).map(readable), statusLabels[data.case_status],
        data.opened_on, data.closed_on, data.role, ...data.networks.map(readable), ...data.assets,
        ...data.jurisdictions, ...data.services.map(readable), data.blocks.investigative_question, file.endsWith('.mdx') ? mdxSearchText(body) : markdownSearchText(body),
        ...data.links.map(({ label }) => label)].filter(Boolean).join('\n'),
      meta: {
        title: `${data.content_kind === 'example' ? 'Example: ' : ''}${data.title}`,
        description: data.description_short, dataset, category,
      },
      filters: {
        Dataset: [dataset], Investigation: [chart.data.title], Category: [category],
        CasePath: classificationKeys(data.chart, [data.category, ...subcategoryPath({ id, data })]),
        Network: data.networks.length ? data.networks.map(readable) : ['Not recorded'],
        Status: [statusLabels[data.case_status]],
      },
    };
  });
}
