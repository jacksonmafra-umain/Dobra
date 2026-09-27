import { describe, expect, it } from 'vitest';
import type { DeviceSpec } from '../config/types';
import { loadCatalog } from './load';
import { mediaFacts } from './media';

const cat = loadCatalog();
const byId = (id: string) => cat.devices.find((d) => d.id === id)!;

describe('media facts', () => {
  it('defaults phones and foldables to touch, a virtual keyboard and near viewing', () => {
    for (const id of ['pixel-9', 'galaxy-z-fold-7', 'galaxy-z-flip-7', 'iphone-17']) {
      expect(mediaFacts(byId(id))).toEqual({ pointer: 'coarse', keyboard: 'virtual', viewingDistance: 'near', hasCamera: true, hasMicrophone: true });
    }
  });

  it('defaults desktop-class devices to a fine pointer, a physical keyboard and medium viewing', () => {
    const desktop = { ...byId('pixel-tablet'), category: 'desktop' } as DeviceSpec;
    expect(mediaFacts(desktop)).toMatchObject({ pointer: 'fine', keyboard: 'physical', viewingDistance: 'medium' });
  });

  it('lets a device override its category', () => {
    const tablet = { ...byId('pixel-tablet'), media: { keyboard: 'physical', source: 'estimated' } } as DeviceSpec;
    expect(mediaFacts(tablet)).toMatchObject({ pointer: 'coarse', keyboard: 'physical' });
    expect(mediaFacts(tablet)).not.toHaveProperty('source');
  });

  it('rejects a media block with an unknown source', () => {
    const raw = JSON.parse(JSON.stringify(cat));
    raw.devices[0].media = { pointer: 'fine', source: 'made-up' };
    expect(() => loadCatalog(raw)).toThrow(/devices\[0\]\.media\.source/);
  });
});
