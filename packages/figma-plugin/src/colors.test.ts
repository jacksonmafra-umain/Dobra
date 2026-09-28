import { tokens } from '@dobra/brand/tokens';
import { describe, expect, it } from 'vitest';
import { CANVAS, figmaColor } from './colors';

describe('figmaColor', () => {
  it('turns a hex color into Figma RGB between 0 and 1', () => {
    expect(figmaColor('#FF0000')).toEqual({ r: 1, g: 0, b: 0 });
    expect(figmaColor('#007C85')).toEqual({ r: 0, g: 124 / 255, b: 133 / 255 });
  });
  it('rejects anything that is not #RRGGBB instead of drawing black', () => {
    expect(() => figmaColor('rgb(255 255 255 / 0.85)')).toThrow(/rgb/);
    expect(() => figmaColor('#fff')).toThrow(/#fff/);
  });
});

describe('CANVAS', () => {
  it('uses the brand palette for each overlay', () => {
    expect(CANVAS).toEqual({
      inset: figmaColor(tokens.light['accent-2']),
      reserved: figmaColor(tokens.light.warn),
      hinge: figmaColor(tokens.light.hinge),
      crease: figmaColor(tokens.light.fold),
      grid: figmaColor(tokens.light.pass),
    });
  });
});
