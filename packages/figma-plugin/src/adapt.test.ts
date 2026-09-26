import { describe, expect, it } from 'vitest';
import { adaptFrame } from './adapt';
import { NAMESPACE, OVERLAY_NAME } from './presets';
import { createFakeFigma, type FakeFigma } from './test/fakeFigma';

const DUO = { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned', orientation: 'landscape' } as const;

function source(api: FakeFigma) {
  const f = api.createFrame();
  f.name = 'Home';
  f.resize(411, 923);
  const title = api.createText();
  title.characters = 'Hello';
  f.appendChild(title as never);
  return f;
}

describe('adaptFrame', () => {
  it('clones, resizes, decorates and tags, leaving the source alone', async () => {
    const api = createFakeFigma();
    const src = source(api);
    const { frame, plan } = await adaptFrame(api, src.id, DUO, { split: false });
    expect(frame.id).not.toBe(src.id);
    expect(src).toMatchObject({ width: 411, height: 923 });
    expect(frame).toMatchObject({ width: 1100, height: 756 });
    expect(frame.x).toBeGreaterThanOrEqual(src.x + src.width);
    expect(frame.getSharedPluginData(NAMESPACE, 'target')).toBe('surface-duo-2/spanned/spanned/landscape');
    expect(frame.children.filter((c) => c.name === OVERLAY_NAME)).toHaveLength(1);
    expect(plan.split).toBeNull();
  });

  it('replaces an old overlay instead of stacking a second one', async () => {
    const api = createFakeFigma();
    const first = await adaptFrame(api, source(api).id, DUO, { split: false });
    const second = await adaptFrame(api, first.frame.id, { deviceId: 'pixel-tablet', displayId: 'main', orientation: 'landscape' }, { split: false });
    expect(second.frame.children.filter((c) => c.name === OVERLAY_NAME)).toHaveLength(1);
  });

  it('splits into two panes at the hinge when asked, keeping the overlay on top', async () => {
    const api = createFakeFigma();
    const { frame } = await adaptFrame(api, source(api).id, DUO, { split: true });
    const panes = frame.children.find((c) => c.name === 'Panes') as unknown as FrameNode;
    expect(panes).toMatchObject({ layoutMode: 'HORIZONTAL', itemSpacing: 26 });
    expect(panes.children.map((c) => c.name)).toEqual(['Pane 1', 'Pane 2']);
    expect(frame.children[frame.children.length - 1].name).toBe(OVERLAY_NAME);
  });

  it('swaps a Size component property to the new size class', async () => {
    const api = createFakeFigma();
    const src = source(api);
    const inst = api.createInstance();
    inst.componentProperties = { Size: { type: 'VARIANT', value: 'Compact' } };
    inst.variantOptions = { Size: ['Compact', 'Medium', 'Expanded'] };
    src.appendChild(inst as never);
    const { frame } = await adaptFrame(api, src.id, DUO, { split: false });
    const copy = frame.children.find((c) => c.type === 'INSTANCE') as unknown as { componentProperties: Record<string, { value: string }> };
    expect(copy.componentProperties.Size.value).toBe('Expanded');
  });

  it('switches a variable collection to the mode named after the size class', async () => {
    const api = createFakeFigma();
    api.collections = [{ id: 'c1', name: 'Layout', modes: [{ modeId: 'm1', name: 'Compact' }, { modeId: 'm2', name: 'Expanded' }] }];
    const { frame } = await adaptFrame(api, source(api).id, DUO, { split: false });
    expect((frame as unknown as { explicitModes: Record<string, string> }).explicitModes).toEqual({ c1: 'm2' });
  });

  it('checks the adapted frame', async () => {
    const api = createFakeFigma();
    const { findings } = await adaptFrame(api, source(api).id, DUO, { split: false });
    expect(Array.isArray(findings)).toBe(true);
  });
});
