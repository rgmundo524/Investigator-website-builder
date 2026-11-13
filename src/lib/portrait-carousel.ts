type Continuity = {
  restore(): { index: number; remaining: number };
  save(index: number, remaining: number): void;
};
type PortraitRoot = HTMLElement & { __portraitContinuity?: Continuity };
const controllers = new Map<HTMLElement, () => void>();

export function destroyPortraitRotation() {
  controllers.forEach((cleanup) => cleanup());
  controllers.clear();
}

export function initPortraitRotation() {
  for (const root of document.querySelectorAll<PortraitRoot>('[data-portrait-rotation]')) {
    if (!root.isConnected || controllers.has(root)) continue;
    const slides = [...root.querySelectorAll<HTMLElement>('[data-portrait-slide]')];
    if (slides.length < 2) continue;
    const interval = Math.min(60000, Math.max(2000, Number(root.dataset.interval) || 6000));
    const continuity = root.__portraitContinuity;
    const saved = continuity?.restore();
    let selected = saved?.index ?? Math.max(0, slides.findIndex((slide) => !slide.hidden));
    let remaining = saved?.remaining ?? interval;
    let timer: number | undefined;
    let deadline: number | undefined;
    let disposed = false;
    const timeRemaining = () => deadline === undefined ? remaining : Math.max(0, Math.min(interval, deadline - Date.now()));
    const persist = () => continuity?.save(selected, timeRemaining());
    const pauseTimer = () => {
      remaining = timeRemaining();
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      deadline = undefined;
    };
    const showPhoto = () => {
      slides.forEach((slide, index) => {
        slide.hidden = index !== selected;
        slide.setAttribute('aria-hidden', String(index !== selected));
        const image = slide.querySelector<HTMLImageElement>('img');
        if (image && index === selected) image.loading = 'eager';
      });
      // Fetch the upcoming hidden frame during the current photo's interval.
      const upcoming = root.dataset.autoplay === 'true' ? slides[(selected + 1) % slides.length].querySelector<HTMLImageElement>('img') : undefined;
      if (upcoming) upcoming.loading = 'eager';
    };
    const schedule = () => {
      pauseTimer();
      if (!disposed && root.dataset.autoplay === 'true' && !document.hidden) {
        deadline = Date.now() + remaining;
        timer = window.setTimeout(() => {
          timer = undefined; deadline = undefined;
          selected = (selected + 1) % slides.length;
          remaining = interval;
          showPhoto();
          schedule();
        }, remaining);
      }
      persist();
    };
    document.addEventListener('visibilitychange', schedule);
    showPhoto();
    schedule();
    controllers.set(root, () => {
      pauseTimer(); persist(); disposed = true;
      document.removeEventListener('visibilitychange', schedule);
    });
  }
}
