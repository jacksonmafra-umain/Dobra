// Guide routes: docs/guide/00-index.md is /guide/, every other NN-name.md is /guide/name/.

export function guideSlug(file: string): string {
  const base = file.replace(/\.md$/, '').replace(/^\d{2}-/, '');
  return base === 'index' ? '' : base;
}

export function guideHref(slug: string): string {
  return slug ? `/guide/${slug}/` : '/guide/';
}
