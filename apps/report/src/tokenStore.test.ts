import { describe, expect, it } from 'vitest';
import { tokenStore } from './tokenStore';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

describe('tokenStore', () => {
  it('keeps the token only while remembering is on, and forgets it the moment it is turned off', () => {
    const storage = memoryStorage();
    const store = tokenStore(storage);
    expect(store.read()).toBe('');
    store.remember('  figd_abc \n');
    expect(storage.data.get('dobra.token')).toBe('figd_abc');
    store.forget();
    expect(storage.data.size).toBe(0);
    expect(store.read()).toBe('');
  });

  it('works without storage (private mode)', () => {
    const store = tokenStore({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    expect(store.read()).toBe('');
    expect(() => store.remember('x')).not.toThrow();
    expect(() => store.forget()).not.toThrow();
  });
});
