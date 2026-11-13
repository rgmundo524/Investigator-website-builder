/** One navigation list: a disclosure on narrow screens and inline on desktop. */
export function initSiteHeader(header: HTMLElement): () => void {
  const toggle = header.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const panel = header.querySelector<HTMLElement>('[data-header-menu]');
  if (!toggle || !panel) return () => {};

  const narrow = window.matchMedia('(max-width: 1152px)');
  let open = false;
  const updateHeight = () => {
    document.documentElement.style.setProperty('--site-header-height', `${Math.ceil(header.getBoundingClientRect().height)}px`);
  };
  const setOpen = (value: boolean, returnFocus = false) => {
    open = narrow.matches && value;
    toggle.hidden = !narrow.matches;
    panel.hidden = narrow.matches && !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    header.dataset.menuOpen = String(open);
    if (returnFocus && narrow.matches) toggle.focus();
    updateHeight();
  };
  const onToggle = () => setOpen(!open);
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !open) return;
    event.preventDefault();
    setOpen(false, true);
  };
  const onOutside = (event: MouseEvent) => {
    if (open && event.target && !header.contains(event.target as Node)) setOpen(false);
  };
  const onLink = (event: MouseEvent) => {
    const link = (event.target as Element | null)?.closest('a[href]');
    if (link && panel.contains(link)) setOpen(false, !!document.activeElement && panel.contains(document.activeElement));
  };
  const onFocusOut = (event: FocusEvent) => {
    if (open && event.relatedTarget && !header.contains(event.relatedTarget as Node)) setOpen(false);
  };
  const onBreakpoint = () => {
    const focused = document.activeElement;
    const focusIsHidden = narrow.matches ? !!focused && panel.contains(focused) : focused === toggle;
    setOpen(false, focusIsHidden);
    if (!narrow.matches && focusIsHidden) header.querySelector<HTMLAnchorElement>('.wordmark')?.focus();
  };
  const onPageShow = () => setOpen(false, !!document.activeElement && panel.contains(document.activeElement));

  header.dataset.menuEnhanced = 'true';
  toggle.addEventListener('click', onToggle);
  panel.addEventListener('click', onLink);
  header.addEventListener('focusout', onFocusOut);
  document.addEventListener('click', onOutside);
  document.addEventListener('keydown', onKey);
  narrow.addEventListener('change', onBreakpoint);
  window.addEventListener('pageshow', onPageShow);
  const observer = new ResizeObserver(updateHeight);
  observer.observe(header);
  setOpen(false);

  return () => {
    observer.disconnect();
    toggle.removeEventListener('click', onToggle);
    panel.removeEventListener('click', onLink);
    header.removeEventListener('focusout', onFocusOut);
    document.removeEventListener('click', onOutside);
    document.removeEventListener('keydown', onKey);
    narrow.removeEventListener('change', onBreakpoint);
    window.removeEventListener('pageshow', onPageShow);
    toggle.hidden = true;
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'false');
    delete header.dataset.menuEnhanced;
    delete header.dataset.menuOpen;
    updateHeight();
  };
}
