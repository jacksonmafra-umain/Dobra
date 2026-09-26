import { describe, expect, it } from 'vitest';
import catalogJson from './catalog.json';
import { loadCatalog } from './load';

const clone = () => JSON.parse(JSON.stringify(catalogJson));

describe('coverage requirements', () => {
  it('ships a default requirement for every category that has devices', () => {
    const cat = loadCatalog();
    const covered = new Set(cat.requirements.filter((r) => r.level === 'required').map((r) => r.category));
    for (const d of cat.devices) expect(covered).toContain(d.category);
  });

  it('rejects a required cell no device can offer', () => {
    const raw = clone();
    raw.requirements.push({ category: 'dual-screen', kind: 'dual', orientation: 'landscape', level: 'required' });
    expect(() => loadCatalog(raw)).toThrow(/requirements\[\d+\].*dual-screen.*dual/);
  });

  it('allows an optional cell no device offers yet', () => {
    const raw = clone();
    raw.requirements.push({ category: 'dual-screen', kind: 'flat', orientation: 'portrait', level: 'optional' });
    expect(() => loadCatalog(raw)).not.toThrow();
  });

  it('rejects duplicate requirements', () => {
    const raw = clone();
    raw.requirements.push({ ...raw.requirements[0] });
    expect(() => loadCatalog(raw)).toThrow(/Duplicate requirement/);
  });

  it('checks orientation too: the Flip cover is landscape and cannot rotate', () => {
    const cat = loadCatalog();
    expect(cat.requirements).toContainEqual(expect.objectContaining({ category: 'foldable-flip', kind: 'cover', orientation: 'landscape' }));
    const raw = clone();
    raw.requirements.push({ category: 'foldable-flip', kind: 'cover', orientation: 'portrait', level: 'required' });
    expect(() => loadCatalog(raw)).toThrow(/foldable-flip cover portrait cannot be met/);
  });

  it('rejects a required desktop portrait cell: desktop windows are landscape', () => {
    const raw = clone();
    raw.requirements.push({ category: 'desktop', kind: 'flat', orientation: 'portrait', level: 'required' });
    expect(() => loadCatalog(raw)).toThrow(/desktop flat portrait cannot be met/);
  });
});
