// src/engine/scenes.test.ts
import { describe, expect, it } from 'vitest';
import raw from '../config/simulator.config.json';
import { parseConfig } from '../config/schema';
import { resolveScene } from './scenes';

const scenes = parseConfig(raw).scenes!;
const content = (width: number, height = 800) => ({ x: 24, y: 0, width, height });
const base = { id: 'list-detail', spec: scenes['list-detail'], regions: [] as { x: number; y: number; width: number; height: number }[], forceSingle: false, unit: 'dp' };

describe('resolveScene', () => {
  it('splits list-detail when both minimum widths fit', () => {
    const s = resolveScene({ ...base, content: content(1000) });
    expect(s.fellBack).toBe(false);
    expect(s.panes.map((p) => p.role)).toEqual(['list', 'detail']);
    expect(s.panes[0].rect.width).toBe(400);
    expect(s.panes[1].rect.x).toBe(424);
  });

  it('keeps the list at its minimum when the fraction is too narrow', () => {
    const s = resolveScene({ ...base, content: content(700) });
    expect(s.panes[0].rect.width).toBe(320);
    expect(s.panes[1].rect.width).toBe(380);
  });

  it('falls back to the detail pane with a reason when the minimums do not fit', () => {
    const s = resolveScene({ ...base, content: content(352) });
    expect(s).toMatchObject({ strategy: 'list-detail', fellBack: true });
    expect(s.panes).toEqual([{ role: 'detail', rect: content(352) }]);
    expect(s.reason).toBe('list-detail → single: 320 + 360 dp minimum does not fit 352 dp');
  });

  it('splits at the hinge when a fold separates the window', () => {
    const regions = [
      { x: 0, y: 0, width: 425.5, height: 883 },
      { x: 425.5, y: 0, width: 425.5, height: 883 },
    ];
    const s = resolveScene({ ...base, content: content(803), regions });
    expect(s.panes.map((p) => p.rect)).toEqual([
      { x: 24, y: 0, width: 401.5, height: 800 },
      { x: 425.5, y: 0, width: 401.5, height: 800 },
    ]);
  });

  it('stacks panes in tabletop', () => {
    const regions = [
      { x: 0, y: 0, width: 883, height: 425.5 },
      { x: 0, y: 425.5, width: 883, height: 425.5 },
    ];
    expect(resolveScene({ ...base, content: content(835), regions }).panes[1].rect.y).toBe(425.5);
  });

  it('marks a third tri-fold region as spare', () => {
    const regions = [0, 1, 2].map((i) => ({ x: i * 274, y: 0, width: 274, height: 603 }));
    const s = resolveScene({ ...base, content: content(775), regions });
    expect(s.panes.map((p) => p.role)).toEqual(['list', 'detail', 'spare']);
  });

  it('obeys a rule that forces a single pane', () => {
    const s = resolveScene({ ...base, content: content(1000), forceSingle: true });
    expect(s.panes).toHaveLength(1);
    expect(s.reason).toBe('The layout rule forces a single pane');
  });

  it('splits a single-pane scene at a separating hinge into main and spare', () => {
    const regions = [
      { x: 0, y: 0, width: 425.5, height: 883 },
      { x: 425.5, y: 0, width: 425.5, height: 883 },
    ];
    const s = resolveScene({ ...base, id: 'single', spec: null, content: content(803), regions });
    expect(s.panes.map((p) => p.role)).toEqual(['main', 'spare']);
  });

  it('treats a screen without a scene as single', () => {
    expect(resolveScene({ ...base, id: 'single', spec: null, content: content(1000) }).panes).toEqual([{ role: 'main', rect: content(1000) }]);
  });

  it('keeps a supporting pane at its width', () => {
    const s = resolveScene({ ...base, id: 'supporting-pane', spec: scenes['supporting-pane'], content: content(1000) });
    expect(s.panes.map((p) => [p.role, p.rect.width])).toEqual([
      ['main', 640],
      ['supporting', 360],
    ]);
  });
});
