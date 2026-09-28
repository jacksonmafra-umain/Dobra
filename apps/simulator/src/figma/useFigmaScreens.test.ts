import { describe, expect, it } from 'vitest';
import { frameLoadKey } from './useFigmaScreens';
import type { StoredFigmaScreens } from './store';

const stored: StoredFigmaScreens = { version: 1, fileKey: 'KEY', fileName: 'App', frames: [{ id: '1:1', name: 'Home', page: 'Screens', width: 402, height: 874 }] };
const base = { stored, selectedId: '1:1', token: 'tok', generation: 0, scale: 2, paused: false };

describe('frameLoadKey', () => {
  it('names the frame, the scale and the token it was loaded with', () => {
    expect(frameLoadKey(base)).toBe('1:1@2#0');
  });
  it('loads again after the token changes, so an old refusal does not stick', () => {
    expect(frameLoadKey({ ...base, generation: 1 })).not.toBe(frameLoadKey(base));
  });
  it('waits while the token is being typed', () => {
    expect(frameLoadKey({ ...base, paused: true })).toBeNull();
  });
  it('loads only frames on the list, not any id a link names', () => {
    expect(frameLoadKey({ ...base, selectedId: '9:9&scale=4' })).toBeNull();
  });
  it('needs a token and a list', () => {
    expect(frameLoadKey({ ...base, token: ' ' })).toBeNull();
    expect(frameLoadKey({ ...base, stored: null })).toBeNull();
  });
});
