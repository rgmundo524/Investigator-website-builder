import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { transform } from 'esbuild';

type Listener = () => void;
type Saved = { index: number; remaining: number };
class Element {
  dataset: Record<string, string> = {};
  hidden = false; disabled = false; isConnected = true; hovering = false;
  textContent = ''; loading = ''; fetchPriority = ''; src = '';
  selectors = new Map<string, Element[]>();
  attributes = new Map<string, string>();
  listeners = new Map<string, Set<Listener>>();
  __portraitContinuity?: { restore(): Saved; save(index: number, remaining: number): void };
  owner?: Element;
  addEventListener(type: string, callback: Listener) { const listeners = this.listeners.get(type) ?? new Set(); listeners.add(callback); this.listeners.set(type, listeners); }
  removeEventListener(type: string, callback: Listener) { this.listeners.get(type)?.delete(callback); }
  fire(type: string) { for (const callback of this.listeners.get(type) ?? []) callback(); }
  querySelector(selector: string) { return this.selectors.get(selector)?.[0]; }
  querySelectorAll(selector: string) { return this.selectors.get(selector) ?? []; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  toggleAttribute(name: string, force: boolean) { if (force) this.attributes.set(name, ''); else this.attributes.delete(name); }
  matches(selector: string) { return selector === ':hover' ? this.hovering : selector === '[data-portrait-rotation]'; }
  contains(element: Element | null) { return element === this || [...this.selectors.values()].some(values => values.includes(element!)); }
}

const photos = ['first.jpg', 'second.jpg', 'third.jpg'];
function portrait(ids = photos, scope = 'example.test|Example Person', compact = false) {
  const root = new Element();
  root.dataset = { portraitScope: scope, interval: '6000', autoplay: 'true' };
  const slides = ids.map((id, index) => {
    const slide = new Element(); const image = new Element();
    slide.dataset.portraitPhoto = id; slide.hidden = index > 0;
    image.src = `${compact ? 'compact' : 'large'}-${id}`;
    slide.selectors.set('img', [image]);
    return slide;
  });
  root.selectors.set('[data-portrait-slide]', slides);
  return root;
}

async function browser() {
  let now = 1_000_000; let nextTimer = 0; let active: Element | undefined; let blocked = false;
  const timers = new Map<number, { at: number; callback: Listener }>();
  const storage = new Map<string, string>();
  const document = Object.assign(new Element(), { hidden: false, activeElement: null as Element | null, currentScript: { previousElementSibling: undefined as Element | undefined } });
  document.querySelectorAll = () => active ? [active] : [];
  const mediaEvents = new Element();
  const media = { matches: false, addEventListener: mediaEvents.addEventListener.bind(mediaEvents),
    removeEventListener: mediaEvents.removeEventListener.bind(mediaEvents), fire: mediaEvents.fire.bind(mediaEvents) };
  const context = {
    document, Date: { now: () => now }, console,
    sessionStorage: { getItem(key: string) { if (blocked) throw new Error('Storage blocked'); return storage.get(key) ?? null; }, setItem(key: string, value: string) { if (blocked) throw new Error('Storage blocked'); storage.set(key, value); } },
    window: { matchMedia: () => media, setTimeout(callback: Listener, delay: number) { const id = ++nextTimer; timers.set(id, { callback, at: now + delay }); return id; }, clearTimeout(id: number) { timers.delete(id); } },
  };
  const restoreSource = await readFile(new URL('../src/scripts/portrait-restore.js', import.meta.url), 'utf8');
  const source = await readFile(new URL('../src/lib/portrait-carousel.ts', import.meta.url), 'utf8');
  const { code } = await transform(source, { loader: 'ts', format: 'cjs', target: 'es2022' });
  const module = { exports: {} as { initPortraitRotation(): void; destroyPortraitRotation(): void } };
  runInNewContext(code, { ...context, module, exports: module.exports });
  return {
    storage, timers, document, media, runtime: module.exports,
    show(root?: Element) { active = root; document.currentScript.previousElementSibling = root; runInNewContext(restoreSource, context); },
    blockStorage() { blocked = true; },
    advance(milliseconds: number) {
      const until = now + milliseconds;
      let runs = 0;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        assert.ok(++runs < 100, 'No duplicate or zero-delay timer loop');
        now = next[1].at; timers.delete(next[0]); next[1].callback();
      }
      now = until;
    },
  };
}

const selected = (root: Element) => root.querySelectorAll('[data-portrait-slide]').findIndex(slide => !slide.hidden);

test('inline restoration shows the configured photo before deferred rotation and isolates exact photo sequences', async () => {
  const b = await browser();
  const home = portrait(); b.show(home); home.__portraitContinuity!.save(1, 2400);
  const compact = portrait(photos, undefined, true); b.show(compact);
  assert.deepEqual(compact.querySelectorAll('[data-portrait-slide]').map(slide => slide.hidden), [true, false, true]);
  assert.equal(compact.querySelectorAll('[data-portrait-slide]')[1].querySelector('img')!.loading, 'eager');
  assert.equal(compact.__portraitContinuity!.restore().remaining, 2400);
  assert.equal(b.timers.size, 0, 'Restoration precedes deferred rotation initialization');
  const reordered = portrait(['third.jpg', 'first.jpg', 'second.jpg']); b.show(reordered);
  assert.equal(selected(reordered), 2);
  assert.equal(reordered.__portraitContinuity!.restore().remaining, 6000);
  const different = portrait(['another.jpg', 'other.jpg']); b.show(different);
  assert.equal(selected(different), 0);
  const otherProfile = portrait(photos, 'example.test|Another Person'); b.show(otherProfile);
  assert.equal(selected(otherProfile), 0);
  assert.ok([...b.storage.values()].every(value => !Object.hasOwn(JSON.parse(value), 'paused')));
});

test('navigation and back/forward restoration retain remaining delay with one timer and leave disabled pages untouched', async () => {
  const b = await browser(); const home = portrait(); b.show(home);
  b.runtime.initPortraitRotation(); b.advance(2500);
  b.runtime.destroyPortraitRotation(); const saved = [...b.storage]; b.show(); b.advance(120000);
  b.runtime.initPortraitRotation(); assert.deepEqual([...b.storage], saved);
  const about = portrait(photos, undefined, true); b.show(about);
  b.runtime.initPortraitRotation(); b.runtime.initPortraitRotation();
  assert.equal(b.timers.size, 1);
  b.advance(3499); assert.equal(selected(about), 0);
  b.advance(1); assert.equal(selected(about), 1);
  b.advance(1000); b.runtime.destroyPortraitRotation();
  b.show(home); assert.equal(selected(home), 1);
  b.runtime.initPortraitRotation(); assert.equal(b.timers.size, 1);
  b.advance(4999); assert.equal(selected(home), 1);
  b.advance(1); assert.equal(selected(home), 2);
  b.runtime.destroyPortraitRotation(); b.runtime.destroyPortraitRotation();
  assert.equal(b.timers.size, 0);
  assert.equal(b.document.listeners.get('visibilitychange')?.size, 0);
});

test('automatic photos keep cycling under reduced motion and ignore every input event', async () => {
  const b = await browser(); b.media.matches = true; const root = portrait(); root.hovering = true;
  b.show(root); b.document.activeElement = root; b.runtime.initPortraitRotation();
  assert.equal(root.listeners.size, 0, 'The portrait registers no mouse, keyboard, touch, or focus handlers');
  assert.equal(root.querySelectorAll('[data-portrait-slide]')[1].querySelector('img')!.loading, 'eager', 'The next hidden photo is fetched before the automatic change');
  for (const type of ['click', 'pointerdown', 'touchstart', 'dragstart', 'keydown', 'focusin', 'mouseenter']) root.fire(type);
  b.advance(6000); assert.equal(selected(root), 1);
  b.media.matches = false; b.media.fire('change');
  b.advance(6000); assert.equal(selected(root), 2);
  b.advance(6000); assert.equal(selected(root), 0);
  assert.equal(root.querySelectorAll('[data-portrait-slide]')[0].attributes.get('aria-hidden'), 'false');
  assert.equal(root.querySelectorAll('[data-portrait-slide]')[1].attributes.get('aria-hidden'), 'true');
  b.runtime.destroyPortraitRotation();
});

test('per-page automatic settings govern rotation and hidden tabs freeze the remaining countdown', async () => {
  const b = await browser(); const still = portrait(); still.dataset.autoplay = 'false'; b.show(still);
  b.runtime.initPortraitRotation(); assert.equal(b.timers.size, 0);
  b.advance(10000); assert.equal(selected(still), 0); b.runtime.destroyPortraitRotation();
  const root = portrait(); root.dataset.interval = '3000'; b.show(root); b.runtime.initPortraitRotation();
  b.advance(1000); b.document.hidden = true; b.document.fire('visibilitychange'); b.advance(60000);
  assert.equal(selected(root), 0); assert.equal(b.timers.size, 0);
  b.document.hidden = false; b.document.fire('visibilitychange');
  b.advance(1999); assert.equal(selected(root), 0); b.advance(1); assert.equal(selected(root), 1);
  b.advance(3000); assert.equal(selected(root), 2); b.runtime.destroyPortraitRotation();
});

test('corrupt, stale, future, and unavailable storage preserve automatic rotation', async () => {
  const b = await browser(); let root = portrait(); b.show(root); root.__portraitContinuity!.save(2, 3000);
  for (const key of b.storage.keys()) b.storage.set(key, '{malformed');
  root = portrait(); b.show(root); assert.equal(selected(root), 0);
  root.__portraitContinuity!.save(2, 3000); b.advance(12 * 60 * 60 * 1000 + 1);
  assert.equal(root.__portraitContinuity!.restore().index, 0);
  root = portrait(); b.show(root); assert.equal(selected(root), 0);
  root.__portraitContinuity!.save(2, 3000);
  for (const [key, value] of b.storage) { const state = JSON.parse(value); state.savedAt += 1000; b.storage.set(key, JSON.stringify(state)); }
  root = portrait(); b.show(root); assert.equal(selected(root), 0);
  b.blockStorage(); root = portrait(); b.show(root); b.runtime.initPortraitRotation();
  b.advance(6000); assert.equal(selected(root), 1); b.runtime.destroyPortraitRotation();
});
