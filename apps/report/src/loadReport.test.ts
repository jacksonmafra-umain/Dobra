import { describe, expect, it } from 'vitest';
import type { RestNode } from '@dobra/core/figmaRest';
import type { FigmaClient } from '@dobra/core/figmaClient';
import { FigmaError } from '@dobra/core/figmaClient';
import { loadFigmaReport } from './loadReport';

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const home: RestNode = { id: '1:1', name: 'Home', type: 'FRAME', absoluteBoundingBox: box(0, 0, 1100, 756), sharedPluginData: { dobra: { target: 'surface-duo-2/spanned/spanned/landscape' } }, children: [] };
const cover: RestNode = { id: '1:3', name: 'Cover', type: 'FRAME', absoluteBoundingBox: box(2000, 0, 352, 339), children: [] };
const section: RestNode = { id: '1:2', name: 'Flows', type: 'SECTION', children: [cover] };
// depth=2 returns a page's direct children only: the section comes back without its frames.
const document: RestNode = { id: '0:0', name: 'Document', type: 'DOCUMENT', children: [{ id: '0:1', name: 'Screens', type: 'CANVAS', children: [home, { ...section, children: undefined }] }] };

function fakeClient(version: string, failCover = false, failImages = false) {
  const calls = { file: 0, nodes: 0, images: 0 };
  const client: FigmaClient = {
    me: async () => {
      throw new Error('me() needs current_user:read and must not be called');
    },
    file: async () => (calls.file++, { name: 'My file', version, document }),
    nodes: async (_key, ids) => {
      calls.nodes++;
      if (ids.includes('1:2')) return { loaded: { '1:2': section }, failed: [] };
      const loaded: Record<string, RestNode> = failCover ? { '1:1': home } : { '1:1': home, '1:3': cover };
      return { loaded, failed: failCover ? [{ id: '1:3', reason: new FigmaError('Rate limited by Figma: retry in 12 s.', 429, 12).message }] : [] };
    },
    images: async () => {
      calls.images++;
      if (failImages) throw new FigmaError('Rate limited by Figma: retry in 5 s.', 429, 5);
      return { '1:1': 'https://img/1', '1:3': 'https://img/3' };
    },
  };
  return { client, calls };
}

describe('loadFigmaReport', () => {
  it('builds a report with tagged frames and thumbnails', async () => {
    const { client } = fakeClient('v1');
    const { report, thumbnails } = await loadFigmaReport(client, 'https://www.figma.com/design/KEY1/x');
    expect(report.frames.find((f) => f.ref === '1:1')).toMatchObject({ confidence: 'tag' });
    expect(thumbnails['1:1']).toBe('https://img/1');
  });

  it('serves nodes and images from the cache while the file version is unchanged', async () => {
    const { client, calls } = fakeClient('v7');
    await loadFigmaReport(client, 'https://www.figma.com/design/KEY2/x');
    await loadFigmaReport(client, 'https://www.figma.com/design/KEY2/x');
    expect(calls).toEqual({ file: 2, nodes: 2, images: 1 });
  });

  it('keeps going when some frames could not be loaded', async () => {
    const { client } = fakeClient('v1', true);
    const { report } = await loadFigmaReport(client, 'https://www.figma.com/design/KEY3/x');
    expect(report.unloaded).toEqual([{ ref: '1:3', name: 'Cover', reason: 'Rate limited by Figma: retry in 12 s.' }]);
  });

  it('asks for a Figma link when the URL has no file key', async () => {
    await expect(loadFigmaReport(fakeClient('v1').client, 'https://example.com')).rejects.toThrow('Paste a figma.com file or design link.');
  });

  it('finds frames inside sections, which the file call does not return', async () => {
    const { client } = fakeClient('v1');
    const { report } = await loadFigmaReport(client, 'https://www.figma.com/design/KEY4/x');
    expect(report.frames.map((f) => f.ref).sort()).toEqual(['1:1', '1:3']);
  });

  it('does not cache a partial report, so a retry can load the rest', async () => {
    const { client, calls } = fakeClient('v1', true);
    await loadFigmaReport(client, 'https://www.figma.com/design/KEY5/x');
    await loadFigmaReport(client, 'https://www.figma.com/design/KEY5/x');
    expect(calls.images).toBe(2);
  });

  it('keeps the report when thumbnails cannot be loaded', async () => {
    const { client } = fakeClient('v1', false, true);
    const { report, thumbnails, notice } = await loadFigmaReport(client, 'https://www.figma.com/design/KEY6/x');
    expect(report.frames).toHaveLength(2);
    expect(thumbnails).toEqual({});
    expect(notice).toMatch(/Thumbnails .*retry in 5 s/);
  });

  it("uses the file's name words, stored by the plugin on the document", async () => {
    const chart: RestNode = { id: '2:1', name: 'Chart', type: 'FRAME', absoluteBoundingBox: box(500, 100, 120, 80) };
    const frame: RestNode = { ...home, children: [chart] };
    const withWords: RestNode = { ...document, sharedPluginData: { dobra: { patterns: JSON.stringify({ controls: ['chart'], chrome: [] }) } }, children: [{ id: '0:1', name: 'Screens', type: 'CANVAS', children: [frame] }] };
    const client: FigmaClient = {
      me: async () => ({ handle: 'x' }),
      file: async () => ({ name: 'Words', version: 'words-v1', document: withWords }),
      nodes: async () => ({ loaded: { '1:1': frame }, failed: [] }),
      images: async () => ({}),
    };
    const { report } = await loadFigmaReport(client, 'https://www.figma.com/design/WORDS/x');
    expect(report.frames[0].findings.filter((f) => f.nodeId === '2:1').map((f) => f.ruleId)).toContain('hinge-content');
  });
});
