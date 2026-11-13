import * as am5 from '@amcharts/amcharts5';
import * as am5xy from '@amcharts/amcharts5/xy';
import * as am5timeline from '@amcharts/amcharts5/timeline';
import am5themes_Dark from '@amcharts/amcharts5/themes/Dark';
import { careerTooltip, timelineWindow, type CareerChartData } from './career-timeline';

export type CareerChart = { dispose(): void; select(id: string): void; window(): { start: number; end: number } };

export function createCareerChart(host: HTMLElement, figure: HTMLElement, data: CareerChartData,
  navigate: (id: string) => void, viewport: { start: number; end: number }): CareerChart {
  const root = am5.Root.new(host);
  const abort = new AbortController();
  let resize: ResizeObserver | undefined;
  let announcement: ReturnType<typeof setTimeout> | undefined;
  try {
    const dark = document.documentElement.dataset.theme === 'dark';
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scale = data.settings.scale;
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
    const style = getComputedStyle(figure);
    const ink = am5.color(style.getPropertyValue('--ink').trim());
    const muted = am5.color(style.getPropertyValue('--muted').trim());
    const paper = am5.color(style.getPropertyValue('--paper').trim());
    if (dark) root.setThemes([am5themes_Dark.new(root)]);
    root.utc = true;
    root.fps = 30;
    root.dateFormatter.set('dateFormat', 'MMM yyyy');
    root.interfaceColors.setAll({ text: ink, grid: muted });
    const chart = root.container.children.push(am5timeline.SerpentineChart.new(root, {
      orientation: 'vertical', levelCount: data.settings.levels.desktop,
      yAxisRadius: am5.percent(Math.min(65, Math.max(32, data.lanes.length * 16))),
      startLocation: 0, endLocation: 1,
      panX: false, panY: false, wheelX: 'none', wheelY: 'none',
      paddingTop: 35, paddingBottom: 30, paddingLeft: 28, paddingRight: 28,
      layout: root.verticalLayout,
    }));
    // Keep the canvas and every broad surface transparent over tsParticles.
    for (const container of [root.container, chart, chart.plotContainer]) {
      container.get('background')?.setAll({ fillOpacity: 0, strokeOpacity: 0 });
    }
    chart.zoomOutButton.set('forceHidden', true); // Accessible HTML reset below.
    const yRenderer = am5timeline.AxisRendererCurveY.new(root, {});
    yRenderer.labels.template.set('forceHidden', true);
    yRenderer.grid.template.set('forceHidden', true);
    yRenderer.axisFills.template.set('forceHidden', true);
    const xRenderer = am5timeline.AxisRendererCurveX.new(root, {
      yRenderer, stroke: muted, strokeWidth: 2, strokeOpacity: 0.65, minGridDistance: 85,
    });
    xRenderer.labels.template.setAll({ fill: ink, fontSize: 14 * scale, fontFamily: 'Inter, sans-serif',
      centerY: am5.p50, paddingTop: 10, paddingBottom: 10, minPosition: 0.015, maxPosition: 0.985 });
    xRenderer.grid.template.setAll({ stroke: muted, strokeOpacity: 0.18 });
    xRenderer.axisFills.template.set('forceHidden', true);
    const yAxis = chart.yAxes.push(am5xy.CategoryAxis.new<typeof am5xy.CategoryAxis, am5xy.CategoryAxis<am5timeline.AxisRendererCurveY>>(root, {
      categoryField: 'category', renderer: yRenderer, maxDeviation: 0,
    }));
    const xAxis = chart.xAxes.push(am5xy.DateAxis.new<typeof am5xy.DateAxis, am5xy.DateAxis<am5timeline.AxisRendererCurveX>>(root, {
      renderer: xRenderer, baseInterval: { timeUnit: 'month', count: 1 },
      min: data.from, max: data.to, strictMinMax: true, maxDeviation: 0,
      groupData: false, minZoomCount: 6,
      gridIntervals: [{ timeUnit: 'month', count: 1 }, { timeUnit: 'month', count: 3 },
        { timeUnit: 'month', count: 6 }, { timeUnit: 'year', count: 1 },
        { timeUnit: 'year', count: 2 }, { timeUnit: 'year', count: 5 }, { timeUnit: 'year', count: 10 }],
      dateFormats: { month: 'MMM yyyy', year: 'yyyy' },
      periodChangeDateFormats: { month: 'MMM yyyy', year: 'yyyy' },
    }));
    yAxis.data.setAll(data.lanes);
    const roles = new Map(data.roles.map((role) => [role.id, role]));
    const points = data.spans.map((span) => {
      const role = roles.get(span.id)!;
      return { ...span, organization: role.organization, role: role.role, label: role.label, tooltipText: careerTooltip(role, span),
        color: am5.color(dark ? role.dark : role.light),
        status: span.scheduled ? 'Scheduled role' : span.current ? 'Current role' : 'Past role' };
    });
    let selectedId = '';
    type Point = (typeof points)[number];
    // Fixed paper/ink colors must not be overridden based on the band's color.
    // This tooltip belongs to hovered sprites, independently of CurveCursor.
    const tooltip = am5.Tooltip.new(root, { autoTextColor: false, getFillFromSprite: false, getStrokeFromSprite: false, getLabelFillFromSprite: false });
    tooltip.get('background')?.setAll({ fill: paper, fillOpacity: 0.97, stroke: muted, strokeOpacity: 0.5 });
    tooltip.label.setAll({ fill: ink, fontSize: 15, maxWidth: 350, oversizedBehavior: 'wrap', populateText: false, ignoreFormatting: true });
    const series = chart.series.push(am5timeline.CurveColumnSeries.new(root, {
      xAxis, yAxis, baseAxis: yAxis, categoryYField: 'category',
      openValueXField: 'from', valueXField: 'to',
      locationX: 0, openLocationX: 0, exactLocationX: true,
    }));
    series.columns.template.setAll({
      height: am5.percent(76), fillOpacity: 0.68, strokeOpacity: 0.9, strokeWidth: 1.5,
      interactive: true, cursorOverStyle: 'pointer', focusable: true, hoverOnFocus: true,
      role: 'link', ariaLabel: '{organization}. {role}. {dates}. {status}. Press Enter to read role details.',
      tooltip, tooltipText: 'Select to read role details.', tooltipPosition: 'pointer',
    });
    series.columns.template.states.create('hover', { fillOpacity: 0.95, strokeWidth: 3 });
    series.columns.template.adapters.add('tooltipText', (_text, column) => (column.dataItem?.dataContext as Point)?.tooltipText ?? 'Select to read role details.');
    series.columns.template.adapters.add('fill', (fill, column) => (column.dataItem?.dataContext as Point)?.color ?? fill);
    series.columns.template.adapters.add('stroke', (stroke, column) => (column.dataItem?.dataContext as Point)?.color ?? stroke);
    series.columns.template.adapters.add('fillOpacity', (opacity, column) => (column.dataItem?.dataContext as Point)?.id === selectedId ? 0.95 : opacity);
    series.columns.template.adapters.add('strokeWidth', (width, column) => (column.dataItem?.dataContext as Point)?.id === selectedId ? 3.5 : width);
    series.columns.template.adapters.add('strokeDasharray', (dash, column) => (column.dataItem?.dataContext as Point)?.scheduled ? [4, 3] : dash);
    series.columns.template.events.on('click', ({ target }) => {
      const point = target.dataItem?.dataContext as Point | undefined;
      if (point) navigate(point.id);
    });
    // A zero-duration future role is represented only by its start marker.
    series.columns.template.adapters.add('forceHidden', (hidden, column) => (column.dataItem?.dataContext as Point)?.planned || hidden);
    for (const edge of [0, 1]) series.bullets.push((_root, _series, item) => {
      const point = item.dataContext as Point;
      if (point.planned && edge === 1) return;
      const circle = am5.Circle.new(root, {
        radius: (point.planned ? 7 : point.current && edge === 1 ? 6 : 4) * scale,
        fill: point.color, fillOpacity: point.scheduled ? 0.3 : 1,
        stroke: point.color, strokeWidth: point.current && edge === 1 ? 3 : 1,
        interactive: true, cursorOverStyle: 'pointer',
        focusable: point.planned, role: 'link', hoverOnFocus: true,
        ariaLabel: `${point.organization}. ${point.dates}. Press Enter to read role details.`,
        tooltipText: point.tooltipText, tooltip,
      });
      circle.events.on('click', () => navigate(point.id));
      return am5.Bullet.new(root, { sprite: circle, locationX: edge, locationY: 0.5 });
    });
    series.data.setAll(points);
    // CurveColumnSeries bullets read the item's location rather than the series
    // setting. Without this, endpoints shift to the middle of their month.
    for (const item of series.dataItems) item.set('locationX', 0);

    const present = xAxis.createAxisRange(xAxis.makeDataItem({ value: data.present }));
    present.get('grid')?.setAll({ visible: true, stroke: ink, strokeOpacity: 0.85, strokeWidth: 2, strokeDasharray: [3, 3] });
    present.get('label')?.setAll({ text: 'Present', fill: ink, fontSize: 14 * scale, inside: true, minPosition: 0, maxPosition: 1, location: 0 });
    const cursor = chart.set('cursor', am5timeline.CurveCursor.new(root, {
      xAxis, yAxis, behavior: finePointer.matches ? 'zoomX' : 'none',
    }));
    cursor.lineY.set('visible', false);
    cursor.lineX.setAll({ stroke: muted, strokeOpacity: 0.5 });
    const changePointer = () => cursor.set('behavior', finePointer.matches ? 'zoomX' : 'none');
    finePointer.addEventListener('change', changePointer, { signal: abort.signal });
    const scrollbar = chart.set('scrollbarX', am5.Scrollbar.new(root, {
      orientation: 'horizontal', height: 24, marginTop: 20,
    }));
    scrollbar.get('background')?.setAll({ fill: muted, fillOpacity: 0.08 });
    scrollbar.thumb.setAll({ fill: muted, fillOpacity: 0.3 });
    scrollbar.startGrip.set('ariaLabel', 'Start of visible timeline. Use arrow keys to adjust.');
    scrollbar.endGrip.set('ariaLabel', 'End of visible timeline. Use arrow keys to adjust.');

    const windowLabel = figure.querySelector<HTMLElement>('[data-career-window]');
    const buttons = Array.from(figure.querySelectorAll<HTMLButtonElement>('[data-career-action]'));
    const format = new Intl.DateTimeFormat(data.locale, { month: 'short', year: 'numeric', timeZone: 'UTC' });
    const minimum = Math.min(1, 183 * 86400000 / (data.to - data.from));
    const window = () => ({ start: xAxis.get('start', 0), end: xAxis.get('end', 1) });
    function updateControls() {
      const { start, end } = window();
      for (const button of buttons) {
        const action = button.dataset.careerAction;
        button.disabled = action === 'earlier' ? start < 0.0001 : action === 'later' ? end > 0.9999
          : action === 'zoom-in' ? end - start <= minimum + 0.0001
          : end - start > 0.9999;
      }
      clearTimeout(announcement);
      announcement = setTimeout(() => {
        if (windowLabel) windowLabel.textContent = `${format.format(data.from + start * (data.to - data.from))} to ${format.format(data.from + end * (data.to - data.from) - 1)}`;
      }, 180);
    }
    xAxis.on('start', updateControls);
    xAxis.on('end', updateControls);
    for (const button of buttons) button.addEventListener('click', () => {
      const action = button.dataset.careerAction;
      const { start, end } = window();
      const next = action === 'reset' ? { start: 0, end: 1 }
        : timelineWindow(start, end, action === 'zoom-in' ? 0.5 : action === 'zoom-out' ? 2 : 1,
          action === 'earlier' ? -0.6 : action === 'later' ? 0.6 : 0, minimum);
      xAxis.zoom(next.start, next.end, reduced ? 0 : 200);
    }, { signal: abort.signal });
    series.events.once('datavalidated', () => { xAxis.zoom(viewport.start, viewport.end, 0); updateControls(); });
    let lastWidth = 0;
    function layout() {
      const width = host.clientWidth;
      if (width === lastWidth) return;
      lastWidth = width;
      const compact = width <= 700;
      tooltip.label.set('maxWidth', Math.min(350, Math.max(120, width - 40)));
      const levels = compact ? data.settings.levels.mobile : data.settings.levels.desktop;
      // More tracks need more room per run; a narrow screen gets extra turns.
      host.style.height = `${Math.round((levels * Math.max(145, data.lanes.length * 32 + 65) + 100) * scale)}px`;
      chart.setAll({ levelCount: levels, paddingLeft: compact ? 16 : 28, paddingRight: compact ? 16 : 28 });
      root.resize();
    }
    resize = new ResizeObserver(layout);
    resize.observe(host);
    layout();
    updateControls();
    return {
      window,
      select(id) {
        selectedId = id;
        for (const column of series.columns) {
          const point = column.dataItem?.dataContext as Point;
          const selected = point?.id === id;
          column.setAll({ fillOpacity: selected ? 0.95 : 0.68, strokeWidth: selected ? 3.5 : 1.5 });
        }
      },
      dispose() { abort.abort(); resize?.disconnect(); clearTimeout(announcement); root.dispose(); },
    };
  } catch (error) {
    abort.abort(); resize?.disconnect(); clearTimeout(announcement); root.dispose();
    throw error;
  }
}
