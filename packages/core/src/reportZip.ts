// A report package: the report JSON, its Markdown and a screenshot per frame, in one ZIP that
// Foldable Check opens in the browser. The Report format itself is unchanged; index.json maps each
// frame to its screenshot, or to the reason it has none.
import { Inflate, strFromU8, strToU8, zipSync, type Zippable } from 'fflate';
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
export function reportZip(report: Report, images: Map<string, Uint8Array>, missing: Record<string, string> = {}): Uint8Array<ArrayBuffer> {
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
  images: Map<string, Uint8Array<ArrayBuffer>>;
  missing: Record<string, string>;
  notes: string[];
}

interface Entry {
  name: string;
  method: number;
  compressed: number;
  size: number;
  local: number;
}

const short = (name: string) => (name.length > 80 ? `${name.slice(0, 80)}…` : name);

/** The central directory's entries, read directly so every size and offset is ours to check. */
function centralDirectory(bytes: Uint8Array): Entry[] {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--)
    if (v.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new ReportZipError('This file is not a readable ZIP.');
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  if (count === 0xffff || at === 0xffffffff) throw new ReportZipError('ZIP64 packages are not supported.');
  if (count > ZIP_LIMITS.entries) throw new ReportZipError(`This ZIP has too many files (over ${ZIP_LIMITS.entries}).`);
  const out: Entry[] = [];
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || v.getUint32(at, true) !== 0x02014b50) throw new ReportZipError('This ZIP has a damaged directory.');
    const nameLength = v.getUint16(at + 28, true);
    const skip = nameLength + v.getUint16(at + 30, true) + v.getUint16(at + 32, true);
    out.push({
      name: strFromU8(bytes.subarray(at + 46, at + 46 + nameLength)),
      method: v.getUint16(at + 10, true),
      compressed: v.getUint32(at + 20, true),
      size: v.getUint32(at + 24, true),
      local: v.getUint32(at + 42, true),
    });
    at += 46 + skip;
  }
  return out;
}

/** An entry's data, inflated in chunks and stopped as soon as it passes its stated size. */
function inflateEntry(bytes: Uint8Array, e: Entry): Uint8Array<ArrayBuffer> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (e.local + 30 > bytes.length || v.getUint32(e.local, true) !== 0x04034b50) throw new ReportZipError(`This ZIP has a damaged entry: ${short(e.name)}`);
  const start = e.local + 30 + v.getUint16(e.local + 26, true) + v.getUint16(e.local + 28, true);
  const data = bytes.subarray(start, start + e.compressed);
  if (data.length !== e.compressed) throw new ReportZipError(`This ZIP is cut short at ${short(e.name)}.`);
  const out = new Uint8Array(e.size);
  const misstated = () => new ReportZipError(`This ZIP misstates the size of ${short(e.name)}.`);
  if (e.method === 0) {
    if (data.length !== e.size) throw misstated();
    out.set(data);
    return out;
  }
  if (e.method !== 8) throw new ReportZipError(`This ZIP uses an unsupported compression for ${short(e.name)}.`);
  let written = 0;
  const inflate = new Inflate((chunk) => {
    if (written + chunk.length > e.size) throw misstated();
    out.set(chunk, written);
    written += chunk.length;
  });
  const STEP = 64 * 1024;
  try {
    for (let i = 0; i < data.length; i += STEP) inflate.push(data.subarray(i, i + STEP), i + STEP >= data.length);
    if (data.length === 0) inflate.push(data, true);
  } catch (err) {
    if (err instanceof ReportZipError) throw err;
    throw new ReportZipError(`This ZIP has a damaged entry: ${short(e.name)}`);
  }
  if (written !== e.size) throw misstated();
  return out;
}

/** The package's own files, after every limit is checked; anything outside the layout is skipped. */
function readEntries(bytes: Uint8Array): Record<string, Uint8Array<ArrayBuffer>> {
  const entries = centralDirectory(bytes);
  let expanded = 0;
  const wanted: Entry[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (e.name.startsWith('/') || e.name.split('/').includes('..')) throw new ReportZipError(`This ZIP has an unsafe path: ${short(e.name)}`);
    expanded += e.size;
    if (expanded > ZIP_LIMITS.expanded || expanded > Math.max(bytes.length, 1024 * 1024) * ZIP_LIMITS.ratio)
      throw new ReportZipError('This ZIP would expand to more than is safe to open here.');
    if (!e.name.startsWith(ROOT)) continue;
    const rel = e.name.slice(ROOT.length);
    if (rel !== 'report.json' && rel !== 'index.json' && !SCREENSHOT.test(rel)) continue;
    // Unzip tools disagree on which of two same-named entries wins, so neither is trusted.
    if (seen.has(e.name)) throw new ReportZipError(`This ZIP has ${short(e.name)} twice.`);
    seen.add(e.name);
    wanted.push(e);
  }
  const files: Record<string, Uint8Array<ArrayBuffer>> = {};
  for (const e of wanted) files[e.name] = inflateEntry(bytes, e);
  return files;
}

/** Reads a package written by reportZip, refusing anything too large, malformed or unsafe. */
export function readReportZip(bytes: Uint8Array): OpenedReportZip {
  if (bytes.length > ZIP_LIMITS.bytes) throw new ReportZipError(`This ZIP is over ${ZIP_LIMITS.bytes / 1024 / 1024} MB.`);
  const files = readEntries(bytes);

  const json = files[`${ROOT}report.json`];
  if (!json) throw new ReportZipError('This ZIP has no foldable-report/report.json.');
  let report: Report;
  try {
    report = parseReport(JSON.parse(strFromU8(json)));
  } catch (e) {
    throw new ReportZipError(`foldable-report/report.json is not a foldable check report: ${e instanceof Error ? e.message : String(e)}`);
  }

  const notes: string[] = [];
  const images = new Map<string, Uint8Array<ArrayBuffer>>();
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
