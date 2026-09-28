// A realistic report for component tests and screenshots: one frame per confidence, an error
// finding on the Surface Duo 2 hinge, an unloaded frame and a note. Test support only.
import { loadCatalog } from '@dobra/core/catalog/load';
import type { GeoNode } from '@dobra/core/geo';
import { buildReport, type Report } from '@dobra/core/report';

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

// A call-to-action button centred on the Duo's 26 dp hinge at x = 537.
const duo: GeoNode[] = [
  { id: 'n1', name: 'Order now', role: 'interactive', rect: box(470, 600, 160, 48), children: [{ id: 'n2', name: 'Label', role: 'text', rect: box(490, 612, 120, 24), fontSize: 16, chars: 9 }] },
];
const cover: GeoNode[] = [{ id: 'c1', name: 'Title', role: 'text', rect: box(16, 16, 200, 24), fontSize: 16, chars: 12 }];

export function sampleReport(): Report {
  const report = buildReport(
    loadCatalog(),
    { kind: 'figma', ref: 'KEY1', name: 'Checkout flows', fileVersion: '42' },
    [
      { ref: '1:1', name: 'Checkout · Duo', page: 'Screens', width: 1100, height: 756, tag: 'surface-duo-2/spanned/spanned/landscape', root: duo },
      { ref: '1:2', name: 'Cover', page: 'Screens', width: 352, height: 339, tag: '', root: cover },
      { ref: '1:3', name: 'Scratch', page: 'Screens', width: 777, height: 555, tag: '', root: [] },
      { ref: '1:4', name: 'Archive', page: 'Old', width: 390, height: 844, tag: '', root: null, reason: 'Rate limited by Figma: retry in 12 s.' },
    ],
    new Date('2026-09-28T10:00:00Z'),
  );
  return { ...report, notes: ['Frame thumbnails come from the Figma images API and may lag the file by a minute.'] };
}
