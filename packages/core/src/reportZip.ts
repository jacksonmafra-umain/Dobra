// A report package: the report JSON, its Markdown and a screenshot per frame, in one ZIP that
// Foldable Check opens in the browser. The Report format itself is unchanged; index.json maps each
// frame to its screenshot, or to the reason it has none.
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { z } from 'zod';
import { parseReport, toMarkdown, type Report, type ReportFrame } from './report';

export const ROOT = 'foldable-report/';

export interface ReportIndex {
  version: 1;
  screenshots: Record<string, string>;
  missing: Record<string, string>;
}

/** ASCII-only, lowercase, at most 80 characters: every unzip tool and file system accepts it. */
function slug(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/** The screenshot's path inside the package, from the frame's position and its first target or name. */
export function screenFile(index: number, frame: Pick<ReportFrame, 'targets' | 'name'>): string {
  const base = frame.targets[0] ? frame.targets[0].replaceAll('/', '__') : frame.name;
  return `screenshots/${String(index + 1).padStart(3, '0')}-${slug(base) || 'frame'}.png`;
}

/**
 * Packs the report. `images` maps a frame ref to PNG bytes; `missing` gives the reason a frame has
 * no screenshot, and a frame in neither is listed as having none.
 */
export function reportZip(report: Report, images: Map<string, Uint8Array>, missing: Record<string, string> = {}): Uint8Array {
  const index: ReportIndex = { version: 1, screenshots: {}, missing: {} };
  const files: Zippable = {};
  report.frames.forEach((f, i) => {
    const png = images.get(f.ref);
    if (png) {
      const path = screenFile(i, f);
      index.screenshots[f.ref] = path;
      // PNGs are already compressed; storing them keeps packing fast.
      files[ROOT + path] = [png, { level: 0 }];
    } else {
      index.missing[f.ref] = missing[f.ref] ?? 'no screenshot';
    }
  });
  files[`${ROOT}report.json`] = strToU8(`${JSON.stringify(report, null, 2)}\n`);
  files[`${ROOT}report.md`] = strToU8(toMarkdown(report, { images: index.screenshots }));
  files[`${ROOT}index.json`] = strToU8(`${JSON.stringify(index, null, 2)}\n`);
  return zipSync(files, { level: 6 });
}

export class ReportZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportZipError';
  }
}

/** Limits checked before a ZIP is trusted: the browser holds the whole package in memory. */
export const ZIP_LIMITS = { bytes: 200 * 1024 * 1024, expanded: 500 * 1024 * 1024, ratio: 50, entries: 2_000, side: 16_384 };

const indexSchema = z.object({
  version: z.literal(1),
  screenshots: z.record(z.string(), z.string()),
  missing: z.record(z.string(), z.string()).default({}),
});

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const SCREENSHOT = /^screenshots\/[a-z0-9_-]+\.png$/;

/** Null for a PNG within the size limit, else why it isn't shown. */
function pngProblem(b: Uint8Array): string | null {
  if (b.length < 24 || PNG_SIGNATURE.some((x, i) => b[i] !== x)) return 'not a PNG';
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const w = v.getUint32(16);
  const h = v.getUint32(20);
  return w > ZIP_LIMITS.side || h > ZIP_LIMITS.side ? `too large (${w}×${h})` : null;
}

export interface OpenedReportZip {
  report: Report;
  /** Frame ref to PNG bytes, for the frames whose screenshot passed the checks. */
  images: Map<string, Uint8Array>;
  missing: Record<string, string>;
  notes: string[];
}

/** Reads a package written by reportZip, refusing anything too large, malformed or unsafe. */
export function readReportZip(bytes: Uint8Array): OpenedReportZip {
  if (bytes.length > ZIP_LIMITS.bytes) throw new ReportZipError(`This ZIP is over ${ZIP_LIMITS.bytes / 1024 / 1024} MB.`);
  const stated = new Map<string, number>();
  let entries = 0;
  let expanded = 0;
  let files;
  try {
    files = unzipSync(bytes, {
      filter(f) {
        if (++entries > ZIP_LIMITS.entries) throw new ReportZipError(`This ZIP has too many files (over ${ZIP_LIMITS.entries}).`);
        if (f.name.startsWith('/') || f.name.split('/').includes('..')) throw new ReportZipError(`This ZIP has an unsafe path: ${f.name}`);
        expanded += f.originalSize;
        if (expanded > ZIP_LIMITS.expanded || expanded > Math.max(bytes.length, 1024 * 1024) * ZIP_LIMITS.ratio)
          throw new ReportZipError('This ZIP would expand to more than is safe to open here.');
        if (!f.name.startsWith(ROOT)) return false;
        const rel = f.name.slice(ROOT.length);
        const wanted = rel === 'report.json' || rel === 'index.json' || SCREENSHOT.test(rel);
        if (wanted) stated.set(f.name, f.originalSize);
        return wanted;
      },
    });
  } catch (e) {
    if (e instanceof ReportZipError) throw e;
    throw new ReportZipError(`This file is not a readable ZIP (${e instanceof Error ? e.message : String(e)}).`);
  }
  // A ZIP that states small sizes but inflates larger is lying: refuse it rather than trust it.
  for (const [name, data] of Object.entries(files))
    if (data.length !== stated.get(name)) throw new ReportZipError(`This ZIP misstates the size of ${name}.`);

  const json = files[`${ROOT}report.json`];
  if (!json) throw new ReportZipError('This ZIP has no foldable-report/report.json.');
  let report: Report;
  try {
    report = parseReport(JSON.parse(strFromU8(json)));
  } catch (e) {
    throw new ReportZipError(`foldable-report/report.json is not a foldable check report: ${e instanceof Error ? e.message : String(e)}`);
  }

  const notes: string[] = [];
  const images = new Map<string, Uint8Array>();
  let missing: Record<string, string> = {};
  const rawIndex = files[`${ROOT}index.json`];
  if (rawIndex) {
    let index: z.infer<typeof indexSchema>;
    try {
      index = indexSchema.parse(JSON.parse(strFromU8(rawIndex)));
    } catch {
      throw new ReportZipError('foldable-report/index.json is not a valid screenshot index.');
    }
    missing = index.missing;
    const refs = new Set(report.frames.map((f) => f.ref));
    for (const [ref, path] of Object.entries(index.screenshots)) {
      if (!refs.has(ref)) continue;
      const data = SCREENSHOT.test(path) ? files[ROOT + path] : undefined;
      if (!data) {
        notes.push(`The screenshot for ${ref} is missing from the ZIP.`);
        continue;
      }
      const problem = pngProblem(data);
      if (problem) notes.push(`The screenshot for ${ref} was not shown: ${problem}.`);
      else images.set(ref, data);
    }
  }
  return { report, images, missing, notes };
}
