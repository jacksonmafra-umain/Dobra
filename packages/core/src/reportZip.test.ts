import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { loadCatalog } from './catalog/load';
import { buildReport } from './report';
import { reportZip, screenFile } from './reportZip';

const catalog = loadCatalog();
const button = { id: '2:2', name: 'Buy', role: 'interactive' as const, rect: { x: 530, y: 300, width: 80, height: 48 } };
const report = buildReport(catalog, { kind: 'web', ref: 'https://x.test/', name: 'https://x.test/' }, [
  { ref: 'https://x.test/#surface-duo-2/spanned/spanned/landscape', name: 'surface-duo-2/spanned/spanned/landscape', page: 'https://x.test/', width: 1100, height: 756, tag: 'surface-duo-2/spanned/spanned/landscape', root: [button] },
  { ref: '1:3', name: 'Résumé — écran', page: 'p', width: 399, height: 801, tag: '', root: [] },
], new Date('2026-09-28T00:00:00Z'));
// The smallest valid PNG header is enough for the writer, which copies bytes as they are.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe('screenFile', () => {
  it('numbers frames and names them after their first target, safely', () => {
    expect(screenFile(0, report.frames[0])).toBe('screenshots/001-surface-duo-2__spanned__spanned__landscape.png');
  });
  it('falls back to a cleaned-up frame name', () => {
    expect(screenFile(1, report.frames[1])).toBe('screenshots/002-resume-ecran.png');
  });
  it('keeps names short', () => {
    expect(screenFile(2, { ...report.frames[1], name: 'x'.repeat(300) }).length).toBeLessThanOrEqual('screenshots/003-.png'.length + 80);
  });
});

describe('reportZip', () => {
  const images = new Map([[report.frames[0].ref, PNG]]);
  const files = unzipSync(reportZip(report, images, { '1:3': 'The page did not load.' }));

  it('writes the report, the Markdown, the index and the screenshots in one folder', () => {
    expect(Object.keys(files).sort()).toEqual([
      'foldable-report/index.json',
      'foldable-report/report.json',
      'foldable-report/report.md',
      'foldable-report/screenshots/001-surface-duo-2__spanned__spanned__landscape.png',
    ]);
    expect(JSON.parse(strFromU8(files['foldable-report/report.json']))).toEqual(report);
    expect(files['foldable-report/screenshots/001-surface-duo-2__spanned__spanned__landscape.png']).toEqual(PNG);
  });

  it('lists every frame once, with its image or the reason it has none', () => {
    const index = JSON.parse(strFromU8(files['foldable-report/index.json']));
    expect(index).toEqual({
      version: 1,
      screenshots: { [report.frames[0].ref]: 'screenshots/001-surface-duo-2__spanned__spanned__landscape.png' },
      missing: { '1:3': 'The page did not load.' },
    });
  });

  it('links each screenshot from the Markdown with a path that exists in the ZIP', () => {
    const md = strFromU8(files['foldable-report/report.md']);
    const links = [...md.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
    expect(links).toEqual(['screenshots/001-surface-duo-2__spanned__spanned__landscape.png']);
    for (const l of links) expect(files[`foldable-report/${l}`]).toBeDefined();
  });

  it('marks a frame with no image and no reason as having no screenshot', () => {
    const index = JSON.parse(strFromU8(unzipSync(reportZip(report, new Map()))['foldable-report/index.json']));
    expect(index.missing).toEqual({ [report.frames[0].ref]: 'no screenshot', '1:3': 'no screenshot' });
  });
});

import { strToU8, zipSync } from 'fflate';
import { readReportZip, ReportZipError } from './reportZip';

/** A real PNG header with the given size: signature, IHDR length, "IHDR", width, height. */
function png(width: number, height: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

/** Rewrites every stated uncompressed size in a ZIP, as a hostile file would. */
function lieAboutSizes(zip: Uint8Array, size: number): Uint8Array {
  const out = zip.slice();
  const v = new DataView(out.buffer);
  for (let i = 0; i < out.length - 4; i++) {
    const sig = v.getUint32(i, true);
    if (sig === 0x04034b50) v.setUint32(i + 22, size, true); // local header
    if (sig === 0x02014b50) v.setUint32(i + 24, size, true); // central directory
  }
  return out;
}

describe('readReportZip', () => {
  const images = new Map([[report.frames[0].ref, png(1100, 756)]]);
  const good = reportZip(report, images, { '1:3': 'The page did not load.' });

  it('reads back what reportZip wrote', () => {
    const r = readReportZip(good);
    expect(r.report).toEqual(report);
    expect([...r.images.keys()]).toEqual([report.frames[0].ref]);
    expect(r.images.get(report.frames[0].ref)).toEqual(png(1100, 756));
    expect(r.missing).toEqual({ '1:3': 'The page did not load.' });
    expect(r.notes).toEqual([]);
  });

  const zipOf = (files: Record<string, Uint8Array>) => zipSync(files);
  const base = () => unzipSync(good);

  it('refuses a ZIP that is too large before reading it', () => {
    expect(() => readReportZip(new Uint8Array(201 * 1024 * 1024))).toThrow(ReportZipError);
  });
  it('refuses too many entries', () => {
    const files = base();
    for (let i = 0; i < 2001; i++) files[`foldable-report/extra/${i}.txt`] = strToU8('x');
    expect(() => readReportZip(zipOf(files))).toThrow(/too many/i);
  });
  it('refuses a ZIP whose contents expand past the limit', () => {
    const files = base();
    files['foldable-report/screenshots/999-big.png'] = new Uint8Array(60 * 1024 * 1024);
    expect(() => readReportZip(zipSync(files, { level: 9 }))).toThrow(/expand/i);
  });
  it('refuses a ZIP that under-reports its sizes', () => {
    const files = base();
    files['foldable-report/screenshots/999-big.png'] = new Uint8Array(4 * 1024 * 1024);
    expect(() => readReportZip(lieAboutSizes(zipSync(files, { level: 9 }), 10))).toThrow(ReportZipError);
  });
  it('refuses a path that climbs out of the folder', () => {
    const files = base();
    files['foldable-report/../evil.txt'] = strToU8('x');
    expect(() => readReportZip(zipOf(files))).toThrow(/path/i);
  });
  it('refuses a ZIP without a valid report', () => {
    const files = base();
    delete files['foldable-report/report.json'];
    expect(() => readReportZip(zipOf(files))).toThrow(/report\.json/);
    files['foldable-report/report.json'] = strToU8('{"version":1}');
    expect(() => readReportZip(zipOf(files))).toThrow(ReportZipError);
  });
  it('drops an image that is not a PNG or is too large, with a note', () => {
    const files = base();
    files['foldable-report/screenshots/001-surface-duo-2__spanned__spanned__landscape.png'] = strToU8('<svg/>');
    let r = readReportZip(zipOf(files));
    expect(r.images.size).toBe(0);
    expect(r.notes.join(' ')).toMatch(/not a PNG/);
    files['foldable-report/screenshots/001-surface-duo-2__spanned__spanned__landscape.png'] = png(20_000, 100);
    r = readReportZip(zipOf(files));
    expect(r.images.size).toBe(0);
    expect(r.notes.join(' ')).toMatch(/too large/);
  });
  it('ignores files outside the package layout, such as a second report', () => {
    const files = base();
    files['other/report.json'] = strToU8('{}');
    files['foldable-report/readme.txt'] = strToU8('hi');
    expect(readReportZip(zipOf(files)).report).toEqual(report);
  });
});
