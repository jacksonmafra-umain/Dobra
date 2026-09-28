import { describe, expect, it } from 'vitest';
import { addFavicon, followSystemTheme } from './page';

function fakeWindow(dark: boolean) {
  const listeners: ((e: { matches: boolean }) => void)[] = [];
  const query = {
    matches: dark,
    addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.push(l),
    removeEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.splice(listeners.indexOf(l), 1),
  };
  return { win: { matchMedia: () => query } as unknown as Pick<Window, 'matchMedia'>, change: (m: boolean) => listeners.forEach((l) => l({ matches: m })), listeners };
}

describe('followSystemTheme', () => {
  it('starts from the system setting and follows it when it changes', () => {
    const { win, change } = fakeWindow(true);
    const root = { dataset: {} as DOMStringMap };
    followSystemTheme(win, root);
    expect(root.dataset.theme).toBe('dark');
    change(false);
    expect(root.dataset.theme).toBe('light');
  });

  it('stops following once unsubscribed', () => {
    const { win, listeners } = fakeWindow(false);
    const stop = followSystemTheme(win, { dataset: {} as DOMStringMap });
    stop();
    expect(listeners).toHaveLength(0);
  });
});

describe('addFavicon', () => {
  it('adds one icon link with the given href', () => {
    const appended: { rel: string; href: string }[] = [];
    const doc = { head: { append: (el: { rel: string; href: string }) => appended.push(el) }, createElement: () => ({ rel: '', href: '' }) };
    addFavicon(doc as unknown as Pick<Document, 'head' | 'createElement'>, 'data:image/svg+xml,x');
    expect(appended).toEqual([{ rel: 'icon', href: 'data:image/svg+xml,x' }]);
  });
});
