import { describe, expect, it } from 'vitest';
import { withScheme } from './siteAddress';

describe('withScheme', () => {
  it('assumes https:// for an address without a scheme', () => {
    expect(withScheme('www.umain.com')).toBe('https://www.umain.com');
    expect(withScheme('  example.com/path  ')).toBe('https://example.com/path');
    expect(withScheme('localhost:3000')).toBe('https://localhost:3000');
  });

  it('keeps an explicit scheme', () => {
    expect(withScheme('http://localhost:3000')).toBe('http://localhost:3000');
    expect(withScheme('HTTPS://Example.com')).toBe('HTTPS://Example.com');
    expect(withScheme('ftp://example.com')).toBe('ftp://example.com');
  });

  it('leaves an empty address empty', () => {
    expect(withScheme('   ')).toBe('');
  });
  it('takes the address out of a pasted Markdown link or angle brackets', () => {
    expect(withScheme('[www.umain.com](https://www.umain.com)')).toBe('https://www.umain.com');
    expect(withScheme(' [Umain](https://www.umain.com/careers) ')).toBe('https://www.umain.com/careers');
    expect(withScheme('<https://www.umain.com>')).toBe('https://www.umain.com');
    expect(withScheme('<www.umain.com>')).toBe('https://www.umain.com');
  });
});
