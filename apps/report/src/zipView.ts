// Opens a report JSON or a report package (ZIP) in the browser only, and packs the current report
// with its screenshots for download. Nothing is uploaded or stored.
import { parseReport, type Report } from '@dobra/core/report';
import { readReportZip, reportZip } from '@dobra/core/reportZip';

export interface OpenedReport {
  report: Report;
  /** Frame ref to an image URL; object URLs for a ZIP's screenshots. */
  thumbnails: Record<string, string>;
  /** Why a frame has no screenshot, as the package said. */
  missing: Record<string, string>;
  notes: string[];
  /** Releases the object URLs made for this report. */
  revoke(): void;
}

interface Urls {
  create(blob: Blob): string;
  revoke(url: string): void;
}
const browserUrls: Urls = { create: (b) => URL.createObjectURL(b), revoke: (u) => URL.revokeObjectURL(u) };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const isPng = (b: Uint8Array) => PNG_SIGNATURE.every((x, i) => b[i] === x);

async function isZip(file: File): Promise<boolean> {
  if (/\.zip$/i.test(file.name)) return true;
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  return head[0] === 0x50 && head[1] === 0x4b;
}

export async function openReportFile(file: File, urls: Urls = browserUrls): Promise<OpenedReport> {
  if (!(await isZip(file))) return { report: parseReport(JSON.parse(await file.text())), thumbnails: {}, missing: {}, notes: [], revoke: () => {} };
  const opened = readReportZip(new Uint8Array(await file.arrayBuffer()));
  const thumbnails: Record<string, string> = {};
  for (const [ref, bytes] of opened.images) thumbnails[ref] = urls.create(new Blob([bytes], { type: 'image/png' }));
  return {
    report: opened.report,
    thumbnails,
    missing: opened.missing,
    notes: opened.notes,
    revoke: () => Object.values(thumbnails).forEach((u) => urls.revoke(u)),
  };
}

/**
 * Holds the release function of the report on screen. Every path that shows a report (a file, a
 * Figma check, a website check) replaces it, so the previous report's object URLs are always freed.
 */
export function createReportSlot() {
  let release: () => void = () => {};
  return {
    replace(next: () => void = () => {}) {
      release();
      release = next;
    },
    release() {
      release();
      release = () => {};
    },
  };
}

/** Frames of the report that have an image to include. */
export function screenshotCount(report: Report, thumbnails: Record<string, string | null>): number {
  return report.frames.filter((f) => thumbnails[f.ref]).length;
}

/**
 * The report as a package. Each thumbnail (a Figma image URL, or an opened ZIP's object URL) is
 * fetched when this runs, since Figma's URLs expire; one that fails is listed as missing.
 */
export async function packageForDownload(
  report: Report,
  thumbnails: Record<string, string | null>,
  fetch: typeof globalThis.fetch = globalThis.fetch,
  /** Reasons an opened package already gave, kept in the new one. */
  known: Record<string, string> = {},
): Promise<{ zip: Uint8Array<ArrayBuffer>; failed: string[] }> {
  const images = new Map<string, Uint8Array>();
  const missing: Record<string, string> = { ...known };
  const failed: string[] = [];
  await Promise.all(
    report.frames.map(async (f) => {
      const url = thumbnails[f.ref];
      if (!url) return;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (!isPng(bytes)) throw new Error('not a PNG');
        images.set(f.ref, bytes);
      } catch (e) {
        missing[f.ref] = `The image could not be fetched: ${e instanceof Error ? e.message : String(e)}`;
        failed.push(f.name);
      }
    }),
  );
  return { zip: reportZip(report, images, missing), failed };
}
