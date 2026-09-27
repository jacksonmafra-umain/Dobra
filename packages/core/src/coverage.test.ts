import { describe, expect, it } from 'vitest';
import { loadCatalog } from './catalog/load';
import { coverage, representativeTarget } from './coverage';
import { targetKey } from './targets';

const cat = loadCatalog();
const req = (category: string, kind: string, orientation: string) =>
  cat.requirements.find((r) => r.category === category && r.kind === kind && r.orientation === orientation)!;

describe('coverage', () => {
  it('marks every required cell missing on an empty page', () => {
    const m = coverage(cat, []);
    expect(m.cells.filter((c) => c.requirement.level === 'required').every((c) => c.status === 'missing')).toBe(true);
  });

  it('counts a tagged frame for its category, posture kind and orientation', () => {
    const m = coverage(cat, [{ frameId: '1:1', confidence: 'tag', targets: [{ deviceId: 'galaxy-z-fold-7', displayId: 'inner', pose: 'book', orientation: 'portrait' }] }]);
    expect(m.cells.find((c) => c.requirement === req('foldable-book', 'book', 'portrait'))).toMatchObject({ status: 'present', frames: ['1:1'] });
  });

  it('keeps size-only matches at low confidence and never upgrades them', () => {
    const m = coverage(cat, [{ frameId: '2:2', confidence: 'size', targets: [{ deviceId: 'pixel-9', displayId: 'main', orientation: 'portrait' }] }]);
    expect(m.cells.find((c) => c.requirement === req('phone', 'flat', 'portrait'))!.status).toBe('present-by-size');
    expect(m.byCategory.phone.present).toBe(0);
  });

  it('picks a device that can show a missing cell', () => {
    expect(targetKey(representativeTarget(cat, req('dual-screen', 'book', 'landscape'))!)).toBe('surface-duo-2/spanned/spanned/landscape');
  });

  it('summarises by category', () => {
    expect(coverage(cat, []).byCategory['dual-screen']).toEqual({ required: 3, present: 0 });
  });
});
