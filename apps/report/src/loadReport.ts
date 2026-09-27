// Figma file → foldable check report, with thumbnails. Complete results are cached per file version.
import { loadCatalog } from '@dobra/core/catalog/load';
import { frameCandidates, parseFileKey, restToGeo, type RestNode } from '@dobra/core/figmaRest';
import { buildReport, type Report } from '@dobra/core/report';
import { FigmaError, type FigmaClient } from './figmaClient';

const catalog = loadCatalog();

export interface LoadedReport {
  report: Report;
  thumbnails: Record<string, string | null>;
  /** Something that did not stop the report, such as thumbnails that could not be loaded. */
  notice?: string;
}

const cache = new Map<string, LoadedReport>();

const CONTAINERS = new Set(['SECTION', 'GROUP']);

/**
 * The file call (depth=2) stops at each page's direct children, so a Section comes back empty.
 * Load each top-level Section or Group through /nodes, which returns its whole subtree.
 */
async function expandContainers(client: FigmaClient, key: string, document: RestNode): Promise<{ document: RestNode; failed: { id: string; reason: string }[] }> {
  const ids = (document.children ?? []).flatMap((page) => (page.children ?? []).filter((n) => CONTAINERS.has(n.type)).map((n) => n.id));
  if (!ids.length) return { document, failed: [] };
  const { loaded, failed } = await client.nodes(key, ids);
  const pages = (document.children ?? []).map((page) => ({ ...page, children: (page.children ?? []).map((n) => loaded[n.id] ?? n) }));
  return { document: { ...document, children: pages }, failed };
}

export async function loadFigmaReport(client: FigmaClient, url: string): Promise<LoadedReport> {
  const key = parseFileKey(url);
  if (!key) throw new Error('Paste a figma.com file or design link.');
  // No /me call: it needs the current_user:read scope, and the file call already validates the token.
  const file = await client.file(key);
  const cached = cache.get(`${key}@${file.version}`);
  if (cached) return cached;

  const expanded = await expandContainers(client, key, file.document);
  const frames = frameCandidates(expanded.document);
  const { loaded, failed } = await client.nodes(key, frames.map((f) => f.id));
  const reasons = new Map(failed.map((f) => [f.id, f.reason]));
  const report = buildReport(
    catalog,
    { kind: 'figma', ref: key, name: file.name, fileVersion: file.version },
    frames.map((f) => ({ ref: f.id, name: f.name, page: f.page, width: f.width, height: f.height, tag: f.tag, root: loaded[f.id] ? restToGeo(loaded[f.id]) : null, reason: reasons.get(f.id) })),
  );

  let thumbnails: Record<string, string | null> = {};
  let notice: string | undefined;
  try {
    thumbnails = await client.images(key, Object.keys(loaded));
  } catch (e) {
    notice = `Thumbnails could not be loaded: ${e instanceof FigmaError ? e.message : 'unknown error'}`;
  }
  if (expanded.failed.length) {
    notice = [notice, `${expanded.failed.length} section(s) could not be opened: ${expanded.failed[0].reason}`].filter(Boolean).join(' ');
  }

  const result: LoadedReport = { report, thumbnails, ...(notice ? { notice } : {}) };
  // Only cache a complete report: a retry after a rate limit should load what was missing.
  if (!failed.length && !expanded.failed.length && !notice) cache.set(`${key}@${file.version}`, result);
  return result;
}
