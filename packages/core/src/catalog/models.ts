// Which catalog device a connected phone is, from its ro.product.model.
import type { Catalog } from '../config/schema';

/** The device whose model id equals the model or is its prefix (SM-F741 for SM-F741B); the longest id wins. */
export function deviceForModel(catalog: Catalog, model: string): string | null {
  let best: { id: string; length: number } | null = null;
  for (const d of catalog.devices) {
    if (d.platform !== 'android') continue;
    for (const m of d.models ?? []) {
      if ((model === m.id || model.startsWith(m.id)) && (!best || m.id.length > best.length)) best = { id: d.id, length: m.id.length };
    }
  }
  return best?.id ?? null;
}
