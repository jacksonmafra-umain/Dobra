import { describe, expect, it } from 'vitest';
import { rawConfig as raw } from '@dobra/core/config/load';
import { parseConfig } from '@dobra/core/config/schema';
import { targetOf } from '@dobra/core/engine/checks';
import { resolveEnvironment, type Selection } from '@dobra/core/engine/environment';
import type { GeoNode } from '@dobra/core/geo';
import { figmaFindings, scaleGeo } from './checks';

const config = parseConfig(raw);
const sel: Selection = { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned', orientation: 'landscape', free: null };
const env = resolveEnvironment(config, sel);
const onHinge: GeoNode = { id: 'b', name: 'Pay now', role: 'interactive', rect: { x: 500, y: 300, width: 120, height: 48 } };

describe('scaleGeo', () => {
  it('scales rects and font sizes, children included', () => {
    const [n] = scaleGeo([{ ...onHinge, fontSize: 20, children: [{ ...onHinge, id: 'c' }] }], 0.5);
    expect(n.rect).toEqual({ x: 250, y: 150, width: 60, height: 24 });
    expect(n.fontSize).toBe(10);
    expect(n.children![0].rect.width).toBe(60);
  });
});

describe('figmaFindings', () => {
  it('runs the foldable rules on a frame the size of the window', () => {
    const r = figmaFindings(config, env, targetOf(sel, env), { width: env.width, height: env.height, geo: [onHinge] });
    expect(r.findings.map((f) => f.ruleId)).toContain('hinge-content');
    expect(r.scale).toBe(1);
  });
  it('marks every finding estimated when the frame is scaled to fit', () => {
    const r = figmaFindings(config, env, targetOf(sel, env), { width: env.width * 2, height: env.height * 2, geo: scaleGeo([onHinge], 2) });
    expect(r.scale).toBe(0.5);
    expect(r.findings.length).toBeGreaterThan(0);
    expect(r.findings.every((f) => f.estimated)).toBe(true);
  });
  it('explains that free resize has no catalog target', () => {
    const free = resolveEnvironment(config, { ...sel, free: { width: 700, height: 500 } });
    const r = figmaFindings(config, free, targetOf({ ...sel, free: { width: 700, height: 500 } }, free), { width: 700, height: 500, geo: [onHinge] });
    expect(r.findings).toEqual([]);
    expect(r.note).toMatch(/Free resize/);
  });
});
