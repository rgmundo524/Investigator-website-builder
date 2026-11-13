import type { ContentRecord } from '../content/schemas';
import { caseTitle, eligibleCases, readable, subcategoryPath } from './cases';
import { categoryUrl } from './charts';
import { mdxSearchText } from './mdx-text';
import { markdownSearchText } from './markdown-text';
import { classificationKeys, datasetLabel } from './case-search-filters';
import { offChainLeadLabels } from './off-chain-leads';

// Explicitly select rendered fields. Editorial notes and unused blocks never enter search.
export function caseSearchRecords(records: ContentRecord[], includeDrafts: boolean) {
  const selectedCharts = new Set(records.flatMap((record) => record.collection === 'pages'
    && (includeDrafts || record.data.publication_status === 'published')
    && record.data.section_order.includes('charts') ? record.data.charts : []));
  if (!selectedCharts.size) return [];
  const charts = records.filter((record) => record.collection === 'charts').filter((record) => selectedCharts.has(record.data.slug))
    .map((record) => ({ ...record, id: record.data.slug }));
  const cases = records.filter((record) => record.collection === 'cases').map((record) => ({ ...record, id: record.data.slug }));
  return eligibleCases(charts, cases, includeDrafts).map(({ id, data, body, file }) => {
    const chart = charts.find((chart) => chart.id === data.chart)!;
    const category = chart.data.categories.find(({ id }) => id === data.category)!.label;
    const dataset = datasetLabel(data.content_kind);
    return {
      url: `${categoryUrl(data.chart, data.category)}#${id}`,
      language: 'en',
      content: [data.case_number, data.title, data.description_short, data.scope_summary, chart.data.title, category, ...subcategoryPath({ id, data }).map(readable),
        data.opened_on, data.closed_on, data.role, ...data.networks.map(readable), ...data.assets,
        ...data.jurisdictions, ...data.services.map(readable), ...offChainLeadLabels(data.off_chain_leads), data.blocks.investigative_question, file.endsWith('.mdx') ? mdxSearchText(body) : markdownSearchText(body),
        ...data.links.map(({ label }) => label)].filter(Boolean).join('\n'),
      meta: {
        title: `${data.content_kind === 'example' ? 'Example: ' : ''}${caseTitle(data)}`,
        description: data.case_number ? `${data.title} — ${data.description_short}` : data.description_short, dataset, category,
      },
      filters: {
        Dataset: [dataset], Investigation: [chart.data.title], Category: [category],
        CasePath: classificationKeys(data.chart, [data.category, ...subcategoryPath({ id, data })]),
        Network: data.networks.length ? data.networks.map(readable) : ['Not recorded'],
      },
    };
  });
}
