import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { transform } from 'esbuild';
import * as hierarchyHelpers from '../src/lib/case-sunburst';
import * as searchHelpers from '../src/lib/case-search-filters';
import type { CaseFilters, CaseSearchSnapshot } from '../src/lib/case-search-filters';
import type { CaseSunburstPayload, CaseVisual } from '../src/lib/case-visuals';

class Element {
  id = ''; type = ''; clientWidth = 480;
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  children: Element[] = [];
  parent?: Element;
  private text = '';
  lastFocusOptions?: { preventScroll?: boolean };
  constructor(readonly tagName: string, readonly document: { activeElement: Element | null }) {}
  set textContent(value: string) { this.text = value; }
  get textContent(): string { return this.text + this.children.map(child => child.textContent).join(''); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  hasAttribute(name: string) { return this.attributes.has(name); }
  append(...children: Element[]) { for (const child of children) { child.parent = this; this.children.push(child); } }
  replaceChildren(...children: Element[]) {
    for (const child of this.children) child.parent = undefined;
    this.children = []; this.text = ''; this.append(...children);
  }
  contains(target: Element | null): boolean { return target === this || this.children.some(child => child.contains(target)); }
  matches(selector: string) {
    if (selector === '[data-sunburst-breadcrumbs]') return this.dataset.sunburstBreadcrumbs !== undefined;
    if (selector === '[data-visual-action]') return this.dataset.visualAction !== undefined;
    if (selector === '[aria-current]') return this.hasAttribute('aria-current');
    return this.tagName.toLowerCase() === selector;
  }
  querySelectorAll(selector: string): Element[] {
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
  focus(options?: { preventScroll?: boolean }) { this.document.activeElement = this; this.lastFocusOptions = options; }
}

const data: CaseSunburstPayload = {
  id: 'asset-tracing', title: 'Asset tracing', kind: 'case_study', total: 4, light: '#386b94', dark: '#91c9ee',
  categories: [
    { id: 'fraud', label: 'Fraud', light: '#386b94', dark: '#91c9ee' },
    { id: 'theft', label: 'Theft', light: '#30786f', dark: '#8bd7c6' },
  ],
  cases: [
    { id: 'case-a', path: ['fraud', 'social-engineering', 'phishing'] },
    { id: 'case-b', path: ['fraud', 'social-engineering', 'impersonation'] },
    { id: 'case-c', path: ['fraud', 'social-engineering'] },
    { id: 'case-d', path: ['theft'] },
  ],
};

// Only rendering and amCharts are simulated; hierarchy, selection, filter
// normalization, and Pagefind synchronization use the production controller.
async function fixture(initial: CaseSearchSnapshot = { term: '', filters: {} }) {
  const document = {
    activeElement: null as Element | null,
    createElement(tag: string): Element { return new Element(tag.toUpperCase(), this); },
  };
  const figure = document.createElement('figure');
  const breadcrumbs = document.createElement('nav'); breadcrumbs.dataset.sunburstBreadcrumbs = '';
  const host = document.createElement('div'); host.id = 'asset-chart';
  const input = document.createElement('input');
  figure.append(breadcrumbs, host);
  const controller = searchHelpers.createCaseSearchController();
  const requests: CaseSearchSnapshot[] = [];
  let searchListener: ((term: string, filters: CaseFilters) => void) | undefined;
  const disconnect = controller.connect({
    searchTerm: initial.term, searchFilters: initial.filters,
    on(_event, listener) { searchListener = listener; },
    triggerSearchWithFilters(term, filters) { requests.push({ term, filters }); },
  });
  let validated = () => {};
  let nodeClick: ((event: { target: { dataItem: { dataContext: hierarchyHelpers.SunburstNode } } }) => void) | undefined;
  const template = () => ({ setAll() {}, adapters: { add() {} }, events: { on() {} } });
  const chartSettings = new Map<string, unknown>();
  const series = {
    nodes: { template: { ...template(), events: { on(_event: string, listener: typeof nodeClick) { nodeClick = listener; } } } },
    slices: Object.assign([], { template: template() }), labels: { template: template() },
    events: { once(_event: string, listener: () => void) { validated = listener; } },
    data: { setAll() { validated(); } },
    getDataItemById(id: string) { return { id }; },
    set(key: string, value: unknown) { chartSettings.set(key, value); },
  };
  let disposed = false; let observerDisconnected = false;
  class ResizeObserver { observe() {} disconnect() { observerDisconnected = true; } }
  const dependencies: Record<string, unknown> = {
    '@amcharts/amcharts5': {
      Root: { new: () => ({ container: { children: { push: (value: unknown) => value } }, dispose() { disposed = true; } }) },
      color: (value: unknown) => value, percent: (value: unknown) => value, Color: { brighten: (value: unknown) => value },
    },
    '@amcharts/amcharts5/hierarchy': { Sunburst: { new: () => series } },
    '../config/case-visuals.json': { sunburst: { radius: 96, innerRadius: 12, transitionDuration: 350 } },
    './case-chart-style': { caseChartStyle: () => ({ dark: false, ink: '#123', tooltip: { label: { set() {} } } }), caseLabelColor: (value: unknown) => value },
    './case-sunburst': hierarchyHelpers,
    './case-search-filters': searchHelpers,
  };
  const { code } = await transform(await readFile(new URL('../src/lib/case-sunburst-chart.ts', import.meta.url), 'utf8'),
    { loader: 'ts', format: 'cjs', target: 'es2022' });
  const module = { exports: {} as { createCaseSunburst(host: HTMLElement, figure: HTMLElement, data: CaseSunburstPayload,
    motion: boolean, options: { controller: typeof controller; resultsId: string }): CaseVisual } };
  runInNewContext(code, { module, exports: module.exports, document, HTMLElement: Element, ResizeObserver,
    require(name: string) { assert.ok(Object.hasOwn(dependencies, name), `Unexpected renderer dependency: ${name}`); return dependencies[name]; } });
  const visual = module.exports.createCaseSunburst(host as unknown as HTMLElement, figure as unknown as HTMLElement, data,
    false, { controller, resultsId: 'record-list' });
  const buttons = () => breadcrumbs.querySelectorAll('button');
  const button = (label: string) => { const found = buttons().find(button => button.textContent === label); assert.ok(found, `Missing breadcrumb: ${label}`); return found; };
  return {
    document, figure, breadcrumbs, host, input, controller, requests, visual, chartSettings, buttons, button,
    labels: () => buttons().map(button => button.textContent),
    current: () => buttons().filter(button => button.getAttribute('aria-current') === 'true').map(button => button.textContent),
    activate(label: string) { visual.action!(button(label).dataset.visualAction); },
    external(term: string, filters: CaseFilters) { assert.ok(searchListener); searchListener(term, filters); },
    chartClick(id: string) {
      const node = hierarchyHelpers.sunburstNodes(hierarchyHelpers.caseSunburst(data)).find(node => node.id === id);
      assert.ok(node); assert.ok(nodeClick); nodeClick({ target: { dataItem: { dataContext: node } } });
    },
    cleanup() { visual.dispose(); disconnect(); assert.equal(disposed, true); assert.equal(observerDisconnected, true); },
  };
}

test('breadcrumbs render a plain ordered path and distinguish investigation selection from All', async () => {
  const f = await fixture();
  try {
    assert.deepEqual(f.labels(), ['All', 'Asset tracing']);
    assert.deepEqual(f.current(), ['All']);
    assert.equal(f.breadcrumbs.children[0].tagName, 'OL');
    assert.equal(f.breadcrumbs.textContent, 'All/Asset tracing');
    assert.ok(f.buttons().every(button => button.type === 'button' && button.getAttribute('aria-controls') === 'asset-chart record-list'));
    assert.ok(f.breadcrumbs.querySelectorAll('span').every(separator => separator.textContent === '/' && separator.getAttribute('aria-hidden') === 'true'));
    f.activate('Asset tracing');
    assert.deepEqual(f.controller.snapshot(), { term: '', filters: { Dataset: ['Case studies'], Investigation: ['Asset tracing'] } });
    assert.deepEqual(f.current(), ['Asset tracing']);
    assert.equal(f.figure.dataset.searchActive, 'true');
    f.activate('All');
    assert.deepEqual(f.controller.snapshot(), { term: '', filters: {} });
    assert.deepEqual(f.current(), ['All']);
    assert.equal(f.figure.dataset.searchActive, 'false');
  } finally { f.cleanup(); }
});

test('chart selections expose nested ancestors and activating an ancestor keeps keyboard focus on its replacement', async () => {
  const f = await fixture();
  try {
    f.chartClick('asset-tracing/fraud/social-engineering/phishing');
    assert.deepEqual(f.labels(), ['All', 'Asset tracing', 'Fraud', 'Social Engineering', 'Phishing']);
    assert.deepEqual(f.current(), ['Phishing']);
    assert.deepEqual(f.controller.snapshot().filters.CasePath, ['asset-tracing/fraud/social-engineering/phishing']);
    assert.equal(f.visual.state().sunburstNode, 'asset-tracing/fraud/social-engineering/phishing');
    assert.deepEqual(f.chartSettings.get('selectedDataItem'), { id: 'asset-tracing/fraud/social-engineering' }, 'A selected leaf keeps its parent in view');
    const ancestor = f.button('Fraud'); ancestor.focus(); f.activate('Fraud');
    assert.deepEqual(f.labels(), ['All', 'Asset tracing', 'Fraud']);
    assert.deepEqual(f.current(), ['Fraud']);
    assert.deepEqual(f.controller.snapshot().filters.CasePath, ['asset-tracing/fraud']);
    assert.notEqual(f.button('Fraud'), ancestor, 'The breadcrumb list was rebuilt');
    assert.equal(f.document.activeElement, f.button('Fraud'));
    assert.equal(f.button('Fraud').lastFocusOptions?.preventScroll, true);
  } finally { f.cleanup(); }
});

test('external Pagefind changes update the path without stealing focus from search', async () => {
  const f = await fixture({ term: 'wallet', filters: { Dataset: ['Case studies'], Investigation: ['Asset tracing'],
    Category: ['Fraud'], CasePath: ['asset-tracing/fraud/social-engineering/phishing'] } });
  try {
    assert.deepEqual(f.current(), ['Phishing'], 'An existing Pagefind selection is restored when mounting');
    f.input.focus();
    f.external('wallet', { Dataset: ['Case studies'], Investigation: ['Asset tracing'], Category: ['Theft'],
      CasePath: ['asset-tracing/fraud/social-engineering/phishing'] });
    assert.deepEqual(f.labels(), ['All', 'Asset tracing', 'Theft']);
    assert.deepEqual(f.current(), ['Theft']);
    assert.equal(f.controller.snapshot().filters.CasePath, undefined, 'Changing category clears the old deeper selection');
    assert.equal(f.document.activeElement, f.input);
    f.external('wallet', { Dataset: ['Case studies'], Investigation: ['Other investigation'] });
    assert.deepEqual(f.labels(), ['All', 'Asset tracing']);
    assert.deepEqual(f.current(), ['All']);
    assert.equal(f.figure.dataset.searchActive, 'false');
    assert.equal(f.document.activeElement, f.input);
    await Promise.resolve();
  } finally { f.cleanup(); }
});

test('All clears search text and unrelated filters even when the chart already shows All', async () => {
  const f = await fixture({ term: 'wallet', filters: { Network: ['Ethereum'] } });
  try {
    assert.deepEqual(f.current(), ['All']);
    assert.equal(f.button('All').hasAttribute('disabled'), false);
    f.button('All').focus(); f.activate('All');
    assert.deepEqual(f.requests.at(-1), { term: '', filters: {} });
    assert.equal(f.document.activeElement, f.button('All'));
    f.external('wallet', { Network: ['Ethereum'] });
    f.activate('Asset tracing');
    assert.deepEqual(f.requests.at(-1), { term: 'wallet', filters: { Network: ['Ethereum'], Dataset: ['Case studies'], Investigation: ['Asset tracing'] } });
    f.activate('All');
    assert.deepEqual(f.requests.at(-1), { term: '', filters: {} });
  } finally { f.cleanup(); }
});

test('partial classifications retain their exact terminal selection and a removed focused segment falls back to current', async () => {
  const f = await fixture();
  try {
    const terminal = 'asset-tracing/fraud/social-engineering/@unclassified';
    f.visual.action!(`sunburst-select:${terminal}`);
    assert.deepEqual(f.labels(), ['All', 'Asset tracing', 'Fraud', 'Social Engineering', 'No further classification']);
    assert.deepEqual(f.current(), ['No further classification']);
    assert.deepEqual(f.controller.snapshot().filters.CasePath, [terminal]);
    assert.equal(f.visual.state().sunburstNode, terminal);
    assert.deepEqual([...hierarchyHelpers.sunburstSelection(hierarchyHelpers.caseSunburst(data), terminal).caseIds], ['case-c']);
    f.button('No further classification').focus(); f.controller.reset();
    assert.deepEqual(f.labels(), ['All', 'Asset tracing']);
    assert.equal(f.document.activeElement, f.button('All'));
    const requests = f.requests.length;
    f.visual.action!('sunburst-select:missing/node');
    assert.equal(f.requests.length, requests, 'An unknown breadcrumb action does not change the shared filters');
  } finally { f.cleanup(); }
});
