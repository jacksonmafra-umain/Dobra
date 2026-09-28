// "Download ZIP": the report, its Markdown and every screenshot this view has, as one package.
import { useState } from 'react';
import type { Report } from '@dobra/core/report';
import { download } from './download';
import { packageForDownload, screenshotCount } from './zipView';

export function ZipDownload({ report, thumbnails, slug }: { report: Report; thumbnails: Record<string, string | null>; slug: string }) {
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
          download(`${slug}.foldable.zip`, await packageForDownload(report, thumbnails), 'application/zip');
        } finally {
          setBusy(false);
        }
      }}
    >
      {n === 0 ? 'Download ZIP (no screenshots)' : busy ? 'Packing…' : `Download ZIP (${n} screenshot${n === 1 ? '' : 's'})`}
    </button>
  );
}
