import { describe, expect, it } from 'vitest';
import { loadCatalog } from './catalog/load';
import { ConfigError } from './config/schema';
import { buildReport, parseReport, toMarkdown } from './report';

const catalog = loadCatalog();
const source = { kind: 'figma' as const, ref: 'AbC123xyz', name: 'My file', fileVersion: '42' };
const button = { id: '2:2', name: 'Buy button', role: 'interactive' as const, rect: { x: 530, y: 300, width: 80, height: 48 } };
const frames = [
  { ref: '1:1', name: 'Home', page: 'Screens', width: 1100, height: 756, tag: 'surface-duo-2/spanned/spanned/landscape', root: [button] },
  { ref: '1:3', name: 'Odd', page: 'Screens', width: 399, height: 801, tag: '', root: [] },
  { ref: '1:9', name: 'Heavy', page: 'Screens', width: 411, height: 923, tag: '', root: null, reason: 'Rate limited: retry in 30 s' },
];

describe('report', () => {
  const r = buildReport(catalog, source, frames, new Date('2026-09-27T10:00:00Z'));

  it('matches, checks and covers the frames', () => {
    expect(r.frames[0]).toMatchObject({ ref: '1:1', confidence: 'tag', targets: ['surface-duo-2/spanned/spanned/landscape'] });
    expect(r.frames[0].findings.map((f) => f.ruleId)).toContain('hinge-content');
    expect(r.frames[1]).toMatchObject({ confidence: 'none', nearest: expect.any(String), findings: [] });
    expect(r.coverage.byCategory['dual-screen'].present).toBe(1);
  });

  it('lists every target of a frame that stands for several, and covers each', () => {
    const keys = ['galaxy-z-fold-7/inner/tabletop/portrait', 'galaxy-z-fold-7/inner/tabletop/landscape'];
    const tiny = { id: '3:1', name: 'Tiny', role: 'interactive' as const, rect: { x: 10, y: 10, width: 20, height: 20 } };
    const one = { ref: 'w#1', name: keys[0], page: 'w', width: 832, height: 750, tag: keys[0], root: [tiny] };
    const single = buildReport(catalog, { kind: 'web', ref: 'w', name: 'w' }, [one]);
    const shared = buildReport(catalog, { kind: 'web', ref: 'w', name: 'w' }, [{ ...one, name: 'galaxy-z-fold-7/inner/tabletop (portrait, landscape)', tags: keys }]);
    expect(shared.frames).toHaveLength(1);
    expect(shared.frames[0]).toMatchObject({ confidence: 'tag', targets: keys });
    const tabletop = (r: typeof single, orientation: string) =>
      r.coverage.cells.find((c) => c.requirement.category === 'foldable-book' && c.requirement.kind === 'tabletop' && c.requirement.orientation === orientation)!;
    expect(tabletop(shared, 'landscape').status).toBe('present');
    // The same finding for each target of one window is listed once, under the first target.
    const touch = (r: typeof single) => r.frames[0].findings.filter((f) => f.ruleId === 'touch-target');
    expect(touch(single)).toHaveLength(1);
    expect(touch(shared)).toHaveLength(1);
    expect(touch(shared)[0].target).toEqual({ deviceId: 'galaxy-z-fold-7', displayId: 'inner', pose: 'tabletop', orientation: 'portrait' });
  });

  it('lists frames it could not load instead of dropping them', () => {
    expect(r.unloaded).toEqual([{ ref: '1:9', name: 'Heavy', reason: 'Rate limited: retry in 30 s' }]);
    expect(r.frames.map((f) => f.ref)).not.toContain('1:9');
  });

  it('round-trips through JSON and rejects something that is not a report, with the path', () => {
    expect(parseReport(JSON.parse(JSON.stringify(r)))).toEqual(r);
    expect(() => parseReport({ version: 1, frames: [] })).toThrow(ConfigError);
    expect(() => parseReport({ version: 1, frames: 'x' })).toThrow(/frames/);
  });

  it('writes Markdown for tickets', () => {
    const md = toMarkdown(r);
    expect(md).toMatch(/^# Foldable check — My file/);
    expect(md).toContain('| dual-screen | 1/3 |');
    expect(md).toContain('hinge-content');
    expect(md).toContain('Could not load');
  });

  it('writes the same Markdown as before when no screenshots are given', () => {
    expect(toMarkdown(r)).toMatchSnapshot();
    expect(toMarkdown(r, {})).toBe(toMarkdown(r));
    expect(toMarkdown(r, { images: {} })).toBe(toMarkdown(r));
  });

  it('links a screenshot under the heading of each frame that has one', () => {
    const md = toMarkdown(r, { images: { '1:1': 'screenshots/001-surface-duo-2__spanned__spanned__landscape.png' } });
    expect(md).toContain('### Home (tag)\n\n![Home](screenshots/001-surface-duo-2__spanned__spanned__landscape.png)\n');
    expect(md.match(/!\[/g)).toHaveLength(1);
  });

  it('escapes a frame name that would break the image link', () => {
    const odd = { ...r, frames: [{ ...r.frames[0], name: 'Home [draft] (v2)' }] };
    expect(toMarkdown(odd, { images: { '1:1': 'screenshots/x.png' } })).toContain('![Home \\[draft\\] (v2)](screenshots/x.png)');
  });

  it('keeps optional notes, and still reads reports without them', () => {
    const noted = { ...r, notes: ['pixel-9/main/-/portrait: page truncated at 4000 elements'] };
    expect(parseReport(JSON.parse(JSON.stringify(noted))).notes).toEqual(noted.notes);
    expect(parseReport(JSON.parse(JSON.stringify(r))).notes).toBeUndefined();
    expect(toMarkdown(noted)).toContain('page truncated at 4000 elements');
  });

  it('accepts a report from the simulator', () => {
    const sim = buildReport(catalog, { kind: 'simulator', ref: 'http://localhost:5173/?d=pixel-9', name: 'Simulator' }, []);
    expect(parseReport(JSON.parse(JSON.stringify(sim))).source.kind).toBe('simulator');
  });
});

describe('device frames', () => {
  const runtime = { kind: 'android-chrome', serial: 'emulator-5554', model: 'sdk_gphone64_arm64', android: '16', chrome: '133.0.6943.137', emulator: true } as const;
  const signals = { viewport: { width: 750, height: 680, dpr: 2.625 }, devicePosture: 'continuous', segments: null, mq: { horizontalSegments2: false, verticalSegments2: false, postureFolded: false }, deviceState: 'OPENED' } as const;
  const input = { ref: 'u#1', name: 'galaxy-z-fold-7/inner/open/portrait', page: 'u', width: 750, height: 680, tag: 'galaxy-z-fold-7/inner/open/portrait', root: [], runtime, signals, skipRules: ['frame-size-mismatch' as const] };
  const cat = loadCatalog();

  it('keeps runtime and signals on the frame, and through parseReport', () => {
    const r = buildReport(cat, { kind: 'web', ref: 'u', name: 'u' }, [input]);
    expect(r.frames[0]).toMatchObject({ runtime, signals });
    expect(parseReport(JSON.parse(JSON.stringify(r))).frames[0]).toMatchObject({ runtime, signals });
  });

  it('skips the rules a device frame asks it to', () => {
    const r = buildReport(cat, { kind: 'web', ref: 'u', name: 'u' }, [input]);
    expect(r.frames[0].findings.map((f) => f.ruleId)).not.toContain('frame-size-mismatch');
    const without = buildReport(cat, { kind: 'web', ref: 'u', name: 'u' }, [{ ...input, skipRules: undefined }]);
    expect(without.frames[0].findings.map((f) => f.ruleId)).toContain('frame-size-mismatch');
  });

  it('still parses a report from before these fields', () => {
    const r = buildReport(cat, { kind: 'web', ref: 'u', name: 'u' }, [{ ...input, runtime: undefined, signals: undefined }]);
    expect(parseReport(JSON.parse(JSON.stringify(r))).frames[0].runtime).toBeUndefined();
  });
});
