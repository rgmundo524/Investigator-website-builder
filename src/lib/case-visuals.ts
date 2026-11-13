import { categoryUrl, formatShare, summarizeCases } from './charts';
import { caseTitle, subcategoryPath, caseSubcategories, chartCategories, eligibleCases, readable, subcategoryAnchor, type Chart, type CaseStudy, type CaseKind } from './cases';

const palette = [
  ['#8b3049', '#c94c44'], ['#386b94', '#91c9ee'], ['#30786f', '#8bd7c6'],
  ['#946925', '#edc078'], ['#70528e', '#c9afe9'], ['#607082', '#b3c4d6'],
];
export type CaseNode = {
  id: string; label: string; title: string; type: 'root' | 'investigation' | 'category' | 'case';
  count: number; tooltip: string; light: string; dark: string;
  url?: string; value?: number; children?: CaseNode[];
};

// Project only public display fields. Parent values are omitted: amCharts sums
// leaf value:1 itself; supplying both parent counts and leaf values double-counts.
export function caseVisuals(charts: Chart[], studies: CaseStudy[], kind: CaseKind, includeDrafts = false) {
  const records = eligibleCases(charts, studies, includeDrafts).filter(({ data }) => data.content_kind === kind);
  const visibleCharts = charts.filter(({ data }) => includeDrafts || data.publication_status === 'published');
  let colorIndex = 0;
  const groups = visibleCharts.map((chart, index) => {
    const summary = summarizeCases(chartCategories(chart, records));
    const categories = summary.slices.map((slice) => {
      const [light, dark] = palette[colorIndex++ % palette.length];
      const count = slice.count ?? 0;
      const subcategories = caseSubcategories(records.filter(({ data }) => data.chart === chart.id && data.category === slice.id))
        .map(({ id, label, count: subCount }) => ({ id, label, count: subCount,
          percentage: summary.total ? subCount / summary.total * 100 : 0,
          categoryPercentage: count ? subCount / count * 100 : 0,
          url: `${categoryUrl(chart.id, slice.id)}#${subcategoryAnchor(kind, id)}`,
        }));
      return { id: slice.id, label: slice.label, count, percentage: slice.percentage, offset: slice.offset,
        light, dark, subcategories, url: `${categoryUrl(chart.id, slice.id)}#dataset-${kind}`,
        tooltip: `${slice.label}\n${count} ${kind === 'example' ? 'example cases' : 'cases'}${summary.canPlot ? ` · ${formatShare(slice.percentage)}` : ''}\nOpen category`,
      };
    });
    const [light, dark] = palette[index % palette.length];
    const cases = records.filter(({ data }) => data.chart === chart.id).map((study) => ({
      id: study.id, title: caseTitle(study.data), description: study.data.description_short,
      path: [study.data.category, ...subcategoryPath(study)],
      url: `${categoryUrl(study.data.chart, study.data.category)}#${study.id}`,
    }));
    return { id: chart.id, title: chart.data.title, kind, total: summary.total ?? 0, light, dark, categories, cases };
  });
  const investigations: CaseNode[] = groups.filter(({ total }) => total > 0).map((group) => {
    return { id: `investigation:${group.id}`, label: group.title, title: group.title, type: 'investigation', count: group.total,
      light: group.light, dark: group.dark, tooltip: `${group.title}\n${group.total} cases\nSelect to expand or collapse categories.`,
      children: group.categories.filter(({ count }) => count > 0).map((category) => ({
        id: `category:${group.id}:${category.id}`, label: category.label, title: category.label,
        type: 'category', count: category.count, light: category.light, dark: category.dark,
        url: category.url, tooltip: `${category.label}\n${category.count} cases\nSelect to expand or collapse cases.`,
        children: records.filter(({ data }) => data.chart === group.id && data.category === category.id).map(({ id, data }) => ({
          id: `case:${id}`, label: data.case_number ?? data.blocks.chart_label ?? id, title: caseTitle(data),
          type: 'case', count: 1, value: 1, light: category.light, dark: category.dark,
          url: `${categoryUrl(data.chart, data.category)}#${id}`,
          tooltip: [caseTitle(data), data.case_number ? data.title : '', data.description_short,
            `Classification: ${subcategoryPath({ id, data }).map(readable).join(' → ')}`,
            data.opened_on ? `Engaged: ${data.opened_on}` : '', data.closed_on ? `Report issued: ${data.closed_on}` : '',
            data.networks.length ? `Networks: ${data.networks.map(readable).join(', ')}` : '',
            'Open case details.'].filter(Boolean).join('\n'),
        })),
      })),
    };
  });
  const tree: CaseNode = { id: `root:${kind}`, label: kind === 'example' ? 'Example cases' : 'Casework',
    title: kind === 'example' ? 'Example cases' : 'Casework', type: 'root', count: records.length,
    light: '#485567', dark: '#bac8d8', tooltip: `${records.length} ${kind === 'example' ? 'example cases' : 'recorded cases'}\nSelect to expand or collapse investigations.`,
    children: investigations };
  return { kind, total: records.length, groups, tree };
}

export type CaseSunburstData = ReturnType<typeof caseVisuals>['groups'][number];
export type CaseVisualDataset = ReturnType<typeof caseVisuals>;
export type CaseSunburstPayload = Pick<CaseSunburstData, 'id' | 'title' | 'kind' | 'total' | 'light' | 'dark'> & {
  categories: Pick<CaseSunburstData['categories'][number], 'id' | 'label' | 'light' | 'dark'>[];
  cases: Pick<CaseSunburstData['cases'][number], 'id' | 'path'>[];
};

// The interactive sunburst needs classification membership, while the server
// retains descriptions, links, counts, and shares for the accessible fallback.
export function sunburstPayload(data: CaseSunburstData): CaseSunburstPayload {
  const { id, title, kind, total, light, dark } = data;
  return { id, title, kind, total, light, dark,
    categories: data.categories.map(({ id, label, light, dark }) => ({ id, label, light, dark })),
    cases: data.cases.map(({ id, path }) => ({ id, path: [...path] })),
  };
}

export type CaseTreeData = Pick<ReturnType<typeof caseVisuals>, 'kind' | 'total' | 'tree'>;
export type CaseVisualState = { sunburstNode?: string; expanded?: string[]; treeAutoFit?: boolean; zoom?: { x: number; y: number; scale: number } };
export type CaseVisual = {
  dispose(): void; state(): CaseVisualState; motion(enabled: boolean): void;
  visible(visible: boolean): void; action?(action: string): void;
};
