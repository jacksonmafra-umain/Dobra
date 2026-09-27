import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { loadCatalog } from './catalog/load';
import { presetZip } from './presetZip';
import { envConfigOf } from './targets';

describe('presetZip', () => {
  it('packs plugin JSON and one SVG per target', () => {
    const files = unzipSync(presetZip(envConfigOf(loadCatalog()), [
      { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned', orientation: 'landscape' },
      { deviceId: 'pixel-9', displayId: 'main', orientation: 'portrait' },
    ]));
    expect(Object.keys(files).sort()).toEqual(['presets.json', 'svg/pixel-9__main__-__portrait.svg', 'svg/surface-duo-2__spanned__spanned__landscape.svg']);
    expect(JSON.parse(strFromU8(files['presets.json'])).frames).toHaveLength(2);
    expect(strFromU8(files['svg/pixel-9__main__-__portrait.svg'])).toMatch(/^<svg /);
  });
});
