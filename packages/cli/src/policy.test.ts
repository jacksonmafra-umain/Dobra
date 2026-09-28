import { describe, expect, it } from 'vitest';
import { HOSTED, LOCAL, isPublicAddress, refuseUrl } from './policy';

const dns = (map: Record<string, string[]>) => async (h: string) => map[h] ?? [];

describe('isPublicAddress', () => {
  it.each(['8.8.8.8', '1.1.1.1', '93.184.215.14', '2606:4700::1111'])('accepts %s', (ip) => expect(isPublicAddress(ip)).toBe(true));
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1',
    '::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', 'not-an-ip',
  ])('refuses %s', (ip) => expect(isPublicAddress(ip)).toBe(false));
});

describe('refuseUrl', () => {
  it('allows anything on the local policy', async () => {
    expect(await refuseUrl('http://127.0.0.1:5300/a.html', LOCAL)).toBeNull();
    expect(await refuseUrl('http://localhost:3000/', LOCAL)).toBeNull();
  });
  it('refuses non-http schemes and malformed URLs everywhere', async () => {
    expect(await refuseUrl('file:///etc/passwd', LOCAL)).toMatch(/http/);
    expect(await refuseUrl('ftp://example.com/', HOSTED, dns({}))).toMatch(/http/);
    expect(await refuseUrl('not a url', HOSTED, dns({}))).toMatch(/valid/);
  });
  it('refuses private, loopback and literal addresses on the hosted policy', async () => {
    expect(await refuseUrl('http://[::1]/', HOSTED, dns({}))).toMatch(/private/);
    expect(await refuseUrl('http://[::ffff:127.0.0.1]/', HOSTED, dns({}))).toMatch(/private/);
    expect(await refuseUrl('http://169.254.169.254/latest/', HOSTED, dns({}))).toMatch(/private/);
    expect(await refuseUrl('https://intranet.example/', HOSTED, dns({ 'intranet.example': ['10.0.0.5'] }))).toMatch(/private/);
  });
  it('refuses a host whose DNS answers mix public and private addresses', async () => {
    expect(await refuseUrl('https://split.example/', HOSTED, dns({ 'split.example': ['93.184.215.14', '127.0.0.1'] }))).toMatch(/private/);
  });
  it('refuses a host that does not resolve', async () => {
    expect(await refuseUrl('https://nowhere.example/', HOSTED, dns({}))).toMatch(/resolve/);
    expect(await refuseUrl('https://boom.example/', HOSTED, async () => { throw new Error('ENOTFOUND'); })).toMatch(/resolve/);
  });
  it('allows a public host', async () => {
    expect(await refuseUrl('https://example.com/', HOSTED, dns({ 'example.com': ['93.184.215.14'] }))).toBeNull();
    expect(await refuseUrl('http://example.com/', HOSTED, dns({ 'example.com': ['93.184.215.14'] }))).toBeNull();
  });
});
