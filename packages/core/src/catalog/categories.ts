import type { DeviceSpec } from '../config/types';

/** Device categories, from duoresponsive.com's device list plus multi-fold and desktop. */
export const CATEGORIES = ['phone', 'foldable-book', 'foldable-flip', 'dual-screen', 'multi-fold', 'tablet', 'desktop'] as const;
export type Category = (typeof CATEGORIES)[number];

export function categoryOf(d: DeviceSpec): Category {
  return d.category;
}
