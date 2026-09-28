// "Download ZIP": the report, its Markdown and every screenshot this view has, as one package.
import { useState } from 'react';
import type { Report } from '@dobra/core/report';
import { download } from './download';
import { packageForDownload, screenshotCount } from './zipView';

export interface ZipDownloadProps {
  report: Report;
  thumbnails: Record<string, string | null>;
  /** Reasons an opened package gave for frames without a screenshot. */
  missing?: Record<string, string>;
  slug: string;
  /** Called with a sentence when some images couldn't be included, or the download failed. */
  onMessage?(message: string): void;
}

export function ZipDownload({ report, thumbnails, missing = {}, slug, onMessage }: ZipDownloadProps) {
  const [busy, setBusy] = useState(false);
  const n = screenshotCount(report, thumbnails);
  return (
    <button
      className="report-zip__download"
      disabled={busy || n === 0}
      title={n === 0 ? 'No screenshots to include' : undefined}
      onClick={async () => {
        setBusy(true);
        try {
          const { zip, failed } = await packageForDownload(report, thumbnails, undefined, missing);
          download(`${slug}.foldable.zip`, zip, 'application/zip');
          if (failed.length) onMessage?.(`The ZIP was saved without ${failed.length} screenshot${failed.length === 1 ? '' : 's'} that could not be fetched: ${failed.join(', ')}.`);
        } catch (e) {
          onMessage?.(`The ZIP could not be made: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
          setBusy(false);
        }
      }}
    >
      {n === 0 ? 'Download ZIP (no screenshots)' : busy ? 'Packing…' : `Download ZIP (${n} screenshot${n === 1 ? '' : 's'})`}
    </button>
  );
}
