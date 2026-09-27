import { describe, expect, it } from 'vitest';
import { loadCatalog } from './load';

const catalog = loadCatalog();

describe('layout defaults', () => {
  it('covers every Android width class and both iOS classes', () => {
    const android = catalog.platforms.android.sizeClasses.width.map((w) => w.id);
    expect(Object.keys(catalog.layoutDefaults.android).sort()).toEqual([...android].sort());
    expect(Object.keys(catalog.layoutDefaults.ios).sort()).toEqual(['compact', 'regular']);
  });

  it('uses Material 3 margins on Android and marks what the guidance does not publish', () => {
    const a = catalog.layoutDefaults.android;
    expect([a.compact.margin, a.medium.margin, a.expanded.margin]).toEqual([16, 24, 24]);
    expect(a.compact.source).toBe('material3');
    expect(a.compact.estimated).toEqual(expect.arrayContaining(['columns', 'gutter']));
    expect(catalog.layoutDefaults.ios.compact.source).toBe('apple-hig');
  });
});
