import { describe, expect, it } from 'vitest';
import { reportZip, screenFile } from '@dobra/core/reportZip';
import { toMarkdown } from '@dobra/core/report';
import { sampleReport } from './fixtures/sampleReport';
import { createReportSlot, openReportFile } from './zipView';

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
    expect(opened.markdown).toBeNull();
    expect(opened.images).toEqual({});
  });
  it('opens a report ZIP and gives each screenshot an object URL, revoked on demand', async () => {
    const made: string[] = [];
    const revoked: string[] = [];
    const urls = { create: (b: Blob) => { const u = `blob:test/${made.length}`; made.push(u); expect(b.type).toBe('image/png'); return u; }, revoke: (u: string) => void revoked.push(u) };
    const zip = reportZip(report, new Map([[ref, png()]]));
    const opened = await openReportFile(new File([zip], 'r.zip', { type: 'application/zip' }), urls);
    expect(opened.report).toEqual(report);
    expect(opened.thumbnails).toEqual({ [ref]: 'blob:test/0' });
    // The Markdown links screenshots by their path in the package; the same object URL serves both.
    const path = screenFile(0, report.frames[0]);
    expect(opened.markdown).toBe(toMarkdown(report, { images: { [ref]: path } }));
    expect(opened.images).toEqual({ [path]: 'blob:test/0' });
    opened.revoke();
    expect(revoked).toEqual(['blob:test/0']);
  });
  it('explains a ZIP it refuses', async () => {
    await expect(openReportFile(new File([new Uint8Array([0x50, 0x4b, 3, 4, 1, 2])], 'bad.zip'))).rejects.toThrow(/ZIP/);
  });
});

describe('createReportSlot', () => {
  it('releases the previous report\'s images whenever another report takes its place', () => {
    const released: string[] = [];
    const slot = createReportSlot();
    slot.replace(() => released.push('zip'));
    slot.replace(); // a Figma or website check
    expect(released).toEqual(['zip']);
    slot.replace(() => released.push('second'));
    slot.release();
    expect(released).toEqual(['zip', 'second']);
  });
});
