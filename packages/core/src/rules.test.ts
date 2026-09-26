import { describe, expect, it } from 'vitest';
import { loadCatalog } from './catalog/load';
import type { GeoNode, Subject } from './geo';
import { check } from './rules';
import { envConfigOf, resolveTarget, type Target } from './targets';

const config = envConfigOf(loadCatalog());
const DUO: Target = { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned', orientation: 'landscape' };
const node = (id: string, role: GeoNode['role'], rect: GeoNode['rect'], extra: Partial<GeoNode> = {}): GeoNode => ({ id, name: id, role, rect, ...extra });
const subject = (root: GeoNode[], targets: Target[] = [DUO], extra: Partial<Subject> = {}): Subject => ({
  source: 'figma', ref: '1:1', targets, confidence: 'tag', width: 1100, height: 756, root, ...extra,
});
const ids = (s: Subject, rule: string) => check(s, config).filter((f) => f.ruleId === rule).map((f) => f.nodeId);

describe('spatial rules', () => {
  it('flags the outermost important node on the hinge, once', () => {
    const card = node('card', 'interactive', { x: 500, y: 100, width: 100, height: 80 }, {
      children: [node('buy', 'interactive', { x: 520, y: 120, width: 60, height: 40 })],
    });
    expect(ids(subject([card]), 'hinge-content')).toEqual(['card']);
  });

  it('compares only the x span inside a vertical scroller', () => {
    const list = node('list', 'container', { x: 0, y: 0, width: 1100, height: 756 }, {
      scrollAxis: 'y',
      children: [node('title', 'text', { x: 520, y: 2000, width: 60, height: 20 }, { chars: 12 })],
    });
    expect(ids(subject([list]), 'hinge-content')).toEqual(['title']);
  });

  it('flags a pane that straddles a separating hinge, as a heuristic', () => {
    const row = node('row', 'container', { x: 0, y: 0, width: 1100, height: 756 }, {
      layout: 'horizontal',
      children: [node('left', 'container', { x: 0, y: 0, width: 700, height: 756 }), node('right', 'container', { x: 700, y: 0, width: 400, height: 756 })],
    });
    const f = check(subject([row]), config).filter((x) => x.ruleId === 'pane-split');
    expect(f.map((x) => x.nodeId)).toEqual(['left']);
    expect(f[0].estimated).toBe(true);
  });

  it('flags a frame whose size differs from its tagged target', () => {
    expect(ids(subject([], [DUO], { width: 1000 }), 'frame-size-mismatch')).toEqual(['1:1']);
    expect(ids(subject([]), 'frame-size-mismatch')).toEqual([]);
  });

  it('flags content wider than the frame, but not inside a horizontal scroller', () => {
    const wide = node('banner', 'media', { x: 0, y: 0, width: 1300, height: 100 });
    const carousel = node('carousel', 'container', { x: 0, y: 200, width: 1100, height: 100 }, {
      scrollAxis: 'x',
      children: [node('slide', 'media', { x: 900, y: 200, width: 400, height: 100 })],
    });
    expect(ids(subject([wide, carousel]), 'overflow-x')).toEqual(['banner']);
  });

  it('flags controls above the hinge in tabletop posture', () => {
    const tabletop: Target = { deviceId: 'galaxy-z-fold-7', displayId: 'inner', pose: 'tabletop', orientation: 'landscape' };
    const env = resolveTarget(config, tabletop);
    const top = node('play', 'interactive', { x: 100, y: 100, width: 120, height: 48 });
    const bottom = node('seek', 'interactive', { x: 100, y: env.height - 100, width: 120, height: 48 });
    const f = check(subject([top, bottom], [tabletop], { width: env.width, height: env.height }), config).filter((x) => x.ruleId === 'tabletop-controls');
    expect(f.map((x) => x.nodeId)).toEqual(['play']);
  });

  it('checks a size-matched frame against every candidate, assuming the worst hinge', () => {
    const t1: Target = { deviceId: 'pixel-9-pro-fold', displayId: 'inner', pose: 'open', orientation: 'portrait' };
    const onCrease = node('cta', 'interactive', { x: 400, y: 300, width: 60, height: 48 });
    const bySize = check(subject([onCrease], [t1], { confidence: 'size', width: 851, height: 883 }), config);
    expect(bySize.some((f) => f.ruleId === 'hinge-content' && f.nodeId === 'cta')).toBe(true);
    const tagged = check(subject([onCrease], [t1], { confidence: 'tag', width: 851, height: 883 }), config);
    expect(tagged.some((f) => f.ruleId === 'hinge-content')).toBe(false);
  });
});
