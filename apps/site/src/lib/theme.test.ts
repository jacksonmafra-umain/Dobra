import { describe, expect, it } from 'vitest';
import { THEME_SCRIPT, themeStore } from './theme';

function memory() {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}
const broken = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
  removeItem: () => {
    throw new Error('denied');
  },
};

describe('themeStore', () => {
  it('remembers an explicit choice and forgets it to follow the system again', () => {
    const s = memory();
    const store = themeStore(s);
    expect(store.read()).toBeNull();
    store.write('light');
    expect(store.read()).toBe('light');
    store.write(null);
    expect(store.read()).toBeNull();
    expect(s.data.size).toBe(0);
  });
  it('ignores a stored value it does not know', () => {
    const s = memory();
    s.setItem('dobra.theme', 'sepia');
    expect(themeStore(s).read()).toBeNull();
  });
  it('never throws when storage is blocked or missing', () => {
    expect(() => themeStore(broken).write('dark')).not.toThrow();
    expect(themeStore(broken).read()).toBeNull();
    expect(themeStore(null).read()).toBeNull();
  });
});

describe('THEME_SCRIPT', () => {
  it('guards storage and falls back to the system setting', () => {
    expect(THEME_SCRIPT).toContain('try');
    expect(THEME_SCRIPT).toContain('prefers-color-scheme: dark');
    expect(THEME_SCRIPT).toContain('dataset.theme');
  });
});
