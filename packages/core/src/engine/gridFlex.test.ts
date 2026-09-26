// src/engine/gridFlex.test.ts
import { describe, expect, it } from 'vitest';
import { resolveFlex, resolveTracks } from './gridFlex';

describe('resolveTracks', () => {
  it('repeats an adaptive track as many times as fit', () => {
    expect(resolveTracks([{ adaptive: { min: 320 } }], 1100, 24)).toHaveLength(3);
    expect(resolveTracks([{ adaptive: { min: 320 } }], 1000, 24)).toHaveLength(2);
    expect(resolveTracks([{ adaptive: { min: 320 } }], 600, 24)).toEqual([600]);
  });
  it('caps adaptive tracks at max', () => {
    expect(resolveTracks([{ adaptive: { min: 320, max: 400 } }], 1000, 24)).toEqual([400, 400]);
  });
  it('keeps one adaptive column no wider than the container when min exceeds it', () => {
    expect(resolveTracks([{ adaptive: { min: 500 } }], 352, 24)).toEqual([352]);
  });
  it('shares the rest between fr tracks after fixed ones', () => {
    expect(resolveTracks([{ fixed: 100 }, { fr: 1 }, { fr: 3 }], 524, 12)).toEqual([100, 100, 300]);
  });
});

describe('resolveFlex', () => {
  const cfg = { wrap: true, basis: 96, grow: 1, shrink: 1, gap: 12 };
  it('fits as many items per line as the basis allows and grows them', () => {
    const r = resolveFlex(cfg, 352, 3);
    expect(r.lines).toBe(1);
    expect(r.widths[0]).toBeCloseTo((352 - 24) / 3);
  });
  it('wraps onto new lines when the basis does not fit', () => {
    expect(resolveFlex(cfg, 200, 3).lines).toBe(3);
    expect(resolveFlex(cfg, 210, 3).lines).toBe(2);
  });
  it('shrinks items on one line when wrapping is off', () => {
    const r = resolveFlex({ ...cfg, wrap: false, grow: 0 }, 200, 3);
    expect(r.lines).toBe(1);
    expect(r.widths.every((w) => w < 96)).toBe(true);
    expect(r.widths.reduce((a, b) => a + b, 0) + 24).toBeCloseTo(200);
  });
  it('does not grow items when grow is 0', () => {
    expect(resolveFlex({ ...cfg, grow: 0 }, 400, 2).widths).toEqual([96, 96]);
  });
});
