// Reads a Figma file for the simulator: its frames by page (with the device each matches), their
// thumbnails, and for picked frames their layers as GeoNodes and a full-size image.
import { loadCatalog } from '@dobra/core/catalog/load';
import { FigmaError, type FailedNode, type FigmaClient } from '@dobra/core/figmaClient';
import { frameCandidates, parseFileKey, patternsFromDocument, restToGeo, type NamePatterns, type RestNode } from '@dobra/core/figmaRest';
import type { GeoNode } from '@dobra/core/geo';
import { matchFrame } from '@dobra/core/match';
import { envConfigOf, targetKey } from '@dobra/core/targets';

const config = envConfigOf(loadCatalog());
const CONTAINERS = new Set(['SECTION', 'GROUP']);
const THUMB_BATCH = 50;
const wait = (seconds: number | undefined) => new Promise((r) => setTimeout(r, Math.min(10, seconds ?? 2) * 1000));

export interface FrameEntry {
  id: string;
  name: string;
  page: string;
  width: number;
  height: number;
  /** The catalog target this frame matches by tag, name or size. */
  match?: string;
}

export interface FileListing {
  fileKey: string;
  fileName: string;
  pages: { name: string; frames: FrameEntry[] }[];
  /** The file's name words for classifying layers, as the plugin stored them. */
  patterns: NamePatterns;
  /** Sections or Groups Figma would not open, so their frames are missing from the list. */
  warnings: string[];
}

export interface LoadedFrame {
  image: string | null;
  geo: GeoNode[] | null;
  reason?: string;
}

/** Runs a call, retrying once after Figma's Retry-After when it is rate limited. */
async function withRetry<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (e) {
    if (!(e instanceof FigmaError) || e.status !== 429) throw e;
    await wait(e.retryAfter);
    return call();
  }
}

/** /nodes reports a rate-limited batch in `failed`; ask again once for those ids after Retry-After. */
async function nodesWithRetry(client: FigmaClient, key: string, ids: string[]) {
  const first = await withRetry(() => client.nodes(key, ids));
  const limited = first.failed.filter((f) => f.status === 429);
  if (!limited.length) return first;
  await wait(Math.max(...limited.map((f) => f.retryAfter ?? 2)));
  const again = await withRetry(() => client.nodes(key, limited.map((f) => f.id)));
  const failed: FailedNode[] = [...first.failed.filter((f) => f.status !== 429), ...again.failed];
  return { loaded: { ...first.loaded, ...again.loaded }, failed };
}

/** The file call stops at each page's children, so Sections and Groups are loaded through /nodes. */
async function expandContainers(client: FigmaClient, key: string, document: RestNode): Promise<{ document: RestNode; warnings: string[] }> {
  const containers = (document.children ?? []).flatMap((p) => (p.children ?? []).filter((n) => CONTAINERS.has(n.type)));
  if (!containers.length) return { document, warnings: [] };
  const { loaded, failed } = await nodesWithRetry(client, key, containers.map((n) => n.id));
  const names = new Map(containers.map((n) => [n.id, n.name]));
  return {
    document: { ...document, children: (document.children ?? []).map((p) => ({ ...p, children: (p.children ?? []).map((n) => loaded[n.id] ?? n) })) },
    warnings: failed.map((f) => `Section "${names.get(f.id) ?? f.id}" could not be opened, so its frames are missing: ${f.reason}`),
  };
}

export async function listFrames(client: FigmaClient, url: string): Promise<FileListing> {
  const fileKey = parseFileKey(url);
  if (!fileKey) throw new Error('Paste a figma.com file or design link.');
  const file = await withRetry(() => client.file(fileKey));
  const { document, warnings } = await expandContainers(client, fileKey, file.document);
  const pages = new Map<string, FrameEntry[]>();
  for (const page of document.children ?? []) pages.set(page.name, []);
  for (const f of frameCandidates(document)) {
    const m = matchFrame({ tag: f.tag || undefined, name: f.name, width: f.width, height: f.height }, config);
    pages.get(f.page)?.push({ id: f.id, name: f.name, page: f.page, width: f.width, height: f.height, ...(m.by !== 'none' ? { match: targetKey(m.targets[0]) } : {}) });
  }
  return { fileKey, fileName: file.name, patterns: patternsFromDocument(file.document), warnings, pages: [...pages].filter(([, frames]) => frames.length).map(([name, frames]) => ({ name, frames })) };
}

/** The file's name words, from the file call alone (the frames' layers come from /nodes). */
export async function filePatterns(client: FigmaClient, key: string): Promise<NamePatterns> {
  const file = await withRetry(() => client.file(key));
  return patternsFromDocument(file.document);
}

/**
 * Small renders for the picker, a batch at a time so they show as they arrive. A failed batch
 * leaves only its own thumbnails empty rather than failing the list.
 */
export async function thumbnails(client: FigmaClient, key: string, ids: string[], onBatch?: (part: Record<string, string | null>) => void): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (let i = 0; i < ids.length; i += THUMB_BATCH) {
    try {
      const part = await withRetry(() => client.images(key, ids.slice(i, i + THUMB_BATCH), 0.25));
      Object.assign(out, part);
      onBatch?.(part);
    } catch {
      // This batch stays blank; the rest still load.
    }
  }
  return out;
}

export async function loadFrames(client: FigmaClient, key: string, ids: string[], scale: number, patterns?: NamePatterns): Promise<Map<string, LoadedFrame>> {
  const { loaded, failed } = await nodesWithRetry(client, key, ids);
  let images: Record<string, string | null> = {};
  let imageError: string | undefined;
  try {
    images = await withRetry(() => client.images(key, Object.keys(loaded), scale));
  } catch (e) {
    imageError = e instanceof Error ? e.message : String(e);
  }
  const out = new Map<string, LoadedFrame>();
  for (const f of failed) out.set(f.id, { image: null, geo: null, reason: f.reason });
  for (const [id, node] of Object.entries(loaded))
    out.set(id, { image: images[id] ?? null, geo: restToGeo(node, patterns), ...(imageError ? { reason: `Image unavailable: ${imageError}` } : {}) });
  return out;
}
