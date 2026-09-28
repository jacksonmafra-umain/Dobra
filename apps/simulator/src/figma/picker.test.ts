import { describe, expect, it } from 'vitest';
import { initialPicker, pickerReducer, visibleFrames } from './picker';
import type { FileListing } from './loader';

const listing: FileListing = {
  fileKey: 'KEY', fileName: 'App', patterns: { controls: [], chrome: [] },
  pages: [
    { name: 'Screens', frames: [{ id: '1:1', name: 'Home', page: 'Screens', width: 402, height: 874, match: 'iphone-17/main/-/portrait' }, { id: '1:2', name: 'Checkout', page: 'Screens', width: 851, height: 883 }] },
    { name: 'Cover', frames: [{ id: '2:1', name: 'Cover', page: 'Cover', width: 1600, height: 1200 }] },
  ],
};

describe('pickerReducer', () => {
  it('goes from connect to loading to pick', () => {
    let s = pickerReducer(initialPicker, { type: 'load' });
    expect(s.step).toBe('loading');
    s = pickerReducer(s, { type: 'loaded', listing });
    expect(s).toMatchObject({ step: 'pick', listing, picked: [] });
  });
  it('returns to connect with the error when loading fails', () => {
    const s = pickerReducer(pickerReducer(initialPicker, { type: 'load' }), { type: 'failed', error: 'Figma refused the token' });
    expect(s).toMatchObject({ step: 'connect', error: 'Figma refused the token' });
  });
  it('toggles frames and keeps them in listing order', () => {
    let s = pickerReducer(pickerReducer(initialPicker, { type: 'load' }), { type: 'loaded', listing });
    s = pickerReducer(s, { type: 'toggle', id: '2:1' });
    s = pickerReducer(s, { type: 'toggle', id: '1:1' });
    expect(s.picked).toEqual(['1:1', '2:1']);
    s = pickerReducer(s, { type: 'toggle', id: '1:1' });
    expect(s.picked).toEqual(['2:1']);
  });
  it('starts with the frames already picked', () => {
    const s = pickerReducer(pickerReducer(initialPicker, { type: 'load' }), { type: 'loaded', listing, picked: ['1:2', 'gone'] });
    expect(s.picked).toEqual(['1:2']);
  });
});

describe('visibleFrames', () => {
  it('filters by name and page, in any case, dropping empty pages', () => {
    expect(visibleFrames(listing, 'check').map((p) => [p.name, p.frames.map((f) => f.id)])).toEqual([['Screens', ['1:2']]]);
    expect(visibleFrames(listing, 'COVER').map((p) => p.name)).toEqual(['Cover']);
    expect(visibleFrames(listing, '').length).toBe(2);
  });
});
