import { describe, expect, it } from 'vitest';
import type { Report, ReportFrame } from '@dobra/core/report';
import { deviceGroups, filterGroups, frameLabel, frameRefFromHash, hashForFrame, ruleGroups, ruleMatrix } from './findingsModel';

type Finding = ReportFrame['findings'][number];
const finding = (ruleId: string, severity: Finding['severity'], message = `${ruleId} message`): Finding =>
  ({ ruleId, severity, message, estimated: false, target: { deviceId: 'd', displayId: 'x', orientation: 'portrait' } }) as unknown as Finding;
const frame = (targets: string[], findings: Finding[], name = targets[0] ?? 'Frame'): ReportFrame =>
  ({ ref: `ref:${name}`, name, width: 100, height: 200, confidence: targets.length ? 'tag' : 'none', targets, findings }) as unknown as ReportFrame;

const names: Record<string, string> = { 'razr-2026': 'Razr 2026', 'pixel-fold': 'Pixel Fold' };
const report = {
  frames: [
    frame(['pixel-fold/outer/closed/portrait'], [finding('touch-target', 'warn')]),
    frame(['razr-2026/cover/closed/portrait'], [finding('hinge-content', 'error'), finding('hinge-content', 'error'), finding('touch-target', 'warn')]),
    frame(['pixel-fold/inner/book/portrait', 'pixel-fold/inner/book/landscape'], [finding('hinge-content', 'error')]),
    frame([], [], 'Loose frame'),
  ],
} as unknown as Report;

describe('deviceGroups', () => {
  const groups = deviceGroups(report, (id) => names[id]);

  it('groups frames by device, worst device first, with counts', () => {
    expect(groups.map((g) => g.name)).toEqual(['Razr 2026', 'Pixel Fold', 'Unmatched frames']);
    expect(groups[0].counts).toEqual({ error: 2, warn: 1, info: 0 });
    expect(groups[1].counts).toEqual({ error: 1, warn: 1, info: 0 });
  });

  it('keeps each device\'s frames in report order', () => {
    expect(groups[1].frames.map((f) => f.frame.targets[0])).toEqual(['pixel-fold/outer/closed/portrait', 'pixel-fold/inner/book/portrait']);
    expect(groups[1].frames[1].counts).toEqual({ error: 1, warn: 0, info: 0 });
  });

  it('falls back to the device id when the catalog has no name', () => {
    expect(deviceGroups(report, () => undefined)[0].name).toBe('razr-2026');
  });
});

describe('frameLabel', () => {
  it('names the display, posture and every orientation the frame stands for', () => {
    expect(frameLabel(report.frames[2])).toBe('inner · book · portrait, landscape');
    expect(frameLabel(report.frames[0])).toBe('outer · closed · portrait');
    expect(frameLabel(report.frames[3])).toBe('Loose frame');
  });
});

describe('ruleGroups', () => {
  it('groups findings by rule, errors first, then by how many', () => {
    const groups = ruleGroups([finding('touch-target', 'warn'), finding('hinge-content', 'error'), finding('touch-target', 'warn'), finding('pane-split', 'warn')]);
    expect(groups.map((g) => [g.ruleId, g.severity, g.findings.length])).toEqual([
      ['hinge-content', 'error', 1],
      ['touch-target', 'warn', 2],
      ['pane-split', 'warn', 1],
    ]);
  });
});

describe('ruleMatrix', () => {
  it('counts each rule per device, the worst rule first', () => {
    const m = ruleMatrix(deviceGroups(report, (id) => names[id]));
    expect(m.devices.map((d) => d.name)).toEqual(['Razr 2026', 'Pixel Fold']);
    expect(m.rows.map((r) => [r.ruleId, r.severity, r.total, r.perDevice])).toEqual([
      ['hinge-content', 'error', 3, [2, 1]],
      ['touch-target', 'warn', 2, [1, 1]],
    ]);
  });
});

describe('filterGroups', () => {
  const groups = deviceGroups(report, (id) => names[id]);
  it('matches the device name or the frame label, case-insensitively', () => {
    expect(filterGroups(groups, 'razr', false).map((g) => g.name)).toEqual(['Razr 2026']);
    const book = filterGroups(groups, 'BOOK', false);
    expect(book.map((g) => g.name)).toEqual(['Pixel Fold']);
    expect(book[0].frames).toHaveLength(1);
  });
  it('keeps only frames with errors when asked', () => {
    const errors = filterGroups(groups, '', true);
    expect(errors.map((g) => [g.name, g.frames.length])).toEqual([
      ['Razr 2026', 1],
      ['Pixel Fold', 1],
    ]);
  });
});

describe('the frame in the URL', () => {
  it('round-trips a frame ref through the hash, and ignores other hashes', () => {
    const ref = 'https://x.test/#razr-2026/cover/closed/portrait';
    expect(frameRefFromHash(hashForFrame(ref))).toBe(ref);
    expect(frameRefFromHash('#top')).toBeNull();
    expect(frameRefFromHash('')).toBeNull();
    expect(frameRefFromHash('#frame=%E0%A4%A')).toBeNull();
  });
});
