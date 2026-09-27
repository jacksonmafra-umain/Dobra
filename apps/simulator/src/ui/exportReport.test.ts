// src/ui/exportReport.test.ts
import { describe, expect, it } from 'vitest';
import { parseReport } from '@dobra/core/report';
import { exportable, reportFileName, simulatorReport, toGeoTree, type NodeRecord } from './exportReport';

const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const records: NodeRecord[] = [
  { id: 'root', name: 'screen', role: 'container', rect: r(0, 0, 851, 883), parent: null },
  { id: 'title', name: 'h1', role: 'text', rect: r(16, 16, 380, 40), fontSize: 28, chars: 24, parent: 'root' },
  { id: 'cta', name: 'button', role: 'interactive', rect: r(360, 800, 140, 48), parent: 'root' },
];
const target = { deviceId: 'pixel-9-pro-fold', displayId: 'inner', pose: 'book', orientation: 'portrait' as const };

describe('toGeoTree', () => {
  it('nests records under their parents', () => {
    const [root] = toGeoTree(records);
    expect(root.children!.map((c) => c.id)).toEqual(['title', 'cta']);
  });
  it('keeps a record whose parent is missing as a root', () => {
    expect(toGeoTree([{ id: 'x', name: 'p', role: 'text', rect: r(0, 0, 10, 10), parent: 'gone' }]).map((n) => n.id)).toEqual(['x']);
  });
});

describe('simulatorReport', () => {
  it('builds a Report that parses, with the simulator as its source and the target as its tag', () => {
    const report = simulatorReport(target, 'Pixel 9 Pro Fold · Home', 'http://localhost:5199/?device=pixel-9-pro-fold', 851, 883, records, new Date('2026-09-27T00:00:00Z'));
    expect(() => parseReport(report)).not.toThrow();
    expect(report.source).toEqual({ kind: 'simulator', ref: 'http://localhost:5199/?device=pixel-9-pro-fold', name: 'Pixel 9 Pro Fold · Home' });
    expect(report.frames[0]).toMatchObject({ confidence: 'tag', targets: ['pixel-9-pro-fold/inner/book/portrait'] });
    expect(report).not.toHaveProperty('notes');
  });
  it('flags a call to action across the book crease', () => {
    const report = simulatorReport(target, 'x', 'u', 851, 883, records);
    expect(report.frames[0].findings.map((f) => f.ruleId)).toContain('hinge-content');
  });
});

describe('exportable', () => {
  it('accepts a full screen catalog target', () => {
    expect(exportable({ isFree: false, window: { mode: 'fullscreen' } } as never, target)).toEqual({ ok: true });
  });
  it('refuses free resize, windows that are not full screen, and unknown targets', () => {
    expect(exportable({ isFree: true } as never, target)).toMatchObject({ ok: false });
    expect(exportable({ isFree: false, window: { mode: 'split' } } as never, target)).toMatchObject({ ok: false, reason: expect.stringMatching(/full screen/) });
    expect(exportable({ isFree: false, window: { mode: 'fullscreen' } } as never, { ...target, pose: 'nope' })).toMatchObject({ ok: false });
  });
});

describe('reportFileName', () => {
  it('names the file after the target key', () => {
    expect(reportFileName(target)).toBe('hinge-report-pixel-9-pro-fold_inner_book_portrait.json');
  });
});
