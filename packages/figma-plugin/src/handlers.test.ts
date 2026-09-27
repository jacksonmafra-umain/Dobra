import { describe, expect, it } from 'vitest';
import sampleProfile from '@dobra/core/profiles/sample.profile.json';
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

  it('checks the page and groups findings per frame', async () => {
    const api = createFakeFigma();
    await handle(api, { type: 'create-presets', keys: ['surface-duo-2/spanned/spanned/landscape'] });
    const frame = api.currentPage.children[0] as FrameNode;
    const button = api.createFrame();
    button.name = 'Buy button';
    button.resize(80, 48);
    frame.appendChild(button);
    button.x = 530;
    button.y = 300;
    const reply = await handle(api, { type: 'check', scope: 'page' });
    if (reply?.type !== 'findings') throw new Error('findings expected');
    expect(reply.frames[0].findings.map((f) => [f.ruleId, f.nodeId])).toContainEqual(['hinge-content', button.id]);
  });

  it('checks only the artboards the selection is in', async () => {
    const api = createFakeFigma();
    await handle(api, { type: 'create-presets', keys: ['pixel-9/main/-/portrait', 'pixel-9/main/-/landscape'] });
    const second = api.currentPage.children[1] as FrameNode;
    const inner = api.createFrame();
    second.appendChild(inner);
    api.currentPage.selection = [inner];
    const reply = await handle(api, { type: 'check', scope: 'selection' });
    if (reply?.type !== 'findings') throw new Error('findings expected');
    expect(reply.frames.map((f) => f.frameId)).toEqual([second.id]);
  });

  it('falls back to the page when nothing is selected', async () => {
    const api = createFakeFigma();
    await handle(api, { type: 'create-presets', keys: ['pixel-9/main/-/portrait', 'pixel-9/main/-/landscape'] });
    api.currentPage.selection = [];
    const reply = await handle(api, { type: 'check', scope: 'selection' });
    if (reply?.type !== 'findings') throw new Error('findings expected');
    expect(reply.frames).toHaveLength(2);
  });

  it('selects and zooms to a node', async () => {
    const api = createFakeFigma();
    const f = api.createFrame();
    await handle(api, { type: 'select-node', nodeId: f.id });
    expect(api.currentPage.selection).toEqual([f]);
    expect(api.zoomedTo).toEqual([f]);
  });

  it('sets a Re-check button on created presets', async () => {
    const api = createFakeFigma();
    await handle(api, { type: 'create-presets', keys: ['pixel-9/main/-/portrait'] });
    expect((api.currentPage.children[0] as unknown as { relaunch: unknown }).relaunch).toEqual({ check: '' });
  });

  it('adapts the chosen frame to each target', async () => {
    const api = createFakeFigma();
    const src = api.createFrame();
    src.resize(411, 923);
    const reply = await handle(api, { type: 'adapt', frameId: src.id, keys: ['surface-duo-2/spanned/spanned/landscape', 'pixel-tablet/main/-/landscape'], split: true });
    if (reply?.type !== 'adapted') throw new Error('adapted expected');
    expect(reply.results.map((r) => r.key)).toEqual(['surface-duo-2/spanned/spanned/landscape', 'pixel-tablet/main/-/landscape']);
    expect(reply.results.every((r) => r.frameId !== src.id && r.plan)).toBe(true);
    expect(reply.results[1].plan.splitNote).toMatch(/does not separate/);
  });

  it('refuses an unknown key before adapting anything', async () => {
    const api = createFakeFigma();
    const src = api.createFrame();
    const reply = await handle(api, { type: 'adapt', frameId: src.id, keys: ['pixel-9/main/-/portrait', 'nope/x/-/portrait'], split: false });
    expect(reply).toMatchObject({ type: 'error' });
    expect(api.currentPage.children).toHaveLength(1);
  });

  it('switches page before selecting a node found on another page', async () => {
    const api = createFakeFigma();
    const other = api.addPage();
    const f = api.createFrame();
    other.appendChild(f as never);
    await handle(api, { type: 'select-node', nodeId: f.id });
    expect(api.currentPage).toBe(other);
    expect(api.currentPage.selection).toEqual([f]);
  });

  describe('variables', () => {
    const DUO = 'surface-duo-2/spanned/spanned/landscape';
    const run = (extra: Record<string, unknown> = {}) => ({ type: 'variables' as const, platforms: ['android' as const], keys: [DUO], profile: null, overwrite: false, removeStale: false, ...extra });

    it('writes the size-class and device collections from the platform defaults', async () => {
      const reply = await handle(createFakeFigma(), run());
      if (reply?.type !== 'variables-done') throw new Error(JSON.stringify(reply));
      expect(reply.summary.collections.map((c) => c.key)).toEqual(['size-classes/android', 'devices']);
      expect(reply.source).toBe('Platform defaults');
    });

    it('uses a pasted profile and names it', async () => {
      const reply = await handle(createFakeFigma(), run({ profile: JSON.stringify(sampleProfile) }));
      if (reply?.type !== 'variables-done') throw new Error(JSON.stringify(reply));
      expect(reply.source).toMatch(/^Profile/);
    });

    it('reports a broken profile with its path, and text that is not JSON', async () => {
      expect(await handle(createFakeFigma(), run({ profile: '{"layoutRules": 3}' }))).toMatchObject({ type: 'error', message: expect.stringContaining('layoutRules') });
      expect(await handle(createFakeFigma(), run({ profile: '{nope' }))).toMatchObject({ type: 'error', message: expect.stringMatching(/^That is not JSON/) });
    });

    it('names an unknown target key', async () => {
      expect(await handle(createFakeFigma(), run({ keys: ['nope/x/-/portrait'] }))).toMatchObject({ type: 'error', message: expect.stringContaining('nope/x/-/portrait') });
    });

    it('says whether Dobra collections exist', async () => {
      const api = createFakeFigma();
      expect(await handle(api, { type: 'variables-status' })).toEqual({ type: 'variables-status', exists: false });
      await handle(api, run());
      expect(await handle(api, { type: 'variables-status' })).toEqual({ type: 'variables-status', exists: true });
    });

    it('picks one target per required coverage cell', async () => {
      const reply = await handle(createFakeFigma(), { type: 'required-targets' });
      if (reply?.type !== 'targets-picked') throw new Error(JSON.stringify(reply));
      expect(reply.keys).toContain(DUO);
    });
  });
});
