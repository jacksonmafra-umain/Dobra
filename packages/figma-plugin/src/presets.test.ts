import { describe, expect, it } from 'vitest';
import { loadCatalog } from '@dobra/core/catalog/load';
import { presetSpec } from '@dobra/core/presets';
import { envConfigOf } from '@dobra/core/targets';
import { applyPreset, decorate, NAMESPACE, OVERLAY_NAME } from './presets';
import { createFakeFigma } from './test/fakeFigma';

const catalog = loadCatalog();
const config = envConfigOf(catalog);
const duo = presetSpec(config, { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned', orientation: 'landscape' });

const overlayOf = (frame: FrameNode) => frame.children.find((c) => c.name === OVERLAY_NAME) as FrameNode;

describe('applyPreset', () => {
  it('creates a sized, named, tagged frame', () => {
    const frame = applyPreset(createFakeFigma(), duo, catalog.version);
    expect(frame).toMatchObject({ name: duo.name, width: 1100, height: 756 });
    expect(frame.getSharedPluginData(NAMESPACE, 'target')).toBe(duo.key);
    expect(frame.getSharedPluginData(NAMESPACE, 'catalogVersion')).toBe(catalog.version);
  });

  it('adds a locked overlay with the hinge and its safe zone', () => {
    const overlay = overlayOf(applyPreset(createFakeFigma(), duo, catalog.version));
    expect(overlay.locked).toBe(true);
    expect(overlay.children.map((c) => c.name)).toEqual(expect.arrayContaining(['Hinge', 'Hinge safe zone']));
    expect(overlay.children.find((c) => c.name === 'Hinge')).toMatchObject({ x: 537, y: 0, width: 26, height: 756 });
  });

  it('draws a hairline for a crease with no width, and no hinge box', () => {
    const open = presetSpec(config, { deviceId: 'pixel-9-pro-fold', displayId: 'inner', pose: 'open', orientation: 'portrait' });
    const names = overlayOf(applyPreset(createFakeFigma(), open, catalog.version)).children.map((c) => c.name);
    expect(names.filter((n) => n === 'Crease')).toHaveLength(1);
    expect(names).not.toContain('Hinge');
  });

  it('adds a column grid and a two-pane grid split at the hinge', () => {
    const frame = applyPreset(createFakeFigma(), duo, catalog.version);
    expect(frame.layoutGrids).toEqual([
      expect.objectContaining({ pattern: 'COLUMNS', count: 12, gutterSize: 24, offset: 24 }),
      expect.objectContaining({ pattern: 'COLUMNS', count: 2, gutterSize: 26, offset: 0 }),
    ]);
  });

  it('places each new frame to the right of what is already on the page', () => {
    const api = createFakeFigma();
    const a = applyPreset(api, duo, catalog.version);
    const b = applyPreset(api, duo, catalog.version);
    expect(b.x).toBeGreaterThanOrEqual(a.x + a.width + 80);
  });

  it('marks an off-centre hinge with a grid edge exactly at the hinge', () => {
    const left = presetSpec(config, { deviceId: 'galaxy-z-trifold', displayId: 'inner', pose: 'left-half', orientation: 'landscape' });
    const frame = applyPreset(createFakeFigma(), left, catalog.version);
    expect(frame.layoutGrids).toContainEqual(
      expect.objectContaining({ pattern: 'COLUMNS', alignment: 'MIN', count: 1, offset: 0, sectionSize: left.paneEdges[0].at }),
    );
  });

  it('keeps the overlay out of the flow of an auto-layout frame', () => {
    const api = createFakeFigma();
    const frame = api.createFrame();
    (frame as unknown as { layoutMode: string }).layoutMode = 'VERTICAL';
    decorate(api, frame, duo, catalog.version);
    expect((overlayOf(frame) as unknown as { layoutPositioning: string }).layoutPositioning).toBe('ABSOLUTE');
  });
});
