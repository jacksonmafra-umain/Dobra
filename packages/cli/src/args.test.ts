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
      zip: null,
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

  it('parses dobra report with defaults', () => {
    expect(parseArgs(['report'])).toEqual({ command: 'report', port: 5301, host: '127.0.0.1', dir: null });
  });

  it('parses a port, a host and a report folder', () => {
    expect(parseArgs(['report', '--port', '0', '--host', '0.0.0.0', '--dir', 'apps/report/dist'])).toEqual({ command: 'report', port: 0, host: '0.0.0.0', dir: 'apps/report/dist' });
  });

  it('rejects a bad port', () => {
    expect(parseArgs(['report', '--port', 'x'])).toHaveProperty('help');
    expect(parseArgs(['report', '--port', '70000'])).toHaveProperty('help');
  });

  it('reads --zip for a report package', () => {
    expect(parseArgs(['check', 'site', 'https://example.com', '--zip', 'out.zip'])).toMatchObject({ zip: 'out.zip' });
    expect(parseArgs(['check', 'site', 'https://example.com'])).toMatchObject({ zip: null });
  });
});
