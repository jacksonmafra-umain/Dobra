import { describe, expect, it } from 'vitest';
import { readReportZip, reportZip } from '@dobra/core/reportZip';
import { sampleReport } from './fixtures/sampleReport';
import { openReportFile, packageForDownload, screenshotCount } from './zipView';

const report = sampleReport();
const ref = report.frames[0].ref;
function png(): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, 10);
  new DataView(b.buffer).setUint32(20, 10);
  return b;
}

describe('openReportFile', () => {
  it('opens a report JSON as before', async () => {
    const opened = await openReportFile(new File([JSON.stringify(report)], 'r.json', { type: 'application/json' }));
    expect(opened.report).toEqual(report);
    expect(opened.thumbnails).toEqual({});
  });
  it('opens a report ZIP and gives each screenshot an object URL, revoked on demand', async () => {
    const made: string[] = [];
    const revoked: string[] = [];
    const urls = { create: (b: Blob) => { const u = `blob:test/${made.length}`; made.push(u); expect(b.type).toBe('image/png'); return u; }, revoke: (u: string) => void revoked.push(u) };
    const zip = reportZip(report, new Map([[ref, png()]]));
    const opened = await openReportFile(new File([zip], 'r.zip', { type: 'application/zip' }), urls);
    expect(opened.report).toEqual(report);
    expect(opened.thumbnails).toEqual({ [ref]: 'blob:test/0' });
    opened.revoke();
    expect(revoked).toEqual(['blob:test/0']);
  });
  it('explains a ZIP it refuses', async () => {
    await expect(openReportFile(new File([new Uint8Array([0x50, 0x4b, 3, 4, 1, 2])], 'bad.zip'))).rejects.toThrow(/ZIP/);
  });
});

describe('packageForDownload', () => {
  it('fetches each thumbnail and packs the report with them', async () => {
    const fetch = (async () => new Response(png(), { headers: { 'content-type': 'image/png' } })) as unknown as typeof globalThis.fetch;
    const zip = await packageForDownload(report, { [ref]: 'https://figma-alpha-api.s3/x.png' }, fetch);
    const opened = readReportZip(zip);
    expect(opened.images.get(ref)).toEqual(png());
  });
  it('lists a thumbnail it could not fetch as missing, with the reason', async () => {
    const fetch = (async () => new Response('gone', { status: 403 })) as unknown as typeof globalThis.fetch;
    const zip = await packageForDownload(report, { [ref]: 'https://expired' }, fetch);
    const opened = readReportZip(zip);
    expect(opened.images.size).toBe(0);
    expect(opened.missing[ref]).toMatch(/403/);
  });
});

describe('screenshotCount', () => {
  it('counts frames that have a thumbnail', () => {
    expect(screenshotCount(report, { [ref]: 'x', nope: 'y' })).toBe(1);
    expect(screenshotCount(report, {})).toBe(0);
  });
});
