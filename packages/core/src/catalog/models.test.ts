import { describe, expect, it } from 'vitest';
import { loadCatalog } from './load';
import { deviceForModel } from './models';

const catalog = loadCatalog();

describe('deviceForModel', () => {
  it('finds a phone by its model id, ignoring the region suffix', () => {
    expect(deviceForModel(catalog, 'SM-F741B')).toBe('galaxy-z-flip-6');
    expect(deviceForModel(catalog, 'SM-F741U1')).toBe('galaxy-z-flip-6');
    expect(deviceForModel(catalog, 'Pixel 9 Pro Fold')).toBe('pixel-9-pro-fold');
    expect(deviceForModel(catalog, 'SM-F966B')).toBe('galaxy-z-fold-7');
    expect(deviceForModel(catalog, 'SM-F766U')).toBe('galaxy-z-flip-7');
  });
  it('returns null for a model the catalog does not know', () => {
    expect(deviceForModel(catalog, 'SM-T510')).toBeNull();
  });
});

describe('Galaxy Z Flip 6', () => {
  const flip6 = catalog.devices.find((d) => d.id === 'galaxy-z-flip-6');
  it('has the measured displays', () => {
    if (!flip6 || flip6.platform !== 'android') throw new Error('missing');
    expect(flip6.displays.inner).toMatchObject({ size: { width: 360, height: 880 }, pixels: { width: 1080, height: 2640 }, density: 3, source: 'device-measured' });
    expect(flip6.displays.cover).toMatchObject({ size: { width: 352, height: 339 }, pixels: { width: 748, height: 720 }, density: 2.125, source: 'device-measured' });
    expect(flip6.postures?.map((p) => p.id)).toEqual(['closed', 'open', 'flex', 'flex-rotated']);
  });
});
