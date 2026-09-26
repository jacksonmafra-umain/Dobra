import { describe, expect, it } from 'vitest';
import { handle } from './handlers';
import { NAMESPACE } from './presets';
import { createFakeFigma } from './test/fakeFigma';

describe('plugin handlers', () => {
  it('lists every target with a name and category', async () => {
    const reply = await handle(createFakeFigma(), { type: 'list-targets' });
    if (reply?.type !== 'targets') throw new Error('targets expected');
    expect(reply.items.find((i) => i.key === 'surface-duo-2/spanned/spanned/landscape')).toMatchObject({ category: 'dual-screen' });
  });

  it('creates presets for the chosen keys, tags them and zooms to them', async () => {
    const api = createFakeFigma();
    const reply = await handle(api, { type: 'create-presets', keys: ['pixel-9/main/-/portrait'] });
    expect(reply).toMatchObject({ type: 'created' });
    expect(api.currentPage.children[0].getSharedPluginData(NAMESPACE, 'target')).toBe('pixel-9/main/-/portrait');
    expect(api.zoomedTo).toHaveLength(1);
  });

  it('reports an unknown key as an error message, not a crash', async () => {
    expect(await handle(createFakeFigma(), { type: 'create-presets', keys: ['pixel-9/main/nope/portrait'] })).toMatchObject({
      type: 'error',
      message: expect.stringContaining('pixel-9/main/nope/portrait'),
    });
  });

  it('creates only the missing required cells, and nothing on a second run', async () => {
    const api = createFakeFigma();
    const first = await handle(api, { type: 'create-missing' });
    expect(first?.type).toBe('created');
    const count = api.currentPage.children.length;
    expect(count).toBeGreaterThan(0);
    expect(await handle(api, { type: 'create-missing' })).toMatchObject({ type: 'created', frameIds: [] });
    expect(api.currentPage.children.length).toBe(count);
  });

  it('reports coverage with tagged frames present', async () => {
    const api = createFakeFigma();
    await handle(api, { type: 'create-presets', keys: ['surface-duo-2/spanned/spanned/landscape'] });
    const reply = await handle(api, { type: 'coverage' });
    if (reply?.type !== 'coverage') throw new Error('coverage expected');
    expect(reply.matrix.byCategory['dual-screen']).toEqual({ required: 3, present: 1 });
  });

  it('tags a frame and returns the refreshed candidate list', async () => {
    const api = createFakeFigma();
    const f = api.createFrame();
    f.resize(1100, 756);
    expect(await handle(api, { type: 'scan-tags' })).toMatchObject({ type: 'tag-candidates', frames: [{ id: f.id, by: 'size' }] });
    expect(await handle(api, { type: 'apply-tag', frameId: f.id, key: 'surface-duo-2/spanned/spanned/landscape' })).toMatchObject({
      type: 'tag-candidates',
      frames: [],
    });
  });

  it('sees artboards the designer moved into a Section or Group, but not frames inside an artboard', async () => {
    const api = createFakeFigma();
    await handle(api, { type: 'create-missing' });
    const section = api.container('SECTION');
    const group = api.container('GROUP');
    section.appendChild(group);
    for (const f of api.currentPage.children.filter((n) => n.type === 'FRAME')) group.appendChild(f as never);
    const before = await handle(api, { type: 'coverage' });
    if (before?.type !== 'coverage') throw new Error('coverage expected');
    expect(before.matrix.cells.filter((c) => c.requirement.level === 'required').every((c) => c.status === 'present')).toBe(true);
    expect(await handle(api, { type: 'create-missing' })).toMatchObject({ type: 'created', frameIds: [] });
    expect(await handle(api, { type: 'scan-tags' })).toMatchObject({ type: 'tag-candidates', frames: [] });
  });
});
