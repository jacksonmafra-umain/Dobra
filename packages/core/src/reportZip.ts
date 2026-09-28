// A report package: the report JSON, its Markdown and a screenshot per frame, in one ZIP that
// Foldable Check opens in the browser. The Report format itself is unchanged; index.json maps each
// frame to its screenshot, or to the reason it has none.
import { strToU8, zipSync, type Zippable } from 'fflate';
import { toMarkdown, type Report, type ReportFrame } from './report';

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
