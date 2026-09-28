// Page-level setup that has to happen outside React: the theme on <html> and the favicon.

/** Mirrors prefers-color-scheme onto root.dataset.theme now and whenever it changes. */
export function followSystemTheme(win: Pick<Window, 'matchMedia'>, root: { dataset: DOMStringMap }): () => void {
  const query = win.matchMedia('(prefers-color-scheme: dark)');
  const apply = (dark: boolean) => (root.dataset.theme = dark ? 'dark' : 'light');
  apply(query.matches);
  const listener = (e: { matches: boolean }) => apply(e.matches);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

/** Adds the favicon from JavaScript, so Vite can inline it in the single-file build. */
export function addFavicon(doc: Pick<Document, 'head' | 'createElement'>, href: string): void {
  const link = doc.createElement('link');
  link.rel = 'icon';
  link.href = href;
  doc.head.append(link);
}
