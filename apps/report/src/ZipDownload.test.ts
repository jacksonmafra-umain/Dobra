import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { sampleReport } from './fixtures/sampleReport';
import { ZipDownload } from './ZipDownload';

const report = sampleReport();
const html = (thumbnails: Record<string, string | null>) => renderToStaticMarkup(createElement(ZipDownload, { report, thumbnails, slug: 'x' }));

describe('ZipDownload', () => {
  it('counts the screenshots it will include', () => {
    const out = html({ [report.frames[0].ref]: 'blob:x' });
    expect(out).toContain('Download ZIP (1 screenshot)');
    expect(out).toContain('report-zip__download');
    expect(out).not.toContain('disabled');
  });
  it('is disabled with a reason when there are none', () => {
    const out = html({});
    expect(out).toContain('disabled');
    expect(out).toContain('No screenshots to include');
  });
});
