// Figma assets. The default build emits each file separately, so images load only when a screen
// uses them; the single-file build inlines them.
const files = import.meta.glob<string>('../assets/figma/*', { eager: true, query: '?url', import: 'default' });

const byName = new Map<string, string>();
for (const [path, url] of Object.entries(files)) {
  const name = path.slice(path.lastIndexOf('/') + 1);
  byName.set(name, url);
  // Raster images ship as WebP; keep resolving the original Figma export names.
  if (name.endsWith('.webp')) byName.set(name.replace(/\.webp$/, '.png'), url);
}

export function asset(name: string): string {
  const url = byName.get(name);
  if (!url) throw new Error(`Missing Figma asset "${name}" in src/assets/figma`);
  return url;
}

export function hasAsset(name: string): boolean {
  return byName.has(name);
}
