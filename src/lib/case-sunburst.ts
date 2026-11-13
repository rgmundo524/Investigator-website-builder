import { readable } from './cases';
import { formatShare } from './charts';
import type { CaseSunburstPayload } from './case-visuals';

export type SunburstNode = {
  id: string; label: string; path: string[]; count: number; caseIds: string[];
  light: string; dark: string; tooltip: string; value?: number; children?: SunburstNode[];
};

// A case follows exactly one path. Values live only on terminal buckets;
// branch counts are metadata, never values added to their descendants.
export function caseSunburst(data: CaseSunburstPayload): SunburstNode {
  const build = (path: string[], label: string, records: CaseSunburstPayload['cases'],
    light: string, dark: string, parentCount: number, terminal = false): SunburstNode => {
    const id = `${data.id}/${path.join('/')}${terminal ? '/@unclassified' : ''}`;
    const node: SunburstNode = {
      id, label, path, count: records.length, caseIds: records.map(({ id }) => id), light, dark,
      tooltip: `${[data.title, ...path.map(readable), ...(terminal ? [label] : [])].join(' → ')}\n${records.length} ${data.kind === 'example' ? 'example ' : ''}${records.length === 1 ? 'case' : 'cases'}\n${formatShare(data.total ? records.length / data.total * 100 : 0)} of this investigation${path.length ? ` · ${formatShare(parentCount ? records.length / parentCount * 100 : 0)} of parent group` : ''}\nSelect to filter cases.`,
    };
    const groups = new Map<string, CaseSunburstPayload['cases']>();
    const direct: CaseSunburstPayload['cases'] = [];
    for (const record of records) {
      const next = record.path[path.length];
      if (terminal || next === undefined) direct.push(record);
      else { const group = groups.get(next) ?? []; group.push(record); groups.set(next, group); }
    }
    if (!groups.size) { node.value = records.length; return node; }
    const keys = path.length ? [...groups.keys()].sort((a, b) => a === b ? 0 : a === 'unspecified' ? 1 : b === 'unspecified' ? -1 : a.localeCompare(b))
      : data.categories.filter(({ id }) => groups.has(id)).map(({ id }) => id);
    node.children = keys.map((key) => {
      const category = path.length ? undefined : data.categories.find(({ id }) => id === key);
      return build([...path, key], category?.label ?? readable(key), groups.get(key)!, category?.light ?? light, category?.dark ?? dark, records.length);
    });
    // Partial classifications must retain their share alongside deeper paths.
    if (direct.length) node.children.push(build(path, 'No further classification', direct, light, dark, records.length, true));
    return node;
  };
  return build([], 'All categories', data.cases, data.light, data.dark, data.total);
}

export function sunburstNodes(root: SunburstNode): SunburstNode[] {
  return [root, ...(root.children ?? []).flatMap(sunburstNodes)];
}

// The same selected node determines the chart focus, count, and result membership.
export function sunburstSelection(root: SunburstNode, id?: string) {
  const nodes = sunburstNodes(root);
  const node = nodes.find((node) => node.id === id) ?? root;
  const ancestors: SunburstNode[] = [];
  function find(current: SunburstNode): boolean {
    if (current === node || current.children?.some(find)) { ancestors.unshift(current); return true; }
    return false;
  }
  find(root);
  // Sunburst supports branch zoom. Leaves filter while their parent stays in
  // view, avoiding an unsupported leaf zoom that can overlap sibling slices.
  const focus = node.children?.length ? node : ancestors.at(-2) ?? root;
  return { node, ancestors, focus, caseIds: new Set(node.caseIds) };
}
