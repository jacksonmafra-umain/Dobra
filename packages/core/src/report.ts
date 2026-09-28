// A foldable check report: what was checked, what matched, what the rules found and what coverage
// is missing. Built by the web report and the CLI, validated when imported.
import { z } from 'zod';
import type { Catalog } from './config/schema';
import { ConfigError, formatPath } from './config/schema';
import { coverage, type CoverageMatrix, type PresentFrame } from './coverage';
import type { Finding } from './engine/checks';
import type { GeoNode } from './geo';
import { matchFrame } from './match';
import { check } from './rules';
import { envConfigOf, targetKey } from './targets';

export interface ReportFrame {
  ref: string;
  name: string;
  page: string;
  width: number;
  height: number;
  confidence: 'tag' | 'name' | 'size' | 'none';
  targets: string[];
  nearest?: string;
  findings: Finding[];
}

export interface Report {
  version: 1;
  generatedAt: string;
  source: { kind: 'figma' | 'web' | 'simulator'; ref: string; name: string; fileVersion?: string };
  catalogVersion: string;
  frames: ReportFrame[];
  coverage: CoverageMatrix;
  unloaded: { ref: string; name: string; reason: string }[];
  /** Things the reader should know about the run, such as a page cut short at the element cap. */
  notes?: string[];
}

export interface ReportInput {
  ref: string;
  name: string;
  page: string;
  width: number;
  height: number;
  tag: string;
  /** null when the frame could not be loaded. */
  root: GeoNode[] | null;
  reason?: string;
}

const rect = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });
const target = z.object({ deviceId: z.string(), displayId: z.string(), pose: z.string().optional(), orientation: z.enum(['portrait', 'landscape']), rotation: z.union([z.literal(0), z.literal(90)]).optional() });
const finding = z.object({ ruleId: z.string(), severity: z.enum(['error', 'warn', 'info']), target, nodeId: z.string(), rect, message: z.string(), source: z.string(), estimated: z.boolean() });
const requirement = z.object({ category: z.string(), kind: z.string(), orientation: z.enum(['portrait', 'landscape']), level: z.enum(['required', 'optional']), note: z.string().optional() });

export const reportSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  source: z.object({ kind: z.enum(['figma', 'web', 'simulator']), ref: z.string(), name: z.string(), fileVersion: z.string().optional() }),
  catalogVersion: z.string(),
  frames: z.array(
    z.object({
      ref: z.string(),
      name: z.string(),
      page: z.string(),
      width: z.number(),
      height: z.number(),
      confidence: z.enum(['tag', 'name', 'size', 'none']),
      targets: z.array(z.string()),
      nearest: z.string().optional(),
      findings: z.array(finding),
    }),
  ),
  coverage: z.object({
    cells: z.array(z.object({ requirement, status: z.enum(['present', 'present-by-size', 'missing']), frames: z.array(z.string()) })),
    byCategory: z.record(z.string(), z.object({ required: z.number(), present: z.number() })),
  }),
  unloaded: z.array(z.object({ ref: z.string(), name: z.string(), reason: z.string() })),
  notes: z.array(z.string()).optional(),
});

export function parseReport(json: unknown): Report {
  const result = reportSchema.safeParse(json);
  if (!result.success) throw new ConfigError(result.error.issues.map((i) => `${formatPath(i.path) || '(root)'}: ${i.message}`));
  return result.data as Report;
}

export function buildReport(catalog: Catalog, source: Report['source'], inputs: ReportInput[], now = new Date()): Report {
  const config = envConfigOf(catalog);
  const frames: ReportFrame[] = [];
  const unloaded: Report['unloaded'] = [];
  const present: PresentFrame[] = [];
  for (const f of inputs) {
    if (!f.root) {
      unloaded.push({ ref: f.ref, name: f.name, reason: f.reason ?? 'Not loaded' });
      continue;
    }
    const m = matchFrame({ tag: f.tag || undefined, name: f.name, width: f.width, height: f.height }, config);
    const base = { ref: f.ref, name: f.name, page: f.page, width: f.width, height: f.height };
    if (m.by === 'none') {
      frames.push({ ...base, confidence: 'none', targets: [], ...(m.nearest ? { nearest: m.nearest.key } : {}), findings: [] });
      continue;
    }
    const findings = check({ source: source.kind, ref: f.ref, targets: m.targets, confidence: m.by, width: f.width, height: f.height, root: f.root }, config);
    frames.push({ ...base, confidence: m.by, targets: m.targets.map(targetKey), findings });
    present.push({ frameId: f.ref, targets: m.targets, confidence: m.by });
  }
  return {
    version: 1,
    generatedAt: now.toISOString(),
    source,
    catalogVersion: catalog.version,
    frames,
    coverage: coverage(catalog, present),
    unloaded,
  };
}

const ICON = { error: '⛔', warn: '⚠️', info: 'ℹ️' } as const;

/** Escapes the characters that would end an image link's alt text. */
const altText = (s: string) => s.replace(/[\\[\]]/g, (c) => `\\${c}`);

/** `images` maps a frame ref to a relative path; each such frame's heading is followed by its image. */
export function toMarkdown(r: Report, opts: { images?: Record<string, string> } = {}): string {
  const lines = [
    `# Foldable check — ${r.source.name}`,
    '',
    `Generated ${r.generatedAt} · catalog ${r.catalogVersion}${r.source.fileVersion ? ` · file version ${r.source.fileVersion}` : ''}`,
    '',
    '| Category | Covered |',
    '|---|---|',
    ...Object.entries(r.coverage.byCategory).map(([c, v]) => `| ${c} | ${v.present}/${v.required} |`),
    '',
    '## Frames',
  ];
  for (const f of r.frames) {
    lines.push('', `### ${f.name} (${f.confidence === 'none' ? `unknown size${f.nearest ? `, nearest ${f.nearest}` : ''}` : f.confidence})`);
    const image = opts.images?.[f.ref];
    if (image) lines.push('', `![${altText(f.name)}](${image})`);
    if (!f.findings.length) lines.push('', 'No problems found.');
    for (const x of f.findings) lines.push(`- ${ICON[x.severity]} **${x.ruleId}** ${x.message}${x.estimated ? ' _(estimated)_' : ''}`);
  }
  if (r.unloaded.length) {
    lines.push('', '## Could not load', '');
    for (const u of r.unloaded) lines.push(`- ${u.name}: ${u.reason}`);
  }
  if (r.notes?.length) {
    lines.push('', '## Notes', '');
    for (const n of r.notes) lines.push(`- ${n}`);
  }
  return `${lines.join('\n')}\n`;
}
