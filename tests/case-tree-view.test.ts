import assert from 'node:assert/strict';
import test from 'node:test';
import { fitTreeBounds, mergeTreeBounds, treeFitPanLimit, type TreeBounds } from '../src/lib/case-tree-view';

function assertFits(bounds: TreeBounds, width: number, height: number, padding = 24, maxScale = 1.5) {
  const transform = fitTreeBounds(bounds, width, height, padding, maxScale);
  assert.ok(transform);
  const { x, y, scale } = transform;
  const epsilon = 1e-8;
  assert.ok(bounds.left * scale + x >= padding - epsilon);
  assert.ok(bounds.top * scale + y >= padding - epsilon);
  assert.ok(bounds.right * scale + x <= width - padding + epsilon);
  assert.ok(bounds.bottom * scale + y <= height - padding + epsilon);
  assert.ok(Math.abs((bounds.left + bounds.right) / 2 * scale + x - width / 2) < epsilon);
  assert.ok(Math.abs((bounds.top + bounds.bottom) / 2 * scale + y - height / 2) < epsilon);
  return transform;
}

test('bounds include off-center circles and the full external label below them', () => {
  const circles = { left: -120, top: -40, right: 70, bottom: 20 };
  const label = { left: -164, top: 30, right: 104, bottom: 96 };
  const rectangles = [circles, label] as const;
  const bounds = mergeTreeBounds(rectangles);
  assert.deepEqual(bounds, { left: -164, top: -40, right: 104, bottom: 96 });
  assertFits(bounds!, 800, 400);
  assert.deepEqual(circles, { left: -120, top: -40, right: 70, bottom: 20 });
  assert.notEqual(mergeTreeBounds([circles]), circles, 'Merging does not return a mutable input object');
});

test('bounds merging skips invalid rectangles and has no bounds for empty input', () => {
  assert.equal(mergeTreeBounds([]), undefined);
  const invalid = [
    { left: NaN, top: 0, right: 10, bottom: 20 },
    { left: 0, top: 0, right: Infinity, bottom: 20 },
    { left: 10, top: 0, right: 0, bottom: 20 },
    { left: 0, top: 20, right: 10, bottom: 0 },
  ];
  assert.equal(mergeTreeBounds(invalid), undefined);
  const valid = { left: 2, top: 4, right: 20, bottom: 40 };
  assert.deepEqual(mergeTreeBounds([...invalid, valid]), valid);
});

test('landscape, portrait, and narrow viewports fit large positive or negative extents without cropping', () => {
  for (const viewport of [[1200, 450], [450, 1200], [280, 500]]) {
    for (const bounds of [
      { left: -1400, top: -300, right: 800, bottom: 1200 },
      { left: 3200, top: 1000, right: 9000, bottom: 2400 },
      { left: -9000, top: -2400, right: -3200, bottom: -1000 },
    ]) {
      const transform = assertFits(bounds, viewport[0], viewport[1]);
      assert.ok(transform.scale < 0.5, 'Large expansions can zoom out beyond the old 0.5 minimum');
    }
  }
});

test('automatic fitting respects the scale cap and uses one shared scale for both axes', () => {
  assert.deepEqual(fitTreeBounds({ left: 0, top: 0, right: 100, bottom: 100 }, 500, 400),
    { x: 175, y: 125, scale: 1.5 });
  assert.deepEqual(fitTreeBounds({ left: 0, top: 0, right: 100, bottom: 100 }, 500, 400, 24, 1),
    { x: 200, y: 150, scale: 1 });
  const bounds = { left: -40, top: 30, right: 760, bottom: 230 };
  const transform = assertFits(bounds, 448, 448);
  assert.equal(transform.scale, 0.5);
});

test('point and zero-width bounds produce finite centered views without division by zero', () => {
  assert.deepEqual(fitTreeBounds({ left: 50, top: -30, right: 50, bottom: -30 }, 300, 200),
    { x: 75, y: 145, scale: 1.5 });
  assertFits({ left: -10, top: -200, right: -10, bottom: 800 }, 300, 200);
  assertFits({ left: -400, top: 80, right: 500, bottom: 80 }, 300, 200);
});

test('invalid bounds, viewports, padding, and scale caps do not produce transforms', () => {
  const valid = { left: 0, top: 0, right: 100, bottom: 100 };
  assert.equal(fitTreeBounds(undefined, 400, 300), undefined);
  for (const bounds of [
    { ...valid, left: NaN }, { ...valid, bottom: Infinity },
    { ...valid, left: 101 }, { ...valid, top: 101 },
    { ...valid, left: -Number.MAX_VALUE, right: Number.MAX_VALUE },
  ]) assert.equal(fitTreeBounds(bounds, 400, 300), undefined);
  for (const [width, height] of [[0, 300], [-1, 300], [400, 0], [Infinity, 300], [400, NaN], [48, 300], [400, 48]]) {
    assert.equal(fitTreeBounds(valid, width, height), undefined);
  }
  for (const padding of [-1, Infinity, NaN]) assert.equal(fitTreeBounds(valid, 400, 300, padding), undefined);
  for (const maxScale of [0, -1, Infinity, NaN]) assert.equal(fitTreeBounds(valid, 400, 300, 24, maxScale), undefined);
  assertFits(valid, 100, 100, 0);
});

test('the zoom container pan limit does not shift fitted asymmetric graphs back outside the viewport', () => {
  // Same upper/lower clamps used by ZoomableContainer for scale >= 1.
  const clamp = (position: number, viewport: number, content: number, scale: number, limit: number) =>
    scale < 1 ? position : Math.max(viewport - content * scale * (1 + limit), Math.min(content * limit, position));
  const width = 400, height = 300;
  const offCenter = { left: -200, top: 0, right: 0, bottom: 200 };
  const first = assertFits(offCenter, width, height);
  assert.ok(offCenter.left * first.scale + clamp(first.x, width, width, first.scale, 0.4) < 0,
    'The old default pan limit clips a graph even after its fit has been calculated');
  for (const bounds of [
    offCenter,
    { left: 500, top: 0, right: 700, bottom: 200 },
    { left: 0, top: -300, right: 200, bottom: -100 },
    { left: 0, top: 500, right: 200, bottom: 700 },
  ]) {
    const transform = assertFits(bounds, width, height);
    assert.ok(transform.scale >= 1);
    for (const [contentWidth, contentHeight] of [[width, height], [200, 150], [800, 600]]) {
      const limit = treeFitPanLimit(transform, width, height, contentWidth, contentHeight);
      assert.ok(limit >= 0.4);
      const x = clamp(transform.x, width, contentWidth, transform.scale, limit);
      const y = clamp(transform.y, height, contentHeight, transform.scale, limit);
      assert.equal(x, transform.x);
      assert.equal(y, transform.y);
      assert.ok(bounds.left * transform.scale + x >= 24 - 1e-8);
      assert.ok(bounds.top * transform.scale + y >= 24 - 1e-8);
      assert.ok(bounds.right * transform.scale + x <= width - 24 + 1e-8);
      assert.ok(bounds.bottom * transform.scale + y <= height - 24 + 1e-8);
    }
  }
});

test('ordinary fits retain the default pan limit and unzoomed/invalid geometry does not expand it', () => {
  const centered = assertFits({ left: 100, top: 50, right: 300, bottom: 250 }, 400, 300);
  assert.equal(treeFitPanLimit(centered, 400, 300, 400, 300), 0.4);
  assert.equal(treeFitPanLimit({ x: 2000, y: -2000, scale: 0.5 }, 400, 300, 400, 300), 0.4);
  assert.equal(treeFitPanLimit({ x: NaN, y: 0, scale: 1 }, 400, 300, 400, 300), 0.4);
  assert.equal(treeFitPanLimit(centered, 400, 300, 0, 300), 0.4);
});
