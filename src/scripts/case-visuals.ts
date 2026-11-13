import type { CaseSunburstPayload, CaseTreeData, CaseVisual, CaseVisualState } from '../lib/case-visuals';

export function mountCaseVisuals() {
  const abort = new AbortController();
  const options = { signal: abort.signal };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const preferenceKey = 'personal-site-case-motion-paused';
  let paused = false;
  try { paused = localStorage.getItem(preferenceKey) === 'true'; } catch { /* Storage is optional. */ }
  const enabled = () => !paused && !reduced.matches;
  const clients: { motion(): void; cleanup(): void }[] = [];
  function updateMotion() { for (const client of clients) client.motion(); }
  reduced.addEventListener('change', updateMotion, options);
  window.addEventListener('storage', (event) => {
    if (event.key === preferenceKey) { paused = event.newValue === 'true'; updateMotion(); }
  }, options);
  for (const figure of document.querySelectorAll<HTMLElement>('[data-case-visual]')) {
    const host = figure.querySelector<HTMLElement>('[data-visual-host]');
    const panel = figure.querySelector<HTMLElement>('[data-visual-panel]');
    const status = figure.querySelector<HTMLElement>('[data-visual-status]');
    const json = figure.querySelector('[data-visual-data]')?.textContent;
    if (!host || !panel || !json) continue;
    const data: CaseSunburstPayload | CaseTreeData = JSON.parse(json);
    const isTree = figure.dataset.caseVisual === 'tree';
    const button = figure.querySelector<HTMLButtonElement>('[data-visual-action="motion"]');
    let chart: CaseVisual | undefined;
    let saved: CaseVisualState = {};
    let generation = 0;
    let loading = false;
    let wanted = false;
    let inViewport = false;
    let suspended = false;
    function motion() {
      chart?.motion(enabled());
      if (button) {
        button.disabled = reduced.matches;
        button.textContent = reduced.matches ? 'Reduced motion enabled' : paused ? 'Resume chart motion' : 'Pause chart motion';
        button.setAttribute('aria-pressed', String(!enabled()));
      }
    }
    function dispose() {
      generation++;
      loading = false;
      if (chart) saved = chart.state();
      chart?.dispose(); chart = undefined;
    }
    async function render() {
      if (!wanted || suspended || abort.signal.aborted || chart || loading || !host || !panel) return;
      const revision = ++generation;
      loading = true;
      try {
        const factory = isTree ? (await import('../lib/case-tree-chart')).createCaseTree
          : (await import('../lib/case-sunburst-chart')).createCaseSunburst;
        if (revision !== generation || suspended || abort.signal.aborted) return;
        panel.hidden = false;
        // The discriminant selects the matching factory and serialized payload.
        chart = isTree
          ? (factory as typeof import('../lib/case-tree-chart').createCaseTree)(host, figure, data as CaseTreeData, enabled(), inViewport && !document.hidden, saved)
          : (factory as typeof import('../lib/case-sunburst-chart').createCaseSunburst)(host, figure, data as CaseSunburstPayload, enabled());
        if (status) status.hidden = true;
        motion();
      } catch (error) {
        if (revision !== generation || abort.signal.aborted) return;
        chart?.dispose(); chart = undefined;
        panel.hidden = true;
        if (status) {
          status.hidden = false;
          status.textContent = 'The interactive chart is unavailable. Use the case links below.';
        }
        console.error('Case chart could not load.', error);
      } finally { if (revision === generation) loading = false; }
    }
    figure.addEventListener('click', (event) => {
      const action = (event.target as Element).closest<HTMLButtonElement>('[data-visual-action]')?.dataset.visualAction;
      if (action === 'motion') {
        paused = !paused;
        try { localStorage.setItem(preferenceKey, String(paused)); } catch { /* Storage is optional. */ }
        updateMotion();
      } else if (action) chart?.action?.(action);
    }, options);
    const preload = new IntersectionObserver((changes) => {
      if (changes.some(({ isIntersecting }) => isIntersecting)) {
        wanted = true; preload.disconnect(); void render();
      }
    }, { rootMargin: '220px' });
    const visibility = new IntersectionObserver((changes) => {
      inViewport = changes.some(({ isIntersecting }) => isIntersecting);
      chart?.visible(inViewport && !document.hidden);
    });
    preload.observe(figure);
    visibility.observe(figure);
    const theme = new MutationObserver(() => { dispose(); void render(); });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    document.addEventListener('visibilitychange', () => chart?.visible(inViewport && !document.hidden), options);
    window.addEventListener('pagehide', () => { suspended = true; dispose(); }, options);
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) { suspended = false; void render(); }
    }, options);
    clients.push({ motion, cleanup() { dispose(); preload.disconnect(); visibility.disconnect(); theme.disconnect(); } });
    motion();
  }
  return () => { abort.abort(); for (const client of clients) client.cleanup(); };
}
