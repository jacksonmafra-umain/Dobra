import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../catalog/load';
import { DEFAULT_MEDIA } from '../catalog/media';
import { envConfigOf } from '../targets';
import { resolveEnvironment, type Selection } from './environment';

const config = envConfigOf(loadCatalog());
const phone: Selection = { deviceId: 'pixel-9', displayId: 'main', orientation: 'portrait', free: null };
const desktop: Selection = { deviceId: 'chromebook', displayId: 'main', orientation: 'landscape', free: null };

describe('environment media facts', () => {
  it('takes the device category defaults', () => {
    expect(resolveEnvironment(config, phone).media).toEqual(DEFAULT_MEDIA.phone);
    expect(resolveEnvironment(config, desktop).media).toMatchObject({ pointer: 'fine', keyboard: 'physical', viewingDistance: 'medium' });
  });

  it('applies a selection override key by key', () => {
    const env = resolveEnvironment(config, { ...phone, media: { pointer: 'fine', keyboard: undefined } });
    expect(env.media).toEqual({ ...DEFAULT_MEDIA.phone, pointer: 'fine' });
  });

  it('gives a free window the phone defaults', () => {
    expect(resolveEnvironment(config, { ...phone, free: { width: 500, height: 700 } }).media).toEqual(DEFAULT_MEDIA.phone);
  });
});
