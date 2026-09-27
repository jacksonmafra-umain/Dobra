// src/ui/Inspector.test.ts
import { describe, expect, it } from 'vitest';
import { formatMedia } from './Inspector';

const base = { pointer: 'coarse', keyboard: 'virtual', viewingDistance: 'near', hasCamera: true, hasMicrophone: true, windowPosture: 'Flat' } as const;

describe('formatMedia', () => {
  it('lists every fact and marks category defaults as estimated', () => {
    expect(formatMedia({ ...base, overridden: [], estimated: true })).toBe('Coarse pointer · virtual keyboard · near · camera · mic · Flat (category default, estimated)');
  });
  it('marks overrides', () => {
    expect(formatMedia({ ...base, pointer: 'fine', overridden: ['pointer'], estimated: true })).toBe(
      'Fine pointer (override) · virtual keyboard · near · camera · mic · Flat (category default, estimated)',
    );
  });
  it('says when there is no camera or microphone', () => {
    expect(formatMedia({ ...base, hasCamera: false, hasMicrophone: false, overridden: [], estimated: false })).toBe('Coarse pointer · virtual keyboard · near · no camera · no mic · Flat');
  });
});
