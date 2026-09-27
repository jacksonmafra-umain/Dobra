import { describe, expect, it } from 'vitest';
import { parseArgs } from './args';

describe('parseArgs', () => {
  it('reads a site check with defaults', () => {
    expect(parseArgs(['check', 'site', 'https://example.com'])).toEqual({
      command: 'site',
      url: 'https://example.com',
      targets: null,
      categories: [],
      out: 'foldable-report.json',
      md: null,
      wait: 500,
      failOn: 'error',
      transitions: true,
    });
  });

  it('reads targets, categories, outputs and thresholds', () => {
    const o = parseArgs([
      'check', 'site', 'http://localhost:3000',
      '--targets', 'pixel-9/main/-/portrait,surface-duo-2/spanned/spanned/landscape',
      '--category', 'foldable-book',
      '--out', 'r.json', '--md', 'r.md', '--wait', '1200', '--fail-on', 'warn', '--no-transitions',
    ]);
    expect(o).toMatchObject({
      targets: ['pixel-9/main/-/portrait', 'surface-duo-2/spanned/spanned/landscape'],
      categories: ['foldable-book'],
      out: 'r.json',
      md: 'r.md',
      wait: 1200,
      failOn: 'warn',
      transitions: false,
    });
  });

  it('returns help for a missing URL or an unknown command', () => {
    expect(parseArgs(['check', 'site'])).toHaveProperty('help');
    expect(parseArgs(['frobnicate'])).toHaveProperty('help');
    expect(parseArgs(['check', 'site', 'ftp://x'])).toHaveProperty('help');
  });

  it('returns help for a bad wait or fail-on value', () => {
    expect(parseArgs(['check', 'site', 'https://x.test', '--wait', '-1'])).toHaveProperty('help');
    expect(parseArgs(['check', 'site', 'https://x.test', '--fail-on', 'loud'])).toHaveProperty('help');
  });
});
