import { describe, expect, it } from 'vitest';
import { frameCandidates, parseFileKey, restToGeo, tagOf, type RestNode } from './figmaRest';

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

const doc: RestNode = {
  id: '0:0', name: 'Document', type: 'DOCUMENT',
  children: [
    {
      id: '0:1', name: 'Screens', type: 'CANVAS',
      children: [
        { id: '1:1', name: 'Home', type: 'FRAME', absoluteBoundingBox: box(0, 0, 1100, 756), sharedPluginData: { hinge: { target: 'surface-duo-2/spanned/spanned/landscape' } } },
        { id: '1:2', name: 'Group', type: 'SECTION', children: [{ id: '1:3', name: 'Cover', type: 'FRAME', absoluteBoundingBox: box(2000, 0, 352, 339) }] },
        { id: '1:4', name: 'A rectangle', type: 'RECTANGLE', absoluteBoundingBox: box(0, 0, 10, 10) },
      ],
    },
  ],
};

describe('Figma REST adapter', () => {
  it('reads the file key from design and file URLs', () => {
    expect(parseFileKey('https://www.figma.com/design/AbC123xyz/My-file?node-id=1-2')).toBe('AbC123xyz');
    expect(parseFileKey('https://figma.com/file/AbC123xyz/My-file')).toBe('AbC123xyz');
    expect(parseFileKey('https://example.com/nothing')).toBeNull();
  });

  it('finds top-level frames and frames inside sections, with their page and tag', () => {
    expect(frameCandidates(doc)).toEqual([
      { id: '1:1', name: 'Home', page: 'Screens', width: 1100, height: 756, tag: 'surface-duo-2/spanned/spanned/landscape' },
      { id: '1:3', name: 'Cover', page: 'Screens', width: 352, height: 339, tag: '' },
    ]);
    expect(tagOf(doc.children![0].children![1])).toBe('');
  });

  it('maps a frame subtree to frame-relative geometry with roles, skipping hidden layers and the overlay', () => {
    const frame: RestNode = {
      id: '1:1', name: 'Home', type: 'FRAME', absoluteBoundingBox: box(100, 50, 1100, 756),
      children: [
        { id: '2:1', name: 'Title', type: 'TEXT', characters: 'Welcome back', style: { fontSize: 24 }, absoluteBoundingBox: box(116, 90, 300, 30) },
        { id: '2:2', name: 'Buy button', type: 'FRAME', absoluteBoundingBox: box(630, 350, 80, 48) },
        { id: '2:3', name: 'Hidden', type: 'FRAME', visible: false, absoluteBoundingBox: box(0, 0, 1, 1) },
        { id: '2:4', name: '⎔ hinge-overlay', type: 'FRAME', absoluteBoundingBox: box(100, 50, 1100, 756) },
        { id: '2:5', name: 'Hero', type: 'FRAME', clipsContent: true, overflowDirection: 'HORIZONTAL_SCROLLING', layoutMode: 'HORIZONTAL', absoluteBoundingBox: box(100, 200, 1100, 200) },
      ],
    };
    expect(restToGeo(frame)).toEqual([
      { id: '2:1', name: 'Title', role: 'text', rect: { x: 16, y: 40, width: 300, height: 30 }, chars: 12, fontSize: 24, scrollAxis: 'none', layout: 'none' },
      { id: '2:2', name: 'Buy button', role: 'interactive', rect: { x: 530, y: 300, width: 80, height: 48 }, scrollAxis: 'none', layout: 'none' },
      { id: '2:5', name: 'Hero', role: 'container', rect: { x: 0, y: 150, width: 1100, height: 200 }, scrollAxis: 'x', layout: 'horizontal', clips: true },
    ]);
  });
});
