// Reads a Figma file for the simulator: its frames by page (with the device each matches), their
// thumbnails, and for picked frames their layers as GeoNodes and a full-size image.
import { loadCatalog } from '@dobra/core/catalog/load';
import { FigmaError, type FigmaClient } from '@dobra/core/figmaClient';
import { frameCandidates, parseFileKey, patternsFromDocument, restToGeo, type NamePatterns, type RestNode } from '@dobra/core/figmaRest';
import type { GeoNode } from '@dobra/core/geo';
import { matchFrame } from '@dobra/core/match';
import { envConfigOf, targetKey } from '@dobra/core/targets';

const config = envConfigOf(loadCatalog());
const CONTAINERS = new Set(['SECTION', 'GROUP']);

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
    await new Promise((r) => setTimeout(r, Math.min(10, e.retryAfter ?? 2) * 1000));
    return call();
  }
}

/** The file call stops at each page's children, so Sections and Groups are loaded through /nodes. */
async function expandContainers(client: FigmaClient, key: string, document: RestNode): Promise<RestNode> {
  const ids = (document.children ?? []).flatMap((p) => (p.children ?? []).filter((n) => CONTAINERS.has(n.type)).map((n) => n.id));
  if (!ids.length) return document;
  const { loaded } = await withRetry(() => client.nodes(key, ids));
  return { ...document, children: (document.children ?? []).map((p) => ({ ...p, children: (p.children ?? []).map((n) => loaded[n.id] ?? n) })) };
}

export async function listFrames(client: FigmaClient, url: string): Promise<FileListing> {
  const fileKey = parseFileKey(url);
  if (!fileKey) throw new Error('Paste a figma.com file or design link.');
  const file = await withRetry(() => client.file(fileKey));
  const document = await expandContainers(client, fileKey, file.document);
  const pages = new Map<string, FrameEntry[]>();
  for (const page of document.children ?? []) pages.set(page.name, []);
  for (const f of frameCandidates(document)) {
    const m = matchFrame({ tag: f.tag || undefined, name: f.name, width: f.width, height: f.height }, config);
    pages.get(f.page)?.push({ id: f.id, name: f.name, page: f.page, width: f.width, height: f.height, ...(m.by !== 'none' ? { match: targetKey(m.targets[0]) } : {}) });
  }
  return { fileKey, fileName: file.name, patterns: patternsFromDocument(file.document), pages: [...pages].filter(([, frames]) => frames.length).map(([name, frames]) => ({ name, frames })) };
}

/** Small renders for the picker; a failure leaves the thumbnails empty rather than failing the list. */
export async function thumbnails(client: FigmaClient, key: string, ids: string[]): Promise<Record<string, string | null>> {
  try {
    return await withRetry(() => client.images(key, ids, 0.25));
  } catch {
    return {};
  }
}

export async function loadFrames(client: FigmaClient, key: string, ids: string[], scale: number, patterns?: NamePatterns): Promise<Map<string, LoadedFrame>> {
  const { loaded, failed } = await withRetry(() => client.nodes(key, ids));
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
