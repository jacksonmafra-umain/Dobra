// The layer names that mark controls and chrome, as plain words a team can edit. The plugin and the
// web report classify Figma layers with the same lists, stored once per file.

export interface NamePatterns {
  /** Words for tappable layers: buttons, links, chips… */
  controls: string[];
  /** Words for system or app chrome: navigation, bars, headers… */
  chrome: string[];
}

export const DEFAULT_PATTERNS: NamePatterns = {
  controls: ['button', 'btn', 'cta', 'link', 'chip', 'tab', 'toggle', 'switch', 'checkbox', 'radio', 'input', 'field', 'fab', 'card'],
  chrome: ['nav', 'navigation', 'tab bar', 'tool bar', 'app bar', 'bottom bar', 'status bar', 'header', 'footer'],
};

/** Shared plugin data key (namespace `dobra`) on the document holding a file's NamePatterns as JSON. */
export const PATTERNS_KEY = 'patterns';
/** Shared plugin data key on a layer: `important` or `ignore`. */
export const IMPORTANCE_KEY = 'importance';
export type Importance = 'important' | 'ignore';

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whole words, any case; a space in a word also matches no space ("tab bar", "tabbar"). */
function matcher(words: string[]): RegExp | null {
  if (!words.length) return null;
  const alternatives = words.map((w) => escape(w).replace(/\s+/g, '\\s?'));
  // Word edges that also work for words starting or ending in punctuation, such as "pill (small)".
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}])`, 'iu');
}

const cache = new WeakMap<NamePatterns, { chrome: RegExp | null; controls: RegExp | null }>();

/** The role a layer's name gives it, chrome first, or null when no word matches. */
export function nameRole(name: string, patterns: NamePatterns): 'chrome' | 'interactive' | null {
  let m = cache.get(patterns);
  if (!m) {
    m = { chrome: matcher(patterns.chrome), controls: matcher(patterns.controls) };
    cache.set(patterns, m);
  }
  if (m.chrome?.test(name)) return 'chrome';
  if (m.controls?.test(name)) return 'interactive';
  return null;
}

const words = (value: unknown): string[] | null =>
  Array.isArray(value) ? value.filter((w): w is string => typeof w === 'string').map((w) => w.trim()).filter(Boolean) : null;

/** A file's stored lists; a missing or broken field keeps the default. */
export function parsePatterns(json: string): NamePatterns {
  let raw: unknown;
  try {
    raw = json ? JSON.parse(json) : null;
  } catch {
    raw = null;
  }
  const r = (raw ?? {}) as { controls?: unknown; chrome?: unknown };
  return { controls: words(r.controls) ?? DEFAULT_PATTERNS.controls, chrome: words(r.chrome) ?? DEFAULT_PATTERNS.chrome };
}

export const importanceOf = (value: string | undefined): Importance | null => (value === 'important' || value === 'ignore' ? value : null);
