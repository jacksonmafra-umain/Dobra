import { describe, expect, it } from 'vitest';
import { DEVICE_CATEGORIES } from '../config/schema';
import { loadCatalog } from './load';
import { CATEGORIES, categoryOf } from './categories';

const cat = loadCatalog();
const byId = (id: string) => cat.devices.find((d) => d.id === id)!;

describe('categories', () => {
  it('lists the spec categories in order, the same as the schema', () => {
    expect(CATEGORIES).toEqual(['phone', 'foldable-book', 'foldable-flip', 'dual-screen', 'multi-fold', 'tablet', 'desktop']);
    expect(DEVICE_CATEGORIES).toEqual(CATEGORIES);
  });

  it.each([
    ['iphone-17', 'phone'],
    ['iphone-duo', 'foldable-book'],
    ['pixel-9', 'phone'],
    ['pixel-tablet', 'tablet'],
    ['pixel-9-pro-fold', 'foldable-book'],
    ['galaxy-z-fold-7', 'foldable-book'],
    ['galaxy-z-flip-7', 'foldable-flip'],
    ['galaxy-z-trifold', 'multi-fold'],
    ['huawei-mate-xt', 'multi-fold'],
  ])('%s is %s', (id, category) => {
    expect(categoryOf(byId(id))).toBe(category);
  });

  it('gives every device a category', () => {
    for (const d of cat.devices) expect(CATEGORIES).toContain(categoryOf(d));
  });
});
