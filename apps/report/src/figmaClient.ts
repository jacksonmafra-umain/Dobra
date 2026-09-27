// A small Figma REST client. The token only ever travels in the X-Figma-Token header, and every
// error message is redacted before it leaves this module.
import type { RestNode } from '@dobra/core/figmaRest';

const BASE = 'https://api.figma.com/v1';
/** Frames per /nodes or /images call: keeps URLs short and one rate-limited batch small. */
const BATCH = 50;

export class FigmaError extends Error {
  constructor(
    message: string,
    readonly status: number | 'network',
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'FigmaError';
  }
}

export interface FigmaClient {
  me(): Promise<{ handle: string }>;
  file(key: string): Promise<{ name: string; version: string; document: RestNode }>;
  nodes(key: string, ids: string[]): Promise<{ loaded: Record<string, RestNode>; failed: { id: string; reason: string }[] }>;
  images(key: string, ids: string[]): Promise<Record<string, string | null>>;
}

export function redact(text: string, token: string): string {
  return token ? text.split(token).join('•••') : text;
}

const chunks = <T>(list: T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

export function createFigmaClient(rawToken: string, fetchImpl: typeof fetch = fetch): FigmaClient {
  const token = rawToken.trim();

  async function request<T>(path: string): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`${BASE}${path}`, { headers: { 'X-Figma-Token': token } });
    } catch (e) {
      throw new FigmaError(
        redact(`Could not reach api.figma.com (network or browser CORS). Run the report behind a local proxy on 127.0.0.1, or check the connection. ${String(e)}`, token),
        'network',
      );
    }
    if (res.ok) return (await res.json()) as T;
    // 401 for a bad or expired token (on /me), 403 for a token that lacks access or scope.
    if (res.status === 401 || res.status === 403)
      throw new FigmaError('Figma refused the token: check it is valid, not expired, and has the file_content:read scope.', res.status);
    if (res.status === 404) throw new FigmaError("File not found: check the URL and that the file is shared with the token's account.", 404);
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after')) || undefined;
      throw new FigmaError(`Rate limited by Figma: retry in ${retryAfter ?? 'a few'} s.`, 429, retryAfter);
    }
    throw new FigmaError(`Figma returned ${res.status}.`, res.status);
  }

  return {
    me: () => request('/me'),
    async file(key) {
      const f = await request<{ name: string; version: string; document: RestNode }>(`/files/${key}?depth=2&plugin_data=shared`);
      return { name: f.name, version: f.version, document: f.document };
    },
    async nodes(key, ids) {
      const loaded: Record<string, RestNode> = {};
      const failed: { id: string; reason: string }[] = [];
      for (const batch of chunks(ids, BATCH)) {
        try {
          const r = await request<{ nodes: Record<string, { document: RestNode } | null> }>(`/files/${key}/nodes?ids=${batch.join(',')}&plugin_data=shared`);
          for (const id of batch) {
            const doc = r.nodes[id]?.document;
            if (doc) loaded[id] = doc;
            else failed.push({ id, reason: 'Figma returned no data for this frame.' });
          }
        } catch (e) {
          const reason = e instanceof FigmaError ? e.message : redact(String(e), token);
          for (const id of batch) failed.push({ id, reason });
        }
      }
      return { loaded, failed };
    },
    async images(key, ids) {
      const out: Record<string, string | null> = {};
      for (const batch of chunks(ids, BATCH)) {
        const r = await request<{ images: Record<string, string | null> }>(`/images/${key}?ids=${batch.join(',')}&format=png&scale=1`);
        Object.assign(out, r.images);
      }
      return out;
    },
  };
}
