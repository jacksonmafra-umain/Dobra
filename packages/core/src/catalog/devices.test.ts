import { describe, expect, it } from 'vitest';
import catalogJson from './catalog.json';
import { loadCatalog } from './load';
import { loadConfig } from '../config/load';
import { resolveEnvironment } from '../engine/environment';

const cat = loadCatalog();
const byId = (id: string) => {
  const d = cat.devices.find((x) => x.id === id);
  if (!d) throw new Error(`No device "${id}"`);
  return d;
};
/** Android devices carry `estimated` themselves; iOS devices only per display. */
const estimated = (id: string) => {
  const d = byId(id);
  if (d.platform !== 'android') throw new Error(`${id} is not an Android device`);
  return d.estimated;
};
const size = (id: string, display: string) => {
  const d = byId(id);
  return d.platform === 'android' ? d.displays[display].size : d.displays[display].portraitSize;
};

describe('catalog devices', () => {
  it('explains every estimated device and display', () => {
    for (const d of catalogJson.devices as Array<Record<string, unknown>>) {
      const displays = Object.values(d.displays as Record<string, Record<string, unknown>>);
      for (const node of [d, ...displays]) {
        if (node.estimated === true) expect(node.$note ?? node.$comment ?? d.$note ?? d.$comment, `${d.id} needs a note`).toBeTruthy();
      }
    }
  });

  it('has the Surface Duo 2 with a 26 dp occluding hinge between two 537 dp screens', () => {
    const d = byId('surface-duo-2');
    expect(d.category).toBe('dual-screen');
    expect(size('surface-duo-2', 'single')).toEqual({ width: 537, height: 756 });
    expect(size('surface-duo-2', 'spanned')).toEqual({ width: 1100, height: 756 });
    if (d.platform !== 'android') throw new Error('android expected');
    expect(d.displays.spanned.hinges).toEqual([expect.objectContaining({ axis: 'vertical', position: 537, width: 26, occlusion: 'FULL' })]);
  });

  it('splits a spanned Surface Duo 2 into two screens around the gap', () => {
    const env = resolveEnvironment(loadConfig(), { deviceId: 'surface-duo-2', displayId: '', orientation: 'portrait', free: null, pose: 'spanned' });
    expect(env.folds).toHaveLength(1);
    expect(env.folds[0]).toMatchObject({ separating: true, occludes: true, rect: { x: 537, width: 26 } });
    expect(env.regions.map((r) => r.width)).toEqual([537, 537]);
  });

  it('requires dual-screen coverage now that a dual-screen device exists', () => {
    const rows = cat.requirements.filter((r) => r.category === 'dual-screen' && r.level === 'required');
    expect(rows.map((r) => `${r.kind}/${r.orientation}`).sort()).toEqual(['book/landscape', 'cover/portrait', 'tabletop/portrait']);
  });
});

describe('book foldables', () => {
  it.each([
    ['pixel-fold', 'outer', { width: 411.5, height: 797 }],
    ['pixel-fold', 'inner', { width: 841, height: 701 }],
    ['pixel-10-pro-fold', 'outer', { width: 443, height: 970 }],
    ['pixel-10-pro-fold', 'inner', { width: 851.5, height: 883 }],
    ['pixel-11-pro-fold', 'outer', { width: 443, height: 961 }],
    ['oneplus-open', 'outer', { width: 425, height: 946.5 }],
    ['oneplus-open', 'inner', { width: 864, height: 929.5 }],
    ['oppo-find-n6', 'outer', { width: 434.5, height: 996.5 }],
    ['oppo-find-n6', 'inner', { width: 856.5, height: 945 }],
    ['galaxy-z-fold-7', 'cover', { width: 411, height: 960 }],
    ['galaxy-z-fold-7', 'inner', { width: 750, height: 832 }],
  ])('%s %s is %o dp', (id, display, expected) => {
    expect(byId(id).category).toBe('foldable-book');
    expect(size(id, display)).toEqual(expected);
  });

  it('keeps the Pixel Fold inner display landscape-native with the crease across its width', () => {
    const d = byId('pixel-fold');
    if (d.platform !== 'android') throw new Error('android expected');
    expect(d.displays.inner.hinges?.[0]).toMatchObject({ axis: 'vertical', position: 420.5, width: 0, occlusion: 'NONE' });
  });

  it('marks unpublished densities as estimated', () => {
    for (const id of ['oneplus-open', 'oppo-find-n6', 'pixel-11-pro-fold', 'galaxy-z-fold-7']) expect(estimated(id), id).toBe(true);
    for (const id of ['pixel-fold', 'pixel-10-pro-fold']) expect(estimated(id), id).toBe(false);
  });
});

describe('flip foldables', () => {
  it.each([
    ['razr-plus-2024', 'cover', { width: 392.5, height: 462.5 }],
    ['razr-plus-2024', 'inner', { width: 392.5, height: 960 }],
    ['razr-2026', 'cover', { width: 384, height: 387.5 }],
    ['razr-2026', 'inner', { width: 392.5, height: 960 }],
    ['razr-ultra-2026', 'cover', { width: 360, height: 424 }],
    ['razr-ultra-2026', 'inner', { width: 408, height: 997.5 }],
  ])('%s %s is %o dp', (id, display, expected) => {
    expect(byId(id).category).toBe('foldable-flip');
    expect(size(id, display)).toEqual(expected);
  });

  it('lets any app run on a Motorola cover screen', () => {
    for (const id of ['razr-plus-2024', 'razr-2026', 'razr-ultra-2026']) {
      const d = byId(id);
      if (d.platform !== 'android') throw new Error('android expected');
      expect(d.displays.cover.coverScreen).toMatchObject({ policy: 'any-app', continuity: true });
      expect(estimated(id)).toBe(true);
    }
  });
});

describe('Galaxy S25 family', () => {
  it.each([
    ['galaxy-s25', { width: 360, height: 780 }],
    ['galaxy-s25-plus', { width: 384, height: 832 }],
    ['galaxy-s25-ultra', { width: 384, height: 832 }],
  ])('%s is %o dp, estimated', (id, expected) => {
    expect(byId(id).category).toBe('phone');
    expect(size(id, 'main')).toEqual(expected);
    expect(estimated(id)).toBe(true);
  });
});

describe('Apple devices', () => {
  it.each([
    ['iphone-mini', 'phone', { width: 375, height: 812 }],
    ['iphone-plus', 'phone', { width: 430, height: 932 }],
    ['iphone-air', 'phone', { width: 420, height: 912 }],
    ['ipad-mini', 'tablet', { width: 744, height: 1133 }],
    ['ipad-11', 'tablet', { width: 820, height: 1180 }],
    ['ipad-pro-11', 'tablet', { width: 834, height: 1210 }],
    ['ipad-air-13', 'tablet', { width: 1024, height: 1366 }],
    ['ipad-pro-13', 'tablet', { width: 1032, height: 1376 }],
  ])('%s is a %s at %o pt', (id, category, expected) => {
    expect(byId(id).category).toBe(category);
    expect(size(id, 'main')).toEqual(expected);
  });

  it('gives iPads regular width and height in both orientations, with no Dynamic Island regions', () => {
    for (const id of ['ipad-mini', 'ipad-11', 'ipad-pro-11', 'ipad-air-13', 'ipad-pro-13']) {
      const d = byId(id);
      if (d.platform !== 'ios') throw new Error('ios expected');
      for (const o of ['portrait', 'landscape'] as const) {
        expect(d.displays.main.orientations[o]?.sizeClass).toMatchObject({ horizontal: 'regular', vertical: 'regular' });
      }
      expect(d.displays.main.reservedRegions ?? []).toEqual([]);
    }
  });

  it('keeps the iPhone Duo estimated', () => {
    const d = byId('iphone-duo');
    if (d.platform !== 'ios') throw new Error('ios expected');
    expect(d.displays.inner.estimated).toBe(true);
  });
});

describe('no template leftovers', () => {
  const android = (id: string) => {
    const d = byId(id);
    if (d.platform !== 'android') throw new Error(`${id} is not an Android device`);
    return d;
  };
  const MOTOROLA = ['razr-plus-2024', 'razr-2026', 'razr-ultra-2026'];

  it('calls a Motorola cover the external display, not by Samsung\'s name', () => {
    for (const id of MOTOROLA) expect(android(id).displays.cover.label).toBe('External display');
  });

  it('gives a Motorola external display a status bar, since its size is the whole panel', () => {
    for (const id of MOTOROLA) {
      const insets = android(id).displays.cover.insets;
      expect(insets.statusBar, id).toBeGreaterThan(0);
      expect(insets.estimated, id).toBe(true);
    }
  });

  it('draws no hole-punch on the Pixel Fold inner display: its camera sits in the bezel', () => {
    expect(android('pixel-fold').displays.inner.insets.cutout).toBeNull();
  });

  it('sources the Pixel Fold and Pixel 10 Pro Fold creases from the Android Studio AVD', () => {
    for (const id of ['pixel-fold', 'pixel-10-pro-fold']) {
      expect(android(id).displays.inner.hinges?.[0]).toMatchObject({ source: 'android-studio-avd', estimated: false });
    }
  });
});
