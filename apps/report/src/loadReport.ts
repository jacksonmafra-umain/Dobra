// Figma file → foldable check report, with thumbnails. Nodes and thumbnails are cached per file version.
import { loadCatalog } from '@hinge/core/catalog/load';
import { frameCandidates, parseFileKey, restToGeo } from '@hinge/core/figmaRest';
import { buildReport, type Report } from '@hinge/core/report';
import type { FigmaClient } from './figmaClient';

const catalog = loadCatalog();
const cache = new Map<string, { report: Report; thumbnails: Record<string, string | null> }>();

export async function loadFigmaReport(client: FigmaClient, url: string): Promise<{ report: Report; thumbnails: Record<string, string | null> }> {
  const key = parseFileKey(url);
  if (!key) throw new Error('Paste a figma.com file or design link.');
  await client.me();
  const file = await client.file(key);
  const cached = cache.get(`${key}@${file.version}`);
  if (cached) return cached;
  const frames = frameCandidates(file.document);
  const { loaded, failed } = await client.nodes(key, frames.map((f) => f.id));
  const reasons = new Map(failed.map((f) => [f.id, f.reason]));
  const report = buildReport(
    catalog,
    { kind: 'figma', ref: key, name: file.name, fileVersion: file.version },
    frames.map((f) => ({ ref: f.id, name: f.name, page: f.page, width: f.width, height: f.height, tag: f.tag, root: loaded[f.id] ? restToGeo(loaded[f.id]) : null, reason: reasons.get(f.id) })),
  );
  const thumbnails = await client.images(key, Object.keys(loaded));
  const result = { report, thumbnails };
  cache.set(`${key}@${file.version}`, result);
  return result;
}
