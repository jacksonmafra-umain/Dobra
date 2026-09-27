import { describe, expect, it } from 'vitest';
import { POSTURE_KIND_VALUES } from '../config/schema';
import { loadCatalog } from './load';
import { POSTURE_KINDS, postureKinds } from './postures';

const cat = loadCatalog();
const kinds = (id: string) => [...postureKinds(cat.devices.find((d) => d.id === id)!)].sort();

describe('posture kinds', () => {
  it('match the schema', () => {
    expect(POSTURE_KIND_VALUES).toEqual(POSTURE_KINDS);
  });

  it('treats a device without postures as flat', () => {
    expect(kinds('pixel-9')).toEqual(['flat']);
    expect(kinds('iphone-17')).toEqual(['flat']);
  });

  it('names what each foldable can do', () => {
    expect(kinds('galaxy-z-fold-7')).toEqual(['book', 'cover', 'dual', 'flat', 'tabletop']);
    expect(kinds('pixel-9-pro-fold')).toEqual(['book', 'cover', 'dual', 'flat', 'rear', 'tabletop']);
    expect(kinds('galaxy-z-flip-7')).toEqual(['book', 'cover', 'flat', 'tabletop']);
    expect(kinds('iphone-duo')).toEqual(['book', 'cover', 'flat', 'tabletop']);
    expect(kinds('galaxy-z-trifold')).toEqual(['book', 'cover', 'flat']);
    expect(kinds('huawei-mate-xt')).toEqual(['book', 'cover', 'flat', 'partial']);
  });
});
