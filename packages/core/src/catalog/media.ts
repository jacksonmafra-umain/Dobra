// CSS media features a device reports (pointer, any-pointer; Media Queries 4) and the facts
// Android's UI media scope exposes. Defaults are per category; a device's `media` block overrides them.
import type { DeviceSpec } from '../config/types';
import type { Category } from './categories';

export interface MediaFacts {
  pointer: 'coarse' | 'fine';
  keyboard: 'virtual' | 'physical';
  viewingDistance: 'near' | 'medium' | 'far';
  hasCamera: boolean;
  hasMicrophone: boolean;
}

const TOUCH: MediaFacts = { pointer: 'coarse', keyboard: 'virtual', viewingDistance: 'near', hasCamera: true, hasMicrophone: true };

/** Estimated per category: neither W3C nor Android publishes a table by device type. */
export const DEFAULT_MEDIA: Record<Category, MediaFacts> = {
  phone: TOUCH,
  'foldable-book': TOUCH,
  'foldable-flip': TOUCH,
  'dual-screen': TOUCH,
  'multi-fold': TOUCH,
  tablet: TOUCH,
  desktop: { pointer: 'fine', keyboard: 'physical', viewingDistance: 'medium', hasCamera: true, hasMicrophone: true },
};

export function mediaFacts(d: DeviceSpec): MediaFacts {
  const facts: MediaFacts = { ...DEFAULT_MEDIA[d.category] };
  const m = d.media;
  if (m?.pointer) facts.pointer = m.pointer;
  if (m?.keyboard) facts.keyboard = m.keyboard;
  if (m?.viewingDistance) facts.viewingDistance = m.viewingDistance;
  if (m?.hasCamera !== undefined) facts.hasCamera = m.hasCamera;
  if (m?.hasMicrophone !== undefined) facts.hasMicrophone = m.hasMicrophone;
  return facts;
}
