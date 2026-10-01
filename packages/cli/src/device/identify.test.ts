import { describe, expect, it } from 'vitest';
import { loadCatalog } from '@dobra/core/catalog/load';
import { ADB, fakeAdb } from './fakeAdb';
import { identify, phonePosture } from './identify';
import { listDevices } from './adb';

const catalog = loadCatalog();

describe('identify', () => {
  it('names an emulator Dobra created by its AVD name', async () => {
    const r = fakeAdb({ 'emulator-5554': { emulator: true, model: 'sdk_gphone64_arm64', avd: 'dobra_galaxy-z-fold-7', chrome: '133.0' } });
    const [d] = await listDevices(r);
    expect(await identify(r, ADB, d, catalog)).toEqual({ deviceId: 'galaxy-z-fold-7', how: 'avd-name' });
  });
  it('names a phone by its model, and says when the catalog does not know it', async () => {
    const r = fakeAdb({ RZ: { model: 'SM-F741B', chrome: '154.0' }, T5: { model: 'SM-T510', chrome: '153.0' } });
    const [flip, tab] = await listDevices(r);
    expect(await identify(r, ADB, flip, catalog)).toEqual({ deviceId: 'galaxy-z-flip-6', how: 'model' });
    expect(await identify(r, ADB, tab, catalog)).toEqual({ deviceId: null, how: 'unknown' });
  });
  it('falls back to the model for an emulator Dobra did not create', async () => {
    const r = fakeAdb({ 'emulator-5556': { emulator: true, model: 'Pixel 9 Pro Fold', avd: 'fold_api36' } });
    const [d] = await listDevices(r);
    expect(await identify(r, ADB, d, catalog)).toEqual({ deviceId: 'pixel-9-pro-fold', how: 'model' });
  });
});

describe('phonePosture', () => {
  it('maps a flip half-open upright to its tabletop-kind posture, and turned to its book-kind one', () => {
    expect(phonePosture(catalog, 'galaxy-z-flip-6', 'HALF_OPENED', 0)).toEqual({ posture: 'flex', orientation: 'portrait' });
    expect(phonePosture(catalog, 'galaxy-z-flip-6', 'HALF_OPENED', 1)).toEqual({ posture: 'flex-rotated', orientation: 'landscape' });
  });
  it('maps closed to the cover posture and open to the flat one', () => {
    expect(phonePosture(catalog, 'galaxy-z-flip-6', 'CLOSED', 0)?.posture).toBe('closed');
    expect(phonePosture(catalog, 'galaxy-z-flip-6', 'OPENED', 0)?.posture).toBe('open');
  });
  it('maps a book foldable half-open to book, and a device without postures to null', () => {
    expect(phonePosture(catalog, 'galaxy-z-fold-7', 'HALF_OPENED', 0)?.posture).toBe('book');
    expect(phonePosture(catalog, 'pixel-9', 'OPENED', 0)).toBeNull();
  });
});
