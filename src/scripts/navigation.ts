// A disclosure, rather than a modal: links remain part of the normal tab order.
// Without JavaScript the full navigation remains visible at every screen size.
export function mountSiteNavigation(root: ParentNode = document) {
  const header = root.querySelector<HTMLElement>('.site-header');
  const navigation = header?.querySelector<HTMLElement>('#site-navigation');
  const toggle = header?.querySelector<HTMLButtonElement>('.navigation-toggle');
  if (!header || !navigation || !toggle) return () => {};
  const compact = matchMedia('(max-width: 1040px)');
  const abort = new AbortController();
  let open = false;

  function render() {
    toggle!.hidden = !compact.matches;
    navigation!.hidden = compact.matches && !open;
    toggle!.setAttribute('aria-expanded', String(compact.matches && open));
    header!.dataset.navigation = compact.matches && open ? 'open' : 'closed';
  }
  function close(restoreFocus: boolean) {
    open = false;
    if (restoreFocus && compact.matches) toggle!.focus();
    render();
  }
  toggle.addEventListener('click', () => { open = !open; render(); }, { signal: abort.signal });
  header.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !compact.matches || !open) return;
    event.preventDefault();
    close(true);
  }, { signal: abort.signal });
  navigation.addEventListener('click', (event) => {
    if ((event.target as Element).closest('a')) close(false);
  }, { signal: abort.signal });
  compact.addEventListener('change', () => {
    const focusWasInside = navigation!.contains(document.activeElement);
    close(focusWasInside);
  }, { signal: abort.signal });
  window.addEventListener('pageshow', () => close(navigation!.contains(document.activeElement)), { signal: abort.signal });
  render();
  return () => {
    abort.abort();
    navigation.hidden = false;
    toggle.hidden = true;
    delete header.dataset.navigation;
  };
}
