import assert from 'node:assert/strict';
import test from 'node:test';
import { treeLabelWidth, treeNodeFootprint, treeNodeLabel, wrapTreeLabel } from '../src/lib/case-tree-label';

const measure = (text: string) => [...text].reduce((width, letter) => width + (letter === 'W' ? 11 : 6), 0);

test('long category and case labels wrap to a readable bounded footprint', () => {
  for (const label of ['Corporate civil lawsuits', 'Tracing cryptocurrency through complex corporate civil litigation', 'WWWWWWWWWWWWWWWWWWWWWWWWWWWW']) {
    const lines = wrapTreeLabel(label, 120, 3, measure);
    assert.ok(lines.length <= 3);
    assert.ok(lines.every((line) => measure(line) <= 120), lines.join('\n'));
  }
  assert.deepEqual(wrapTreeLabel('Corporate civil lawsuits', 120, 3, measure), ['Corporate civil', 'lawsuits']);
});

test('overflow is marked, while branch counts retain their own line', () => {
  const text = 'Tracing cryptocurrency through a very long chain of corporate entities';
  const lines = treeNodeLabel({ label: text, type: 'category', count: 96 }, 120, 3, measure);
  assert.equal(lines.length, 3);
  assert.match(lines[1], /…$/);
  assert.equal(lines[2], '96');
  assert.deepEqual(treeNodeLabel({ label: 'Casework', type: 'root', count: 96 }, 120, 3, measure), ['Casework', '96']);
  assert.deepEqual(treeNodeLabel({ label: 'A short case', type: 'case', count: 1 }, 120, 3, measure), ['A short case']);
});

test('labels adapt to narrow viewports without growing circles', () => {
  assert.equal(treeLabelWidth(280, 148, 112), 112);
  assert.equal(treeLabelWidth(330, 148, 112), 132);
  assert.equal(treeLabelWidth(900, 148, 112), 148);
  const radius = 16, width = 148, height = 60, gap = 7, padding = 6;
  const footprint = treeNodeFootprint(radius, width, height, gap, padding);
  assert.ok(footprint > Math.hypot(width / 2, radius + gap + height));
  assert.ok(treeNodeFootprint(radius, width, height + 16, gap, padding) > footprint);
  assert.ok(treeNodeFootprint(radius, width + 20, height, gap, padding) > footprint);
});

test('collision spacing separates long external labels in horizontal and diagonal layouts', () => {
  const label = { width: 148, height: 60 }, circle = 16, gap = 7;
  const separation = 2 * treeNodeFootprint(circle, label.width, label.height, gap, 6);
  for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI * 3 / 4]) {
    const dx = Math.abs(Math.cos(angle) * separation), dy = Math.abs(Math.sin(angle) * separation);
    assert.ok(dx > label.width || dy > label.height, 'External label rectangles must not overlap');
    assert.ok(separation > 2 * circle, 'Circles remain small while labels reserve the space they need');
  }
});
