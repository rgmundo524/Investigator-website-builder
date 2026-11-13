// Select the saved photo while HTML is parsed, before deferred rotation code.
(() => {
  const root = document.currentScript?.previousElementSibling;
  if (!root?.matches('[data-portrait-rotation]')) return;
  const slides = [...root.querySelectorAll('[data-portrait-slide]')];
  const photos = slides.map((slide) => slide.dataset.portraitPhoto);
  const sequence = JSON.stringify(photos);
  const interval = Math.min(60000, Math.max(2000, Number(root.dataset.interval) || 6000));
  const prefix = `personal-site-portrait-v2:${root.dataset.portraitScope || ''}:`;
  const sequenceKey = prefix + sequence;
  const currentKey = prefix + 'current';
  let memory;

  function valid(value) {
    const now = Date.now();
    return value && typeof value.sequence === 'string' && typeof value.photo === 'string'
        && Number.isFinite(value.remaining)
        && value.remaining >= 0 && value.remaining <= 60000 && Number.isFinite(value.savedAt)
        && value.savedAt <= now && now - value.savedAt < 12 * 60 * 60 * 1000;
  }

  function read(key) {
    try {
      const value = JSON.parse(sessionStorage.getItem(key));
      return valid(value) ? value : undefined;
    } catch { return undefined; }
  }

  function restore() {
    const stored = read(sequenceKey);
    const candidate = stored || (valid(memory) ? memory : undefined);
    const own = candidate?.sequence === sequence && photos.includes(candidate.photo) ? candidate : undefined;
    const current = read(currentKey);
    const saved = current?.sequence === sequence ? current : own;
    // Different lists retain their own timing. A shared
    // configured photo can still stay on screen when the page changes its size.
    const photo = current && photos.includes(current.photo) ? current.photo : saved?.photo;
    const index = Math.max(0, photos.indexOf(photo));
    const state = { index, remaining: saved?.photo === photos[index] ? Math.min(interval, saved.remaining) : interval };
    slides.forEach((slide, position) => {
      slide.hidden = position !== index;
      slide.setAttribute('aria-hidden', String(position !== index));
      const image = slide.querySelector('img');
      if (image && position === index) { image.loading = 'eager'; image.fetchPriority = 'high'; }
    });
    return state;
  }

  function save(index, remaining) {
    memory = { sequence, photo: photos[index], remaining: Math.min(interval, Math.max(0, remaining)), savedAt: Date.now() };
    try {
      sessionStorage.setItem(sequenceKey, JSON.stringify(memory));
      sessionStorage.setItem(currentKey, JSON.stringify(memory));
    } catch { /* Rotation continues when tab storage is unavailable. */ }
  }

  root.__portraitContinuity = { restore, save };
  restore();
})();
