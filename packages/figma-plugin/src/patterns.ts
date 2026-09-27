// A file's name words for controls and chrome, stored once on the document so the team (and the web
// report, through the REST API) classifies layers the same way; and the importance marks on layers.
import { DEFAULT_PATTERNS, IMPORTANCE_KEY, parsePatterns, PATTERNS_KEY, type Importance, type NamePatterns } from '@dobra/core/namePatterns';
import type { FigmaApi } from './api';
import { NAMESPACE } from './presets';

export function filePatterns(api: FigmaApi): NamePatterns {
  return parsePatterns(api.root.getSharedPluginData(NAMESPACE, PATTERNS_KEY));
}

/** Saves the file's words, or goes back to the defaults with null. Blank words are dropped. */
export function saveFilePatterns(api: FigmaApi, patterns: NamePatterns | null): NamePatterns {
  if (!patterns) {
    api.root.setSharedPluginData(NAMESPACE, PATTERNS_KEY, '');
    return DEFAULT_PATTERNS;
  }
  const clean = (words: string[]) => words.map((w) => w.trim()).filter(Boolean);
  const next = { controls: clean(patterns.controls), chrome: clean(patterns.chrome) };
  api.root.setSharedPluginData(NAMESPACE, PATTERNS_KEY, JSON.stringify(next));
  return next;
}

/** Marks the selected layers important or not important, or clears the mark with null. */
export function markSelection(api: FigmaApi, importance: Importance | null): number {
  const nodes = api.currentPage.selection;
  if (!nodes.length) throw new Error('Select the layers to mark first.');
  for (const n of nodes) n.setSharedPluginData(NAMESPACE, IMPORTANCE_KEY, importance ?? '');
  return nodes.length;
}
