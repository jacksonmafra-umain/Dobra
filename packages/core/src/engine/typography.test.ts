// src/engine/typography.test.ts
import { describe, expect, it } from 'vitest';
import { rawConfig as raw } from '../config/load';
import { parseConfig } from '../config/schema';
import { scaledTextSize, typeScaleVars } from './typography';

const config = parseConfig(raw);
const android = config.platforms.android.fontScale;
const ios = config.platforms.ios.fontScale;

describe('Android non-linear font scaling', () => {
  it('is linear at 1.0', () => expect(scaledTextSize(android, 14, 1)).toBe(14));
  it('returns the table verbatim on a table key', () => {
    expect(scaledTextSize(android, 14, 1.3)).toBeCloseTo(18.8);
    expect(scaledTextSize(android, 30, 2)).toBeCloseTo(38);
  });
  it('grows large text less than small text', () => {
    expect(scaledTextSize(android, 32, 2) / 32).toBeLessThan(scaledTextSize(android, 12, 2) / 12);
  });
  it('interpolates between tables', () => {
    const v = scaledTextSize(android, 14, 1.4);
    expect(v).toBeGreaterThan(18.8);
    expect(v).toBeLessThan(22);
  });
  it('clamps above the largest table', () => expect(scaledTextSize(android, 14, 2.5)).toBeCloseTo(26));
  it('interpolates inside a table between sp points', () => expect(scaledTextSize(android, 16, 1.5)).toBeCloseTo(23));
});

describe('iOS text size', () => {
  it('scales linearly', () => expect(scaledTextSize(ios, 17, 1.5)).toBeCloseTo(25.5));
});

describe('typeScaleVars', () => {
  it('emits size and line height per type style', () => {
    const vars = typeScaleVars(config, 'android', 2);
    expect(vars['--t-H1-size']).toBe(`${scaledTextSize(android, 32, 2)}px`);
    expect(Number.parseFloat(vars['--t-H1-lh'])).toBeCloseTo((35 * scaledTextSize(android, 32, 2)) / 32);
  });
});
