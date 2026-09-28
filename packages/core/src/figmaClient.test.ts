import { describe, expect, it, vi } from 'vitest';
import { createFigmaClient, FigmaError, redact } from './figmaClient';

const TOKEN = 'figd_secret_123';
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('Figma client', () => {
  it('sends the trimmed token in the X-Figma-Token header, never in the URL', async () => {
    const fetchImpl = vi.fn(async () => json(200, { handle: 'me' }));
    await createFigmaClient(`  ${TOKEN}\n`, fetchImpl).me();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.figma.com/v1/me');
    expect((init.headers as Record<string, string>)['X-Figma-Token']).toBe(TOKEN);
    expect(url).not.toContain(TOKEN);
  });

  it('turns 403, 404 and 429 into readable errors', async () => {
    const client = (status: number, headers = {}) => createFigmaClient(TOKEN, async () => json(status, { err: 'x' }, headers));
    await expect(client(403).me()).rejects.toThrow(/token/i);
    await expect(client(401).file('k')).rejects.toThrow(/token/i);
    await expect(client(404).file('k')).rejects.toThrow(/shared|not found/i);
    await expect(client(429, { 'retry-after': '30' }).file('k')).rejects.toMatchObject({ status: 429, retryAfter: 30 });
    await expect(client(403).me()).rejects.toBeInstanceOf(FigmaError);
  });

  it('explains a network or CORS failure and suggests a local proxy', async () => {
    const client = createFigmaClient(TOKEN, async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(client.me()).rejects.toThrow(/127\.0\.0\.1/);
  });

  it('batches node requests, asks for shared plugin data, and keeps partial results', async () => {
    const calls: string[] = [];
    const client = createFigmaClient(TOKEN, async (input) => {
      const url = String(input);
      calls.push(url);
      if (calls.length === 2) return json(429, {}, { 'retry-after': '12' });
      const ids = new URL(url).searchParams.get('ids')!.split(',');
      return json(200, { nodes: Object.fromEntries(ids.map((id) => [id, { document: { id, name: id, type: 'FRAME' } }])) });
    });
    const ids = Array.from({ length: 120 }, (_, i) => `1:${i}`);
    const { loaded, failed } = await client.nodes('k', ids);
    expect(calls).toHaveLength(3);
    expect(calls[0]).toContain('plugin_data=shared');
    expect(Object.keys(loaded)).toHaveLength(70);
    expect(failed).toHaveLength(50);
    expect(failed[0].reason).toMatch(/12 s/);
    expect(failed[0]).toMatchObject({ status: 429, retryAfter: 12 });
  });

  it('never lets the token reach an error message', async () => {
    const client = createFigmaClient(TOKEN, async () => {
      throw new Error(`boom ${TOKEN}`);
    });
    await expect(client.me()).rejects.not.toThrow(TOKEN);
    expect(redact(`x ${TOKEN} y`, TOKEN)).toBe('x ••• y');
  });

  it('asks for images at the given scale, 1 by default', async () => {
    const asked: string[] = [];
    const fetchImpl = (async (u: string) => (asked.push(u), new Response(JSON.stringify({ images: { '1:1': 'https://img' } }), { status: 200 }))) as unknown as typeof fetch;
    const client = createFigmaClient(TOKEN, fetchImpl);
    await client.images('KEY', ['1:1']);
    await client.images('KEY', ['1:1'], 2.5);
    expect(asked[0]).toContain('&scale=1');
    expect(asked[1]).toContain('&scale=2.5');
  });
  it('keeps the scale within what Figma accepts', async () => {
    const asked: string[] = [];
    const fetchImpl = (async (u: string) => (asked.push(u), new Response(JSON.stringify({ images: {} }), { status: 200 }))) as unknown as typeof fetch;
    const client = createFigmaClient(TOKEN, fetchImpl);
    await client.images('KEY', ['1:1'], 9);
    await client.images('KEY', ['1:1'], 0);
    expect(asked[0]).toContain('&scale=4');
    expect(asked[1]).toContain('&scale=0.1');
  });
});
