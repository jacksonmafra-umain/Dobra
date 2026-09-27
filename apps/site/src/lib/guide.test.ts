import { describe, expect, it } from 'vitest';
import { guideHref, guideSlug } from './guide';

describe('guide routes', () => {
  it('makes the index the guide root and drops the number from every other part', () => {
    expect(guideSlug('00-index.md')).toBe('');
    expect(guideSlug('02-android.md')).toBe('android');
    expect(guideSlug('06-patterns')).toBe('patterns');
    expect(guideSlug('09-faq.md')).toBe('faq');
  });
  it('builds trailing-slash hrefs', () => {
    expect(guideHref('')).toBe('/guide/');
    expect(guideHref('anti-patterns')).toBe('/guide/anti-patterns/');
  });
});
