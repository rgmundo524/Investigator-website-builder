import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { transform } from 'esbuild';

type Event = { type: string; target: Element; key?: string; persisted?: boolean; relatedTarget?: Element | null; defaultPrevented: boolean; stopped: boolean;
  preventDefault(): void; stopPropagation(): void };
type Listener = (event: Event) => void;
class Events {
  listeners = new Map<string, Set<Listener>>();
  addEventListener(type: string, listener: Listener, options?: { signal?: AbortSignal }) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener); this.listeners.set(type, listeners);
    options?.signal?.addEventListener('abort', () => this.removeEventListener(type, listener), { once: true });
  }
  removeEventListener(type: string, listener: Listener) { this.listeners.get(type)?.delete(listener); }
  dispatch(event: Event) { for (const listener of this.listeners.get(event.type) ?? []) listener(event); }
  count() { return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0); }
}
class Element extends Events {
  hidden = false; tagName = 'DIV'; parent?: Element; dataset: Record<string, string> = {};
  children: Element[] = []; selectors = new Map<string, Element>(); attributes = new Map<string, string>();
  document?: { activeElement: Element | null }; height = 76.2;
  style = { setProperty: (name: string, value: string) => this.properties.set(name, value) };
  properties = new Map<string, string>();
  querySelector(selector: string) { return this.selectors.get(selector) ?? null; }
  querySelectorAll(selector: string) { return this.children.filter(child => child.matches(selector)); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  hasAttribute(name: string) { return this.attributes.has(name); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  toggleAttribute(name: string, enabled: boolean) { if (enabled) this.setAttribute(name, ''); else this.removeAttribute(name); }
  contains(target: Element | null): boolean { return target === this || this.children.some(child => child.contains(target)); }
  matches(selector: string) { return /^(a|a\[href\])$/.test(selector) && this.tagName === 'A' && this.hasAttribute('href'); }
  closest(selector: string): Element | null { return this.matches(selector) ? this : this.parent?.closest(selector) ?? null; }
  get href() { return new URL(this.getAttribute('href') ?? '', 'https://example.test/about/').href; }
  focus() { if (this.document) this.document.activeElement = this; }
  getBoundingClientRect() { return { height: this.height }; }
  fire(type: string, extra: Partial<Event> = {}) {
    const event: Event = { type, target: this, defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...extra };
    for (let current: Element | undefined = this; current; current = current.parent) {
      current.dispatch(event); if (event.stopped) break;
    }
    return event;
  }
}

async function fixture(mobile = true) {
  const document = Object.assign(new Element(), { activeElement: null as Element | null, documentElement: new Element() });
  const header = new Element(); const button = new Element(); const panel = new Element(); const link = new Element(); const wordmark = new Element();
  const linkText = new Element(); const outside = new Element(); const windowEvents = new Element();
  button.tagName = 'BUTTON'; button.hidden = true; button.setAttribute('aria-expanded', 'false');
  link.tagName = 'A'; link.setAttribute('href', '/work-history/');
  wordmark.tagName = 'A'; wordmark.setAttribute('href', '/');
  header.children = [wordmark, button, panel]; panel.children = [link]; link.children = [linkText];
  header.parent = document; wordmark.parent = header; button.parent = header; panel.parent = header; link.parent = panel; linkText.parent = link; outside.parent = document;
  for (const element of [header, wordmark, button, panel, link, linkText, outside]) element.document = document;
  header.selectors.set('[data-menu-toggle]', button); header.selectors.set('[data-header-menu]', panel);
  header.selectors.set('.wordmark', wordmark);
  const media = Object.assign(new Events(), { matches: mobile, media: '(max-width: 1152px)' });
  const observers: { disconnected: boolean; targets: Element[]; callback(): void; disconnect(): void }[] = [];
  class ResizeObserver {
    disconnected = false; targets: Element[] = [];
    constructor(readonly callback: () => void) { observers.push(this); }
    observe(target: Element) { this.targets.push(target); }
    disconnect() { this.disconnected = true; }
  }
  const matchMedia = (query: string) => { assert.equal(query, '(max-width: 1152px)'); return media; };
  const window = Object.assign(windowEvents, { matchMedia, location: new URL('https://example.test/about/'),
    requestAnimationFrame(callback: () => void) { callback(); return 1; }, cancelAnimationFrame() {} });
  const { code } = await transform(await readFile(new URL('../src/scripts/site-header.ts', import.meta.url), 'utf8'),
    { loader: 'ts', format: 'cjs', target: 'es2022' });
  const module = { exports: {} as { initSiteHeader(header: HTMLElement): () => void } };
  runInNewContext(code, { module, exports: module.exports, window, document, matchMedia, ResizeObserver, AbortController,
    HTMLElement: Element, Element, Node: Element, HTMLAnchorElement: Element, HTMLButtonElement: Element, URL,
    requestAnimationFrame: window.requestAnimationFrame, cancelAnimationFrame: window.cancelAnimationFrame });
  return { header, wordmark, button, panel, link, linkText, outside, document, window, media, observers,
    init: () => module.exports.initSiteHeader(header as unknown as HTMLElement),
    resize(mobile: boolean) { media.matches = mobile; media.dispatch({ type: 'change' } as Event); },
    listenerCount: () => [header, button, panel, link, linkText, outside, document, window, media].reduce((count, target) => count + target.count(), 0),
  };
}

test('the mobile header starts collapsed and its button toggles visibility together with expanded state', async () => {
  const f = await fixture();
  assert.equal(f.panel.hidden, false, 'The navigation starts visible before enhancement');
  assert.equal(f.button.hidden, true);
  const cleanup = f.init();
  assert.equal(f.panel.hidden, true); assert.equal(f.button.hidden, false);
  assert.equal(f.button.getAttribute('aria-expanded'), 'false');
  f.button.fire('click');
  assert.equal(f.panel.hidden, false); assert.equal(f.button.getAttribute('aria-expanded'), 'true');
  f.button.fire('click');
  assert.equal(f.panel.hidden, true); assert.equal(f.button.getAttribute('aria-expanded'), 'false');
  cleanup();
});

test('Escape restores the menu button focus while outside clicks and navigation selection close the disclosure', async () => {
  const f = await fixture(); const cleanup = f.init();
  f.button.fire('click'); f.link.focus(); f.link.fire('keydown', { key: 'Escape' });
  assert.equal(f.panel.hidden, true); assert.equal(f.button.getAttribute('aria-expanded'), 'false');
  assert.equal(f.document.activeElement, f.button);
  f.button.fire('click'); f.outside.focus(); f.outside.fire('pointerdown'); f.outside.fire('click');
  assert.equal(f.panel.hidden, true); assert.equal(f.document.activeElement, f.outside, 'Closing from outside does not steal focus');
  f.button.fire('click'); f.link.focus();
  const navigation = f.linkText.fire('click');
  assert.equal(f.panel.hidden, true); assert.equal(f.button.getAttribute('aria-expanded'), 'false');
  assert.equal(navigation.defaultPrevented, false, 'Ordinary link navigation stays available');
  assert.equal(f.document.activeElement, f.button, 'An opened-in-new-tab or intercepted link cannot leave focus hidden');
  cleanup();
});

test('desktop and breakpoint changes expose full navigation and a back-forward restoration closes the mobile menu', async () => {
  const f = await fixture(false); const cleanup = f.init();
  assert.equal(f.panel.hidden, false); assert.equal(f.button.hidden, true);
  f.resize(true); assert.equal(f.panel.hidden, true); assert.equal(f.button.hidden, false);
  f.button.fire('click'); assert.equal(f.panel.hidden, false);
  f.resize(false); assert.equal(f.panel.hidden, false); assert.equal(f.button.hidden, true);
  assert.equal(f.button.getAttribute('aria-expanded'), 'false');
  f.resize(true); assert.equal(f.panel.hidden, true);
  f.button.fire('click'); f.link.focus(); f.window.fire('pageshow', { persisted: true });
  assert.equal(f.panel.hidden, true); assert.equal(f.button.getAttribute('aria-expanded'), 'false');
  assert.equal(f.document.activeElement, f.button, 'A restored link does not retain focus inside the collapsed panel');
  cleanup();
});

test('the disclosure does not trap Tab and cleanup removes listeners and disconnects header measurement', async () => {
  const f = await fixture(); const cleanup = f.init();
  f.button.fire('click'); f.link.focus();
  const tab = f.link.fire('keydown', { key: 'Tab' });
  assert.equal(tab.defaultPrevented, false); assert.equal(f.document.activeElement, f.link);
  assert.ok(f.observers.some(observer => observer.targets.includes(f.header)));
  f.header.height = 121.2; f.observers[0].callback();
  assert.equal(f.document.documentElement.properties.get('--site-header-height'), '122px');
  assert.ok(f.listenerCount() > 0);
  cleanup();
  assert.equal(f.listenerCount(), 0);
  assert.ok(f.observers.every(observer => observer.disconnected));
  const hidden = f.panel.hidden; const expanded = f.button.getAttribute('aria-expanded');
  f.button.fire('click'); f.resize(false); f.window.fire('pageshow', { persisted: true });
  assert.equal(f.panel.hidden, hidden); assert.equal(f.button.getAttribute('aria-expanded'), expanded);
});

test('focus leaving the header closes the menu and breakpoint changes move focus out of newly hidden controls', async () => {
  const f = await fixture(false); const cleanup = f.init();
  f.link.focus(); f.resize(true);
  assert.equal(f.document.activeElement, f.button);
  assert.equal(f.panel.hidden, true);
  f.button.fire('click'); f.link.focus(); f.button.fire('focusout', { relatedTarget: f.link });
  assert.equal(f.panel.hidden, false, 'Moving focus within the header leaves the disclosure open');
  f.outside.focus(); f.link.fire('focusout', { relatedTarget: f.outside });
  assert.equal(f.panel.hidden, true); assert.equal(f.document.activeElement, f.outside);
  f.button.focus(); f.resize(false);
  assert.equal(f.document.activeElement, f.wordmark);
  assert.equal(f.button.hidden, true); assert.equal(f.panel.hidden, false);
  cleanup();
});
