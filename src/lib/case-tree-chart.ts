import * as am5 from '@amcharts/amcharts5';
import * as am5hierarchy from '@amcharts/amcharts5/hierarchy';
import settings from '../config/case-visuals.json';
import { caseChartStyle } from './case-chart-style';
import { treeLabelWidth, treeNodeFootprint, treeNodeLabel } from './case-tree-label';
import { fitTreeBounds, mergeTreeBounds, treeFitPanLimit, type TreeBounds } from './case-tree-view';
import type { CaseNode, CaseTreeData, CaseVisual, CaseVisualState } from './case-visuals';

export function createCaseTree(host: HTMLElement, figure: HTMLElement, data: CaseTreeData,
  motionEnabled: boolean, viewportVisible: boolean, saved: CaseVisualState = {}): CaseVisual {
  const root = am5.Root.new(host);
  let series: am5hierarchy.ForceDirected | undefined;
  let resize: ResizeObserver | undefined;
  const interactions = new AbortController();
  try {
    const { dark, ink, muted, tooltip } = caseChartStyle(root, figure);
    const paper = am5.color(getComputedStyle(figure).getPropertyValue('--paper').trim());
    let enabled = motionEnabled;
    let visible = viewportVisible;
    let settle = true;
    let initialized = false;
    let collisionDirty = true;
    let autoFit = saved.treeAutoFit ?? !saved.zoom;
    let fitPending = autoFit;
    let lastFitAt = 0;
    let labelWidth = treeLabelWidth(host.clientWidth, settings.tree.labelWidth, settings.tree.mobileLabelWidth);
    const textContext = document.createElement('canvas').getContext('2d');
    const measure = (text: string) => {
      if (!textContext) return text.length * settings.tree.labelFontSize * 0.6;
      textContext.font = `500 ${settings.tree.labelFontSize}px Inter, sans-serif`;
      return textContext.measureText(text).width;
    };
    const labelCache = new Map<CaseNode, { text: string; width: number; height: number }>();
    function labelLayout(node: CaseNode) {
      let layout = labelCache.get(node);
      if (!layout) {
        const lines = treeNodeLabel(node, labelWidth - settings.tree.labelPadding * 2, settings.tree.labelMaxLines, measure);
        layout = { text: lines.join('\n'), width: Math.max(...lines.map(measure), 0) + settings.tree.labelPadding * 2,
          height: lines.length * settings.tree.labelLineHeight + settings.tree.labelPadding * 2 };
        labelCache.set(node, layout);
      }
      return layout;
    }
    const duration = () => enabled ? 200 : 0;
    const zoom = root.container.children.push(am5.ZoomableContainer.new(root, {
      width: am5.p100, height: am5.p100, wheelable: true, pinchZoom: true,
      maskContent: true, minZoomLevel: 0.05, maxZoomLevel: 5, zoomStep: 1.2, animationDuration: duration(),
      background: am5.Rectangle.new(root, { fill: paper, fillOpacity: 1 }),
    }));
    const tree = series = zoom.contents.children.push(am5hierarchy.ForceDirected.new(root, {
      width: am5.p100, height: am5.p100,
      // Clip once at the viewport, not inside the moving graph. A series mask
      // permanently cuts off outlying nodes even when the view is zoomed out.
      maskContent: false,
      categoryField: 'label', idField: 'id', childDataField: 'children', valueField: 'value',
      initialDepth: settings.tree.initialDepth, downDepth: 1, topDepth: 0, singleBranchOnly: false,
      minRadius: settings.tree.minRadius, maxRadius: settings.tree.maxRadius,
      nodePadding: settings.tree.labelPadding, manyBodyStrength: -14, centerStrength: 0.4, velocityDecay: 0.6,
      showOnFrame: 0, animationDuration: duration(), stateAnimationDuration: duration(),
    }));
    // The ZoomableContainer's oversized background travels with its contents
    // and provides a continuous hit area for wheel, pinch, and drag gestures.
    zoom.contents.get('background')?.setAll({ fill: paper, fillOpacity: 1, strokeOpacity: 0 });
    const color = (node?: CaseNode) => node ? am5.color(dark ? node.dark : node.light) : muted;
    tree.nodes.template.setAll({
      interactive: true, focusable: true, hoverOnFocus: true, cursorOverStyle: 'pointer', role: 'button',
      tooltip, tooltipText: 'Explore cases', tooltipPosition: 'pointer', stateAnimationDuration: duration(),
    });
    tree.nodes.template.adapters.add('tooltipText', (_text, node) => (node.dataItem?.dataContext as CaseNode)?.tooltip ?? 'Explore cases');
    tree.nodes.template.adapters.add('ariaLabel', (_text, node) => (node.dataItem?.dataContext as CaseNode)?.tooltip.replace(/\n/g, '. ') ?? 'Explore cases');
    tree.nodes.template.adapters.add('role', (_role, node) => (node.dataItem?.dataContext as CaseNode)?.type === 'case' ? 'link' : 'button');
    tree.nodes.template.events.on('click', ({ target }) => {
      if (target.isDragging()) return;
      const node = target.dataItem?.dataContext as CaseNode | undefined;
      if (node?.type === 'case' && node.url) window.location.assign(node.url);
      else { settle = true; autoFit = true; requestFit(); } // Built-in parent toggling remains intact.
    });
    tree.nodes.template.events.on('dragstart', stopAutoFit);
    tree.nodes.template.events.on('dragstop', () => { settle = true; });
    zoom.contents.events.on('dragstart', stopAutoFit);
    host.addEventListener('pointerdown', stopAutoFit, { passive: true, signal: interactions.signal });
    host.addEventListener('wheel', stopAutoFit, { passive: true, signal: interactions.signal });
    tree.circles.template.setAll({ strokeOpacity: 0.85, strokeWidth: 1, fillOpacity: 0.92 });
    tree.circles.template.adapters.add('fill', (_fill, circle) => color(circle.dataItem?.dataContext as CaseNode));
    tree.circles.template.adapters.add('stroke', (_stroke, circle) => color(circle.dataItem?.dataContext as CaseNode));
    tree.outerCircles.template.setAll({ fillOpacity: 0.08, strokeOpacity: 0.5, strokeWidth: 2 });
    tree.outerCircles.template.adapters.add('fill', (_fill, circle) => color(circle.dataItem?.dataContext as CaseNode));
    tree.outerCircles.template.adapters.add('stroke', (_stroke, circle) => color(circle.dataItem?.dataContext as CaseNode));
    tree.links.template.setAll({ stroke: muted, strokeWidth: 1.5, strokeOpacity: 0.4 });
    tree.labels.template.setAll({
      fill: ink, fontFamily: 'Inter, sans-serif', fontSize: settings.tree.labelFontSize, fontWeight: '500',
      // amCharts uses a font-height multiplier; geometry settings stay in pixels.
      lineHeight: settings.tree.labelLineHeight / settings.tree.labelFontSize,
      centerY: 0, textAlign: 'center', oversizedBehavior: 'none',
      paddingTop: settings.tree.labelPadding, paddingBottom: settings.tree.labelPadding,
      paddingLeft: settings.tree.labelPadding, paddingRight: settings.tree.labelPadding,
      populateText: false, ignoreFormatting: true,
    });
    // LinkedHierarchy resets these bounds to the circle diameter whenever a
    // radius changes. Adapters keep external labels independent of that size.
    tree.labels.template.adapters.add('maxWidth', () => labelWidth);
    tree.labels.template.adapters.add('maxHeight', () => settings.tree.labelMaxLines * settings.tree.labelLineHeight + settings.tree.labelPadding * 2);
    tree.labels.template.adapters.add('y', (_y, label) =>
      ((label.dataItem as Item | undefined)?.get('circle')?.get('radius', settings.tree.minRadius) ?? settings.tree.minRadius) + settings.tree.labelGap);
    tree.labels.template.adapters.add('text', (_text, label) => {
      const node = label.dataItem?.dataContext as CaseNode | undefined;
      return node ? labelLayout(node).text : '';
    });

    type Item = am5.DataItem<am5hierarchy.IForceDirectedDataItem>;
    function stopAutoFit() { autoFit = false; fitPending = false; }
    function requestFit() {
      if (autoFit) { fitPending = true; tree.markDirty(); }
    }
    function fitVisibleTree() {
      const rectangles: TreeBounds[] = [];
      visit(tree.dataItems, (item) => {
        const node = item.get('node');
        if (!node.isVisibleDeep() || node.isHidden() || node.isHiding() || node.get('scale', 1) < 0.01) return;
        // Hierarchy nodes are unmeasured, and the pan background is oversized.
        // Measure the actual artwork and labels in unzoomed content coordinates.
        for (const sprite of [item.get('circle'), item.get('outerCircle'), item.get('label')]) {
          if (!sprite.isVisibleDeep() || sprite.isHidden() || sprite.isHiding()) continue;
          const bounds = sprite.localBounds();
          const points = [
            { x: bounds.left, y: bounds.top }, { x: bounds.right, y: bounds.top },
            { x: bounds.right, y: bounds.bottom }, { x: bounds.left, y: bounds.bottom },
          ].map((point) => zoom.contents.toLocal(sprite.toGlobal(point)));
          rectangles.push({ left: Math.min(...points.map(({ x }) => x)), top: Math.min(...points.map(({ y }) => y)),
            right: Math.max(...points.map(({ x }) => x)), bottom: Math.max(...points.map(({ y }) => y)) });
        }
      });
      const transform = fitTreeBounds(mergeTreeBounds(rectangles), zoom.width(), zoom.height());
      if (!transform) return;
      zoom.set('minZoomLevel', Math.min(0.05, transform.scale / 2));
      const panLimit = treeFitPanLimit(transform, zoom.width(), zoom.height(), zoom.contents.width(), zoom.contents.height());
      if (zoom.get('maxPanOut', 0.4) !== panLimit) {
        zoom.set('maxPanOut', panLimit);
        // The pan adapters read this setting from their parent. Refresh a
        // previously clamped position even when its stored x/y is unchanged.
        zoom.contents.markDirtyPosition();
      }
      if (Math.abs(zoom.contents.x() - transform.x) > 0.1 || Math.abs(zoom.contents.y() - transform.y) > 0.1
        || Math.abs(zoom.contents.get('scale', 1) - transform.scale) > 0.0001) zoom.contents.setAll(transform);
      fitPending = false;
      lastFitAt = performance.now();
    }
    function footprint(item: Item) {
      const node = item.get('node');
      if (node.isHidden()) return 0;
      const layout = labelLayout(item.dataContext as CaseNode);
      return treeNodeFootprint(item.get('circle').get('radius', settings.tree.minRadius), layout.width, layout.height,
        settings.tree.labelGap, settings.tree.labelPadding) * node.get('scale', 1);
    }
    const collisionRadius = (node: unknown) => {
      const item = (node as { dataItem?: Item }).dataItem;
      return item ? footprint(item) : 0;
    };
    tree.circles.template.events.on('boundschanged', ({ target }) => {
      (target.dataItem as Item | undefined)?.get('label').markDirtyKey('y');
      collisionDirty = true;
    });
    tree.links.template.adapters.add('distance', (distance, link) => {
      const source = link.get('source') as Item | undefined;
      const target = link.get('target') as Item | undefined;
      if (!source || !target) return distance;
      const radii = source.get('circle').get('radius', 1) + target.get('circle').get('radius', 1);
      return (footprint(source) + footprint(target)) / Math.max(1, radii);
    });
    function refreshLabels() {
      labelWidth = treeLabelWidth(host.clientWidth, settings.tree.labelWidth, settings.tree.mobileLabelWidth);
      labelCache.clear();
      for (const label of tree.labels) {
        label.markDirtyKey('text'); label.markDirtyKey('maxWidth'); label.markDirtyKey('maxHeight');
      }
      collisionDirty = true;
      settle = true;
      requestFit();
      resume();
    }

    const bullets: { animation: { pause(): void; play(): void }; endpointsVisible(): boolean }[] = [];
    tree.linkBullets.push((bulletRoot, source, target) => {
      const bullet = am5.Bullet.new(bulletRoot, {
        locationX: 0, sprite: am5.Circle.new(bulletRoot, {
          radius: 3, fill: color(target.dataContext as CaseNode), fillOpacity: 0.9, interactive: false,
        }),
      });
      const animation = bullet.animate({ key: 'locationX', from: 0, to: 1,
        duration: settings.tree.bulletDuration, loops: Infinity });
      bullets.push({ animation, endpointsVisible: () => [source, target].every((item) => {
        const node = item.get('node');
        return !node.isHidden() && !node.isHiding();
      }) });
      if (!enabled || !visible) animation.pause();
      return bullet;
    });
    function syncMotion() {
      const running = enabled && visible;
      for (const bullet of bullets) {
        if (running && bullet.endpointsVisible()) bullet.animation.play();
        else bullet.animation.pause();
      }
      if (!running) tree.d3forceSimulation.stop();
    }
    function resume() {
      if (enabled && visible) tree.d3forceSimulation.alpha(Math.max(tree.d3forceSimulation.alpha(), 0.3)).restart();
      // A preloaded, paused chart can have no active animation frame when it
      // first scrolls into view. Request one to compute its static layout.
      else if (visible && settle) tree.markDirtySize();
      syncMotion();
    }
    function visit(items: Item[], callback: (item: Item) => void) {
      for (const item of items) { callback(item); visit(item.get('children', []), callback); }
    }
    function collapseCases() {
      // Restore investigations/categories while keeping case leaves collapsed.
      tree.enableDataItem(tree.dataItems[0], settings.tree.initialDepth, 0, 0);
      visit(tree.dataItems, (item) => {
        if ((item.dataContext as CaseNode).type === 'category') tree.disableDataItem(item, 0);
      });
      settle = true;
      autoFit = true;
      requestFit();
    }
    tree.data.setAll([structuredClone(data.tree)]);
    tree.set('selectedDataItem', tree.dataItems[0]);
    function restore(items: Item[], expanded: Set<string>) {
      for (const item of items) {
        const children = item.get('children', []);
        if (!children.length) continue;
        if (expanded.has((item.dataContext as CaseNode).id)) {
          tree.enableDataItem(item, 1, 0, 0);
          restore(children, expanded);
        } else tree.disableDataItem(item, 0);
      }
    }
    // Physics runs on a separate D3 timer. Pausing amCharts animations alone
    // would leave nodes moving and the simulation alive after disposal.
    root.events.on('frameended', () => {
      // Hierarchy refreshes the circle collision force on expansion/resize.
      // Replace its accessor afterward so labels participate in every layout.
      if (collisionDirty || tree.collisionForce.radius() !== collisionRadius) {
        tree.collisionForce.radius(collisionRadius);
        collisionDirty = false;
      }
      if (!initialized) {
        initialized = true;
        settle = true;
        // Hierarchy applies selectedDataItem on its first frame. Restore only
        // afterward so initialDepth cannot overwrite the saved expansion.
        if (saved.expanded) {
          restore(tree.dataItems, new Set(saved.expanded));
          if (saved.zoom) zoom.contents.setAll(saved.zoom);
          tree.markDirtySize();
          syncMotion();
          return;
        }
      }
      if (!enabled || !visible) {
        tree.d3forceSimulation.stop();
        if (settle && visible) {
          tree.updateNodePositions();
          tree.d3forceSimulation.alpha(1).tick(160);
          tree.updateNodePositions();
          settle = false;
          requestFit();
          // Position changes are rendered on the next frame; fitting earlier
          // would measure the old label/circle transforms.
          return;
        }
      } else settle = false;
      if (autoFit && visible && (fitPending || (tree.d3forceSimulation.alpha() > 0.005 && performance.now() - lastFitAt > 120))) fitVisibleTree();
      syncMotion();
    });
    tree.d3forceSimulation.on('end.case-view', requestFit);
    tree.events.on('boundschanged', () => { settle = true; });
    resize = new ResizeObserver(refreshLabels);
    resize.observe(host);
    void document.fonts?.ready.then(() => { if (!root.isDisposed()) refreshLabels(); });
    // Explicit tooltip colors also apply to labels on dark and light canvases.
    root.interfaceColors.set('text', ink);
    return {
      state() {
        const expanded: string[] = [];
        visit(tree.dataItems, (item) => {
          if (item.get('children')?.length && !item.get('disabled')) expanded.push((item.dataContext as CaseNode).id);
        });
        return { expanded, treeAutoFit: autoFit, zoom: { x: zoom.contents.x(), y: zoom.contents.y(), scale: zoom.contents.get('scale', 1) } };
      },
      motion(value) {
        enabled = value;
        zoom.set('animationDuration', duration());
        tree.setAll({ animationDuration: duration(), stateAnimationDuration: duration() });
        tree.nodes.template.set('stateAnimationDuration', duration());
        resume();
      },
      visible(value) { visible = value; if (value) requestFit(); resume(); },
      action(action) {
        if (action === 'zoom-in') { stopAutoFit(); zoom.zoomIn(); }
        if (action === 'zoom-out') { stopAutoFit(); zoom.zoomOut(); }
        if (action === 'reset') { autoFit = true; requestFit(); }
        if (action === 'collapse') collapseCases();
        resume();
      },
      dispose() { interactions.abort(); resize?.disconnect(); tree.d3forceSimulation.on('end.case-view', null); tree.d3forceSimulation.stop(); root.dispose(); },
    };
  } catch (error) { interactions.abort(); resize?.disconnect(); series?.d3forceSimulation.stop(); root.dispose(); throw error; }
}
