// A foldable check report: what was checked, what matched, what the rules found and what coverage
// is missing. Built by the web report and the CLI, validated when imported.
import { z } from 'zod';
import type { Catalog } from './config/schema';
import { ConfigError, formatPath } from './config/schema';
import { coverage, type CoverageMatrix, type PresentFrame } from './coverage';
import type { Finding } from './engine/checks';
import type { GeoNode } from './geo';
import { matchFrame } from './match';
import type { RuleId } from './engine/checks';
import { ALL_RULES, check } from './rules';
import { chromeMajor, FOLD_API_CHROME, signalFindings, type FrameRuntime, type FrameSignals } from './signals';
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
  /** Where the frame was checked, when it ran in Chrome on a device. */
  runtime?: FrameRuntime;
  /** What that Chrome reported about the window and the fold. */
  signals?: FrameSignals;
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
  /** Every target key the frame stands for, when it is one window several targets share. Overrides `tag`. */
  tags?: string[];
  /** null when the frame could not be loaded. */
  root: GeoNode[] | null;
  reason?: string;
  runtime?: FrameRuntime;
  signals?: FrameSignals;
  /** Rules that don't apply to this frame, such as frame-size-mismatch for a real browser window. */
  skipRules?: RuleId[];
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
      runtime: z.object({ kind: z.literal('android-chrome'), serial: z.string(), model: z.string(), android: z.string(), chrome: z.string(), emulator: z.boolean() }).optional(),
      signals: z
        .object({
          viewport: z.object({ width: z.number(), height: z.number(), dpr: z.number() }),
          devicePosture: z.enum(['continuous', 'folded']).nullable(),
          segments: z.array(rect).nullable(),
          mq: z.object({ horizontalSegments2: z.boolean(), verticalSegments2: z.boolean(), postureFolded: z.boolean() }),
          deviceState: z.enum(['CLOSED', 'HALF_OPENED', 'OPENED']).nullable(),
        })
        .optional(),
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

/** Keeps the first of findings that differ only in their target: one window, one finding. */
function onceEach(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter(({ target: _, ...rest }) => {
    const key = JSON.stringify(rest);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
    // A device frame without a tag is a device the catalog doesn't know: matching it by size would
    // check another device's geometry.
    const m: ReturnType<typeof matchFrame> =
      f.runtime && !f.tag && !f.tags ? { by: 'none', targets: [] } : matchFrame({ tag: f.tag || undefined, ...(f.tags ? { tags: f.tags } : {}), name: f.name, width: f.width, height: f.height }, config);
    const base = { ref: f.ref, name: f.name, page: f.page, width: f.width, height: f.height, ...(f.runtime ? { runtime: f.runtime } : {}), ...(f.signals ? { signals: f.signals } : {}) };
    const rules = f.skipRules?.length ? ALL_RULES.filter((r) => !f.skipRules!.includes(r)) : undefined;
    if (m.by === 'none') {
      frames.push({ ...base, confidence: 'none', targets: [], ...(m.nearest ? { nearest: m.nearest.key } : {}), findings: [] });
      continue;
    }
    const checked = check({ source: source.kind, ref: f.ref, targets: m.targets, confidence: m.by, width: f.width, height: f.height, root: f.root }, config, rules);
    const findings = f.tags && m.by === 'tag' ? onceEach(checked) : checked;
    if (f.signals && f.runtime) findings.push(...signalFindings(f.signals, f.runtime, f.root, m.targets[0]));
    frames.push({ ...base, confidence: m.by, targets: m.targets.map(targetKey), findings });
    present.push({ frameId: f.ref, targets: m.targets, confidence: m.by });
  }
  // One note per device whose Chrome can't report the fold, instead of passing the fold-API rules.
  const oldChrome = new Map<string, FrameRuntime>();
  for (const f of inputs) if (f.runtime && chromeMajor(f.runtime.chrome) < FOLD_API_CHROME) oldChrome.set(f.runtime.serial, f.runtime);
  const notes = [...oldChrome.values()].map(
    (r) => `Chrome ${r.chrome} on ${r.model} (${r.serial}) doesn't report viewport segments or posture (they need Chrome ${FOLD_API_CHROME}), so fold APIs weren't checked there.`,
  );
  return {
    ...(notes.length ? { notes } : {}),
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
