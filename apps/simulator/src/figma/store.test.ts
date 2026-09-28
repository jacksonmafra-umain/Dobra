import { describe, expect, it } from 'vitest';
import { clearFigmaScreens, readFigmaScreens, writeFigmaScreens, type StoredFigmaScreens } from './store';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};
const value: StoredFigmaScreens = { version: 1, fileKey: 'KEY', fileName: 'App', frames: [{ id: '1:2', name: 'Home', page: 'Screens', width: 402, height: 874 }] };

describe('Figma screens store', () => {
  it('round-trips the file and the picked frames, and nothing else', () => {
    const s = mem();
    writeFigmaScreens(s, value);
    expect(readFigmaScreens(s)).toEqual(value);
    expect(JSON.parse(s.m.get('dobra.figmaScreens')!)).toEqual(value);
  });
  it('returns null for missing or malformed data', () => {
    const s = mem();
    expect(readFigmaScreens(s)).toBeNull();
    s.setItem('dobra.figmaScreens', '{nope');
    expect(readFigmaScreens(s)).toBeNull();
    s.setItem('dobra.figmaScreens', JSON.stringify({ version: 1, fileKey: 'K', fileName: 'x', frames: [{ id: 3 }] }));
    expect(readFigmaScreens(s)).toBeNull();
  });
  it('survives a storage that throws', () => {
    const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
    expect(readFigmaScreens(bad)).toBeNull();
    expect(() => writeFigmaScreens(bad, value)).not.toThrow();
    expect(() => clearFigmaScreens(bad)).not.toThrow();
  });
});
