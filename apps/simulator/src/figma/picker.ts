// The Add Figma screens modal's state: connect (link + token), then pick frames from the file.
import type { FileListing } from './loader';

export interface PickerState {
  step: 'connect' | 'loading' | 'pick';
  listing: FileListing | null;
  picked: string[];
  search: string;
  error: string | null;
}

export type PickerAction =
  | { type: 'load' }
  | { type: 'loaded'; listing: FileListing; picked?: string[] }
  | { type: 'failed'; error: string }
  | { type: 'toggle'; id: string }
  | { type: 'search'; text: string }
  | { type: 'back' };

export const initialPicker: PickerState = { step: 'connect', listing: null, picked: [], search: '', error: null };

const order = (listing: FileListing) => listing.pages.flatMap((p) => p.frames.map((f) => f.id));

export function pickerReducer(s: PickerState, a: PickerAction): PickerState {
  switch (a.type) {
    case 'load':
      return { ...s, step: 'loading', error: null };
    case 'loaded': {
      const ids = new Set(order(a.listing));
      return { ...s, step: 'pick', listing: a.listing, picked: (a.picked ?? []).filter((id) => ids.has(id)), search: '' };
    }
    case 'failed':
      return { ...s, step: 'connect', error: a.error };
    case 'toggle': {
      if (!s.listing) return s;
      const set = new Set(s.picked);
      if (set.has(a.id)) set.delete(a.id);
      else set.add(a.id);
      return { ...s, picked: order(s.listing).filter((id) => set.has(id)) };
    }
    case 'search':
      return { ...s, search: a.text };
    case 'back':
      return { ...s, step: 'connect' };
  }
}

/** The listing's pages, keeping frames whose name or page contains the search text. */
export function visibleFrames(listing: FileListing, search: string): FileListing['pages'] {
  const q = search.trim().toLowerCase();
  if (!q) return listing.pages;
  return listing.pages
    .map((p) => ({ ...p, frames: p.frames.filter((f) => f.name.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)) }))
    .filter((p) => p.frames.length);
}
