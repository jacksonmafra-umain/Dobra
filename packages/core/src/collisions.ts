// Which elements sit in a fold or a reserved region. Pure geometry: callers measure elements
// (DOM, Figma nodes, simulator layout) and pass rects in window coordinates.
import type { Rect } from './config/types';
import type { Environment } from './engine/environment';

export interface CollisionZone {
  label: string;
  rect: Rect;
  /** A vertical fold stays in place while content scrolls vertically, so only the x span matters. */
  scrollAxis: 'x' | 'none';
}

export interface CollisionSubject {
  id: string;
  rect: Rect;
  /** Inside a vertically scrolling container. */
  scrolls: boolean;
}

export interface CollisionHit {
  id: string;
  zone: string;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function spansOverlap(a: number, aLength: number, b: number, bLength: number): boolean {
  return a < b + bLength && a + aLength > b;
}

/** Only a fold that separates or hides content is a problem; a flat crease on a flexible display is not. */
export function collisionZones(env: Pick<Environment, 'folds' | 'reservedRegions'>): CollisionZone[] {
  const zones: CollisionZone[] = [];
  for (const fold of env.folds) {
    if (!fold.separating && !fold.occludes) continue;
    zones.push({ label: 'Folding region', rect: fold.rect, scrollAxis: fold.axis === 'vertical' ? 'x' : 'none' });
  }
  for (const region of env.reservedRegions) zones.push({ label: region.label, rect: region.rect, scrollAxis: 'none' });
  return zones;
}

/** The first zone each subject hits, in subject order. */
export function findCollisions(subjects: CollisionSubject[], zones: CollisionZone[]): CollisionHit[] {
  const hits: CollisionHit[] = [];
  for (const s of subjects) {
    const zone = zones.find((z) =>
      s.scrolls
        ? z.scrollAxis !== 'none' && spansOverlap(s.rect.x, s.rect.width, z.rect.x, z.rect.width)
        : rectsOverlap(s.rect, z.rect),
    );
    if (zone) hits.push({ id: s.id, zone: zone.label });
  }
  return hits;
}
