// Sample app art. Images are generated SVGs (see art.ts); names keep their original file
// extensions so callers are unchanged.
import { artUri } from './art';

function base(name: string): string {
  return name.replace(/\.(svg|png|webp)$/, '');
}

/**
 * The art for a file name, as a data URI. The name rides along as a fragment (ignored when the
 * image loads) so attribute selectors such as `img[src$="IcChevronRight.svg"]` keep matching.
 */
export function asset(name: string): string {
  const url = artUri(base(name));
  if (!url) throw new Error(`Missing sample asset "${name}"`);
  return `${url}#${name}`;
}

export function hasAsset(name: string): boolean {
  return artUri(base(name)) !== undefined;
}
