import type { CaseKind } from './cases';
import type { CaseSunburstPayload } from './case-visuals';
import { sunburstNodes, type SunburstNode } from './case-sunburst';

export type CaseFilters = Record<string, string[]>;
export const datasetLabel = (kind: CaseKind) => kind === 'example' ? 'Illustrative examples' : 'Case studies';

// Prefixes preserve ancestry. The terminal token matches only cases that stop
// at this exact path, including mixed-depth "No further classification" buckets.
export function classificationKeys(chart: string, path: string[]) {
  return [`${chart}/`, ...path.map((_part, index) => `${chart}/${path.slice(0, index + 1).join('/')}`), `${chart}/${path.join('/')}/@unclassified`];
}

const clean = (filters: CaseFilters): CaseFilters => Object.fromEntries(Object.entries(filters).filter(([, values]) => values.length).map(([key, values]) => [key, [...values]]));
const same = (a: string[] = [], b: string[] = []) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
export const equalCaseFilters = (a: CaseFilters, b: CaseFilters) => Object.keys({ ...clean(a), ...clean(b) }).every((key) => same(a[key], b[key]));

export function filtersForChart(current: CaseFilters, data: CaseSunburstPayload, node: SunburstNode): CaseFilters {
  const changed = (current.Investigation?.length && !same(current.Investigation, [data.title]))
    || (current.Dataset?.length && !same(current.Dataset, [datasetLabel(data.kind)]));
  const next: CaseFilters = changed ? {} : clean(current);
  delete next.Category; delete next.CasePath;
  return { ...next, Dataset: [datasetLabel(data.kind)], Investigation: [data.title],
    ...(node.path.length ? { Category: [data.categories.find(({ id }) => id === node.path[0])!.label], CasePath: [node.id] } : {}),
  };
}

// Native dropdowns share this rule with the charts. Changing an investigation
// clears all old narrowing; changing a primary category clears its deeper path.
export function normalizeCaseFilters(previous: CaseFilters, incoming: CaseFilters): CaseFilters {
  const next = clean(incoming);
  if (!same(previous.Investigation, next.Investigation) || !same(previous.Dataset, next.Dataset)) {
    return { ...(next.Dataset ? { Dataset: next.Dataset } : {}), ...(next.Investigation ? { Investigation: next.Investigation } : {}) };
  }
  if (!same(previous.Category, next.Category)) delete next.CasePath;
  return next;
}

export function chartSearchSelection(data: CaseSunburstPayload, root: SunburstNode, filters: CaseFilters) {
  const active = same(filters.Investigation, [data.title]) && (!filters.Dataset?.length || same(filters.Dataset, [datasetLabel(data.kind)]));
  if (!active) return { active: false, node: root };
  const nodes = sunburstNodes(root);
  const selected = nodes.find(({ id }) => id === filters.CasePath?.[0]);
  const category = data.categories.find(({ label }) => same(filters.Category, [label]));
  return { active: true, node: selected ?? root.children?.find(({ path }) => path[0] === category?.id) ?? root };
}

export type CaseSearchSnapshot = { term: string; filters: CaseFilters };
export type PagefindCaseInstance = {
  searchTerm: string; searchFilters: CaseFilters;
  triggerSearchWithFilters(term: string, filters: CaseFilters): void;
  on(event: 'search', listener: (term: string, filters: CaseFilters) => void): void;
};

// One source of selection state for both canvases and the supplied Pagefind UI.
// It also queues chart clicks that occur before Pagefind finishes loading.
export function createCaseSearchController() {
  let snapshot: CaseSearchSnapshot = { term: '', filters: {} };
  let instance: PagefindCaseInstance | undefined;
  let pending = false;
  let revision = 0;
  const listeners = new Set<(snapshot: CaseSearchSnapshot) => void>();
  const emit = () => { for (const listener of listeners) listener(snapshot); };
  function commit(next: CaseSearchSnapshot) {
    revision++; snapshot = next; pending = !instance; emit();
    instance?.triggerSearchWithFilters(next.term, next.filters);
  }
  return {
    snapshot: () => snapshot,
    subscribe(listener: (snapshot: CaseSearchSnapshot) => void) { listeners.add(listener); listener(snapshot); return () => { listeners.delete(listener); }; },
    select(data: CaseSunburstPayload, node: SunburstNode) { commit({ term: snapshot.term, filters: filtersForChart(snapshot.filters, data, node) }); },
    reset() { commit({ term: '', filters: {} }); },
    connect(next: PagefindCaseInstance) {
      instance = next;
      let active = true;
      next.on('search', (term, filters) => {
        if (!active || instance !== next) return;
        const current = ++revision;
        const normalized = normalizeCaseFilters(snapshot.filters, filters);
        snapshot = { term: term ?? '', filters: normalized }; emit();
        // Pagefind launches the originating request AFTER this callback. Defer
        // corrections so a stale outer request cannot supersede the clean one.
        if (!equalCaseFilters(normalized, filters)) queueMicrotask(() => {
          if (active && instance === next && revision === current) next.triggerSearchWithFilters(snapshot.term, normalized);
        });
      });
      if (pending) { pending = false; next.triggerSearchWithFilters(snapshot.term, snapshot.filters); }
      else { snapshot = { term: next.searchTerm ?? '', filters: clean(next.searchFilters ?? {}) }; emit(); }
      return () => { active = false; if (instance === next) instance = undefined; };
    },
  };
}

export const caseSearchController = createCaseSearchController();
