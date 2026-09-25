// Sample app art. Images are generated SVGs (see art.ts); names keep their original file
// extensions so callers are unchanged.
import { artUri } from './art';

function base(name: string): string {
  return name.replace(/\.(svg|png|webp)$/, '');
}

export function asset(name: string): string {
  const url = artUri(base(name));
  if (!url) throw new Error(`Missing sample asset "${name}"`);
  return url;
}

export function hasAsset(name: string): boolean {
  return artUri(base(name)) !== undefined;
}
