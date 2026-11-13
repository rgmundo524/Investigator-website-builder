import { createCaseSunburst } from '../src/lib/case-sunburst-chart';
import { caseSunburst, sunburstNodes, sunburstSelection, type SunburstNode } from '../src/lib/case-sunburst';
import { chartSearchSelection, createCaseSearchController } from '../src/lib/case-search-filters';
import type { CaseSunburstData, CaseVisual } from '../src/lib/case-visuals';

type Catalog = { groups: CaseSunburstData[]; unclassifiedFiles: string[] };
type Selection = { id: string; label: string; files: string[] } | null;
type Options = { selectedId?: string; onSelect: (selection: Selection) => void };

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function action(label: string, run: () => void) {
  const button = element('button', 'button button-subtle', label);
  button.type = 'button'; button.setAttribute('aria-controls', 'record-list');
  button.addEventListener('click', run);
  return button;
}

// The builder and the public website share the same chart renderer and hierarchy.
// The builder controller sends exact file memberships to its local record list.
export function mountEditorCaseCharts(container: HTMLElement, catalog: Catalog, options: Options) {
  const controller = createCaseSearchController();
  const visuals: CaseVisual[] = [];
  const groups = catalog.groups.map(data => ({ data, hierarchy: caseSunburst(data) }));
  const categoryButtons: { button: HTMLButtonElement; id: string }[] = [];
  let outsideCharts = options.selectedId === '@unclassified';
  let activeChartId: string | null = null;
  let disposed = false;
  let selection: Selection = null;
  const status = element('p', 'case-filter-status');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  function select(data: CaseSunburstData, node: SunburstNode) {
    outsideCharts = false; activeChartId = data.id; controller.select(data, node);
  }
  function reset() { outsideCharts = false; activeChartId = null; controller.reset(); }
  const clear = action('Clear category filter', reset);
  const tools = element('div', 'case-filter-tools');
  tools.append(status, clear);
  const results = element('a', 'button button-subtle', 'View matching cases');
  results.href = '#record-list'; tools.append(results);
  const grid = element('div', 'case-filter-grid');
  container.replaceChildren(tools, grid);

  for (const { data, hierarchy } of groups) {
    const figure = element('figure', 'editor-case-chart');
    const title = element('h3', '', data.title);
    title.id = `editor-chart-title-${data.id}`;
    figure.setAttribute('aria-labelledby', title.id);
    const caption = element('figcaption');
    caption.append(title, element('p', 'case-filter-total', `${data.total} ${data.total === 1 ? 'case' : 'cases'}`));
    const breadcrumbs = element('nav', 'sunburst-breadcrumbs');
    breadcrumbs.dataset.sunburstBreadcrumbs = '';
    breadcrumbs.setAttribute('aria-label', `${data.title} filter path`);
    const host = element('div', 'editor-case-chart-canvas');
    host.id = `editor-case-chart-${data.id}`;
    host.setAttribute('role', 'group'); host.setAttribute('aria-labelledby', title.id);
    const alternatives = element('details', 'case-filter-alternatives');
    alternatives.append(element('summary', '', 'Browse categories and subcategories'));
    function branches(nodes: typeof hierarchy[]) {
      const list = element('ul', 'case-filter-category-list');
      for (const node of nodes) {
        const item = element('li');
        const button = action(`${node.label} (${node.count})`, () => select(data, node));
        button.setAttribute('aria-pressed', 'false');
        categoryButtons.push({ button, id: node.id });
        item.append(button);
        if (node.children?.length) item.append(branches(node.children));
        list.append(item);
      }
      return list;
    }
    alternatives.append(branches(hierarchy.children ?? []));
    figure.append(caption, breadcrumbs, host, alternatives);
    grid.append(figure);
    if (!data.total) {
      host.append(element('p', 'field-hint', 'No cases in this investigation group.'));
      continue;
    }
    try {
      const visual = createCaseSunburst(host, figure, data, false, {
        controller: {
          select,
          subscribe(listener) {
            return controller.subscribe(snapshot => listener(activeChartId === data.id ? snapshot : { term: '', filters: {} }));
          },
          reset,
        },
        resultsId: 'record-list',
      });
      visuals.push(visual);
      figure.addEventListener('click', event => {
        const button = (event.target as Element).closest<HTMLButtonElement>('[data-visual-action]');
        if (button && figure.contains(button)) visual.action?.(button.dataset.visualAction!);
      });
    } catch {
      host.replaceChildren(element('p', 'field-hint', 'The chart could not load. Use the category list below to filter cases.'));
      alternatives.open = true;
    }
  }

  if (catalog.unclassifiedFiles.length) {
    const unmatched = action(`Cases outside these charts (${catalog.unclassifiedFiles.length})`, () => {
      outsideCharts = true; activeChartId = null; controller.reset();
    });
    unmatched.dataset.unclassifiedCases = '';
    unmatched.title = 'Cases whose investigation group or classification needs attention.';
    tools.append(unmatched);
  }
  if (!groups.length) grid.append(element('p', 'field-hint', 'Add investigation groups under Categories to chart the cases.'));

  if (!outsideCharts && options.selectedId) {
    for (const { data, hierarchy } of groups) {
      if (sunburstNodes(hierarchy).some(node => node.id === options.selectedId)) {
        select(data, sunburstSelection(hierarchy, options.selectedId).node); break;
      }
    }
  }
  const unsubscribe = controller.subscribe(({ filters }) => {
    selection = null;
    if (outsideCharts && catalog.unclassifiedFiles.length) {
      selection = { id: '@unclassified', label: 'Cases outside these charts', files: catalog.unclassifiedFiles };
    } else {
      outsideCharts = false;
      for (const { data, hierarchy } of groups) {
        if (data.id !== activeChartId) continue;
        const selected = chartSearchSelection(data, hierarchy, filters);
        if (!selected.active) continue;
        const { ancestors } = sunburstSelection(hierarchy, selected.node.id);
        selection = { id: selected.node.id, label: [data.title, ...ancestors.slice(1).map(node => node.label)].join(' → '), files: selected.node.caseIds };
        break;
      }
    }
    status.textContent = selection ? `${selection.label} · ${selection.files.length} ${selection.files.length === 1 ? 'case' : 'cases'}` : 'All case categories';
    clear.disabled = !selection;
    for (const { button, id } of categoryButtons) button.setAttribute('aria-pressed', String(selection?.id === id));
    tools.querySelector('[data-unclassified-cases]')?.setAttribute('aria-pressed', String(outsideCharts));
    if (!disposed) options.onSelect(selection);
  });

  return {
    dispose() {
      if (disposed) return;
      disposed = true; unsubscribe();
      for (const visual of visuals) visual.dispose();
    },
  };
}
