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
