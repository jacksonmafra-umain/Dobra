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
      zip: 'foldable-report.zip',
      wait: 500,
      failOn: 'error',
      transitions: true,
      on: null,
      hold: false,
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

  it('writes a report package by default, named after the report JSON', () => {
    expect(parseArgs(['check', 'site', 'https://example.com'])).toMatchObject({ zip: 'foldable-report.zip' });
    expect(parseArgs(['check', 'site', 'https://example.com', '--out', 'out/r.json'])).toMatchObject({ zip: 'out/r.zip' });
    expect(parseArgs(['check', 'site', 'https://example.com', '--out', 'report'])).toMatchObject({ zip: 'report.zip' });
    expect(parseArgs(['check', 'site', 'https://example.com', '--zip', 'pkg.zip'])).toMatchObject({ zip: 'pkg.zip' });
  });

  it('skips the report package with --no-zip', () => {
    expect(parseArgs(['check', 'site', 'https://example.com', '--no-zip'])).toMatchObject({ zip: null });
    expect(parseArgs(['check', 'site', 'https://example.com', '--zip', 'pkg.zip', '--no-zip'])).toHaveProperty('help');
  });

  it('assumes https:// when the address has no scheme', () => {
    expect(parseArgs(['check', 'site', 'www.umain.com'])).toMatchObject({ url: 'https://www.umain.com' });
    expect(parseArgs(['check', 'site', 'http://localhost:3000'])).toMatchObject({ url: 'http://localhost:3000' });
    expect(parseArgs(['check', 'site', 'ftp://example.com'])).toHaveProperty('help');
  });
  it('says why an address was rejected, not only the usage', () => {
    expect(parseArgs(['check', 'site', 'not an address'])).toMatchObject({ error: expect.stringMatching(/https:\/\//) });
    expect(parseArgs(['check', 'site', 'ftp://x'])).toMatchObject({ error: expect.stringContaining('ftp://x') });
  });

  it('reads --on and --hold for a check in Chrome on a device', () => {
    expect(parseArgs(['check', 'site', 'https://x.test', '--on', 'emulator-5554'])).toMatchObject({ command: 'site', on: 'emulator-5554', hold: false });
    expect(parseArgs(['check', 'site', 'https://x.test', '--on', 'RZ', '--hold'])).toMatchObject({ on: 'RZ', hold: true });
  });

  it('reads check device <serial> <url> as the same check', () => {
    expect(parseArgs(['check', 'device', 'RZ', 'https://x.test', '--no-zip'])).toMatchObject({ command: 'site', url: 'https://x.test', on: 'RZ', zip: null });
  });

  it('lists devices for --on with no serial', () => {
    expect(parseArgs(['check', 'site', '--on'])).toEqual({ command: 'devices' });
    expect(parseArgs(['check', 'site', '--on', '--json'])).toMatchObject({ help: expect.any(String) });
  });

  it('refuses --on with --targets or --category, and --hold without --on', () => {
    expect(parseArgs(['check', 'site', 'https://x.test', '--on', 'RZ', '--category', 'phone'])).toMatchObject({ error: '--on checks one device; leave out --targets and --category.' });
    expect(parseArgs(['check', 'site', 'https://x.test', '--hold'])).toMatchObject({ error: '--hold needs --on <serial>.' });
  });
});

