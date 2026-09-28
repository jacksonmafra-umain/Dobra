import { describe, expect, it, vi } from 'vitest';
import type { FigmaClient } from '@dobra/core/figmaClient';
import { FigmaError } from '@dobra/core/figmaClient';
import type { RestNode } from '@dobra/core/figmaRest';
import { listFrames, loadFrames } from './loader';

const box = (w: number, h: number) => ({ x: 0, y: 0, width: w, height: h });
const frame = (id: string, name: string, w: number, h: number, children: RestNode[] = []): RestNode => ({ id, name, type: 'FRAME', absoluteBoundingBox: box(w, h), children }) as RestNode;
const doc: RestNode = {
  id: '0:0', name: 'Doc', type: 'DOCUMENT',
  children: [
    { id: '0:1', name: 'Screens', type: 'CANVAS', children: [frame('1:1', 'Home', 402, 874), { id: '9:1', name: 'Section', type: 'SECTION', children: [] } as RestNode] } as RestNode,
    { id: '0:2', name: 'Cover', type: 'CANVAS', children: [frame('2:1', 'Cover', 1600, 1200)] } as RestNode,
  ],
} as RestNode;

function fake(over: Partial<FigmaClient> = {}): FigmaClient {
  return {
    me: async () => ({ handle: 'me' }),
    file: async () => ({ name: 'App', version: '7', document: doc }),
    nodes: async (_k, ids) => ({
      loaded: Object.fromEntries(ids.filter((i) => i !== 'gone').map((i) => [i, i === '9:1' ? ({ id: '9:1', name: 'Section', type: 'SECTION', children: [frame('3:1', 'Checkout', 851, 883)] } as RestNode) : frame(i, 'F', 402, 874, [{ id: `${i}:t`, name: 'Title', type: 'TEXT', characters: 'Review your order', absoluteBoundingBox: box(300, 40) } as RestNode])])),
      failed: ids.includes('gone') ? [{ id: 'gone', reason: 'Figma returned no data for this frame.' }] : [],
    }),
    images: async (_k, ids) => Object.fromEntries(ids.map((i) => [i, `https://img/${i}`])),
    ...over,
  };
}

describe('listFrames', () => {
  it('lists frames by page, opening Sections, with the device each one matches', async () => {
    const r = await listFrames(fake(), 'https://www.figma.com/design/KEY/app?node-id=1-1');
    expect(r.fileKey).toBe('KEY');
    expect(r.fileName).toBe('App');
    expect(r.pages.map((p) => [p.name, p.frames.map((f) => f.id)])).toEqual([['Screens', ['1:1', '3:1']], ['Cover', ['2:1']]]);
    expect(r.pages[0].frames[1].match).toMatch(/pixel-9-pro-fold/);
  });
  it('refuses a link that is not a Figma file', async () => {
    await expect(listFrames(fake(), 'https://example.com')).rejects.toThrow(/figma\.com/);
  });
});

describe('loadFrames', () => {
  it('loads each frame\'s layers and image at the given scale', async () => {
    const images = vi.fn(async (_k: string, ids: string[], scale?: number) => Object.fromEntries(ids.map((i) => [i, `https://img/${i}@${scale}`])));
    const r = await loadFrames(fake({ images }), 'KEY', ['1:1'], 2.5);
    expect(images).toHaveBeenCalledWith('KEY', ['1:1'], 2.5);
    expect(r.get('1:1')).toMatchObject({ image: 'https://img/1:1@2.5' });
    expect(r.get('1:1')!.geo!.length).toBeGreaterThan(0);
  });
  it('says why a frame is gone, and keeps the layers when only the image fails', async () => {
    const r = await loadFrames(fake({ images: async () => { throw new FigmaError('Figma returned 500.', 500); } }), 'KEY', ['1:1', 'gone'], 1);
    expect(r.get('gone')).toMatchObject({ geo: null, image: null, reason: expect.stringMatching(/no data/) });
    expect(r.get('1:1')!.geo).not.toBeNull();
    expect(r.get('1:1')!.image).toBeNull();
  });
  it('retries once after a rate limit', async () => {
    let calls = 0;
    const nodes = async (k: string, ids: string[]) => {
      if (calls++ === 0) throw new FigmaError('Rate limited by Figma: retry in 0 s.', 429, 0);
      return fake().nodes(k, ids);
    };
    const r = await loadFrames(fake({ nodes }), 'KEY', ['1:1'], 1);
    expect(calls).toBe(2);
    expect(r.get('1:1')!.geo).not.toBeNull();
  });
});
