import test from 'node:test';
import assert from 'node:assert/strict';
import { mountSiteNavigation } from '../src/scripts/navigation';

test('mobile navigation supports disclosure, Escape, resizing, and cleanup', () => {
  const original = { document: globalThis.document, window: globalThis.window, matchMedia: globalThis.matchMedia };
  const doc = { activeElement: null as unknown };
  class Element extends EventTarget {
    hidden = false;
    dataset: Record<string, string> = {};
    attributes: Record<string, string> = {};
    setAttribute(name: string, value: string) { this.attributes[name] = value; }
    focus() { doc.activeElement = this; }
    contains(value: unknown) { return value === this; }
    closest() { return null; }
  }
  const navigation = new Element();
  const toggle = new Element();
  toggle.hidden = true;
  const header = Object.assign(new Element(), {
    querySelector: (selector: string) => selector === '#site-navigation' ? navigation : toggle,
  });
  const media = Object.assign(new EventTarget(), { matches: true });
  const window = new EventTarget();
  Object.assign(globalThis, { document: doc, window, matchMedia: () => media });
  try {
    const cleanup = mountSiteNavigation({ querySelector: () => header } as unknown as ParentNode);
    assert.equal(toggle.hidden, false);
    assert.equal(navigation.hidden, true);
    assert.equal(toggle.attributes['aria-expanded'], 'false');
    toggle.dispatchEvent(new Event('click'));
    assert.equal(navigation.hidden, false);
    assert.equal(toggle.attributes['aria-expanded'], 'true');

    const escape = Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' });
    header.dispatchEvent(escape);
    assert.equal(escape.defaultPrevented, true);
    assert.equal(navigation.hidden, true);
    assert.equal(doc.activeElement, toggle);

    media.matches = false;
    media.dispatchEvent(new Event('change'));
    assert.equal(navigation.hidden, false);
    assert.equal(toggle.hidden, true);

    doc.activeElement = navigation;
    media.matches = true;
    media.dispatchEvent(new Event('change'));
    assert.equal(navigation.hidden, true);
    assert.equal(doc.activeElement, toggle);

    cleanup();
    assert.equal(navigation.hidden, false);
    assert.equal(toggle.hidden, true);
    toggle.dispatchEvent(new Event('click'));
    assert.equal(navigation.hidden, false);
  } finally {
    Object.assign(globalThis, original);
  }
});
