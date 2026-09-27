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

describe('size rules', () => {
  const FLIP_COVER: Target = { deviceId: 'galaxy-z-flip-7', displayId: 'cover', pose: 'closed', orientation: 'landscape' };
  const IPHONE: Target = { deviceId: 'iphone-17', displayId: 'main', orientation: 'portrait' };
  const flip = (root: GeoNode[]) => subject(root, [FLIP_COVER], { width: 352, height: 339 });

  it('flags touch targets under 48 dp on Android and 44 pt on iOS', () => {
    const small = node('x', 'interactive', { x: 10, y: 10, width: 46, height: 46 });
    expect(ids(flip([small]), 'touch-target')).toEqual(['x']);
    expect(ids(subject([small], [IPHONE], { width: 402, height: 874 }), 'touch-target')).toEqual([]);
  });

  it('flags long text narrower than the legible width, as an estimate', () => {
    const narrow = node('body', 'text', { x: 0, y: 0, width: 141, height: 200 }, { chars: 80 });
    const label = node('ok', 'text', { x: 0, y: 300, width: 40, height: 20 }, { chars: 2 });
    const f = check(flip([narrow, label]), config).filter((x) => x.ruleId === 'min-legible-width');
    expect(f.map((x) => x.nodeId)).toEqual(['body']);
    expect(f[0].estimated).toBe(true);
  });

  it('flags side-by-side panes below 600 wide even in a landscape window (observed failure #1)', () => {
    const row = node('hero', 'container', { x: 0, y: 0, width: 352, height: 200 }, {
      layout: 'horizontal',
      children: [node('image', 'media', { x: 0, y: 0, width: 176, height: 200 }), node('copy', 'container', { x: 176, y: 0, width: 176, height: 200 })],
    });
    expect(ids(flip([row]), 'landscape-not-wide')).toEqual(['hero']);
  });

  it('flags floating chrome over content in a short window (observed failure #3)', () => {
    const bar = node('Tab bar', 'chrome', { x: 16, y: 270, width: 320, height: 60 });
    const card = node('card', 'interactive', { x: 16, y: 200, width: 320, height: 100 });
    expect(ids(flip([card, bar]), 'chrome-overlap')).toEqual(['Tab bar']);
  });
});

describe('no false positives in ordinary layouts', () => {
  const PIXEL: Target = { deviceId: 'pixel-9', displayId: 'main', orientation: 'portrait' };
  const SE_LAND: Target = { deviceId: 'iphone-se', displayId: 'main', orientation: 'landscape' };
  const FOLD_OPEN: Target = { deviceId: 'galaxy-z-fold-7', displayId: 'inner', pose: 'open', orientation: 'portrait' };

  it('pane-split ignores rows of a vertical list crossing a vertical hinge', () => {
    const list = node('list', 'container', { x: 0, y: 0, width: 750, height: 832 }, {
      layout: 'vertical',
      children: [0, 1, 2, 3].map((i) => node(`row${i}`, 'container', { x: 0, y: i * 100, width: 750, height: 100 })),
    });
    expect(ids(subject([list], [FOLD_OPEN], { confidence: 'size', width: 750, height: 832 }), 'pane-split')).toEqual([]);
  });

  it('landscape-not-wide ignores tab bars and button rows', () => {
    const tabs = node('tabs', 'container', { x: 0, y: 840, width: 411, height: 80 }, {
      layout: 'horizontal',
      children: [0, 1, 2].map((i) => node(`tab${i}`, 'interactive', { x: i * 137, y: 840, width: 137, height: 80 })),
    });
    const buttons = node('actions', 'container', { x: 0, y: 700, width: 411, height: 48 }, {
      layout: 'horizontal',
      children: [node('Cancel', 'interactive', { x: 0, y: 700, width: 200, height: 48 }), node('OK', 'interactive', { x: 211, y: 700, width: 200, height: 48 })],
    });
    expect(ids(subject([tabs, buttons], [PIXEL], { width: 411, height: 923 }), 'landscape-not-wide')).toEqual([]);
  });

  it("chrome-overlap ignores the bar's own children", () => {
    const header = node('Header', 'chrome', { x: 0, y: 0, width: 667, height: 60 }, {
      children: [node('Title', 'text', { x: 16, y: 16, width: 200, height: 24 }, { chars: 10 })],
    });
    expect(ids(subject([header], [SE_LAND], { width: 667, height: 375 }), 'chrome-overlap')).toEqual([]);
  });

  it('overflow-x ignores content cropped by a clipping container', () => {
    const crop = node('Hero', 'container', { x: 0, y: 0, width: 411, height: 200 }, {
      clips: true,
      children: [node('Photo', 'media', { x: -50, y: 0, width: 600, height: 200 })],
    });
    expect(ids(subject([crop], [PIXEL], { width: 411, height: 923 }), 'overflow-x')).toEqual([]);
  });
});
