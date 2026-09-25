import type { Rect } from '../config/types';
import type { Environment } from './environment';
import type { Layout } from './layout';

export type ModalKind = 'alert' | 'sheet';

export interface ModalPlacement {
  area: Rect;
  note: string;
}

/** Where an alert or sheet goes; on a folded display it moves clear of the fold (HIG). */
export function placeModal(kind: ModalKind, env: Environment, layout: Layout, rtl: boolean): ModalPlacement {
  const content: Rect = { x: 0, y: 0, width: env.width - layout.railWidth, height: env.height };
  const fold = env.fold;
  if (!fold) {
    return {
      area: content,
      note: kind === 'alert' ? 'Centred on the screen.' : 'Anchored to the bottom, full width of the content area.',
    };
  }
  if (fold.axis === 'vertical') {
    const area = intersectRect(rtl ? fold.regions[1] : fold.regions[0], content);
    return { area, note: `Moved clear of the fold into the leading half (${Math.round(area.width)} pt wide).` };
  }
  const [top, bottom] = fold.regions;
  return kind === 'alert'
    ? { area: intersectRect(top, content), note: 'Moved clear of the fold into the top half.' }
    : { area: intersectRect(bottom, content), note: 'Sheet kept below the fold, in the bottom half.' };
}

export function intersectRect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y),
  };
}
