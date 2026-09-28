// Opens a report JSON or a report package (ZIP) in the browser only. Nothing is uploaded or stored.
import { parseReport, type Report } from '@dobra/core/report';
import { readReportZip } from '@dobra/core/reportZip';

export interface OpenedReport {
  report: Report;
  /** Frame ref to an image URL; object URLs for a ZIP's screenshots. */
  thumbnails: Record<string, string>;
  /** Why a frame has no screenshot, as the package said. */
  missing: Record<string, string>;
  notes: string[];
  /** The package's Markdown, or null for a report JSON. Untrusted: show it with MarkdownView. */
  markdown: string | null;
  /** Screenshot path inside the package to its object URL, for the Markdown's images. */
  images: Record<string, string>;
  /** Releases the object URLs made for this report. */
  revoke(): void;
}

interface Urls {
  create(blob: Blob): string;
  revoke(url: string): void;
}
const browserUrls: Urls = { create: (b) => URL.createObjectURL(b), revoke: (u) => URL.revokeObjectURL(u) };


async function isZip(file: File): Promise<boolean> {
  if (/\.zip$/i.test(file.name)) return true;
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  return head[0] === 0x50 && head[1] === 0x4b;
}

export async function openReportFile(file: File, urls: Urls = browserUrls): Promise<OpenedReport> {
  if (!(await isZip(file))) return { report: parseReport(JSON.parse(await file.text())), thumbnails: {}, missing: {}, notes: [], markdown: null, images: {}, revoke: () => {} };
  const opened = readReportZip(new Uint8Array(await file.arrayBuffer()));
  const thumbnails: Record<string, string> = {};
  for (const [ref, bytes] of opened.images) thumbnails[ref] = urls.create(new Blob([bytes], { type: 'image/png' }));
  const images = Object.fromEntries(Object.entries(opened.paths).map(([ref, path]) => [path, thumbnails[ref]]));
  return {
    report: opened.report,
    thumbnails,
    missing: opened.missing,
    notes: opened.notes,
    markdown: opened.markdown,
    images,
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
