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
});
