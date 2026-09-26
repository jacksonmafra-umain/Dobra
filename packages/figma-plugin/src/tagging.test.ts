import { describe, expect, it } from 'vitest';
import { loadCatalog } from '@hinge/core/catalog/load';
import { envConfigOf } from '@hinge/core/targets';
import { NAMESPACE } from './presets';
import { applyTag, tagCandidates } from './tagging';
import { createFakeFigma } from './test/fakeFigma';

const catalog = loadCatalog();
const config = envConfigOf(catalog);

function frame(api: ReturnType<typeof createFakeFigma>, name: string, w: number, h: number, tag = '') {
  const f = api.createFrame();
  f.name = name;
  f.resize(w, h);
  if (tag) f.setSharedPluginData(NAMESPACE, 'target', tag);
  return f;
}

describe('Tag frames', () => {
  it('lists untagged frames with their size candidates and skips tagged ones', () => {
    const api = createFakeFigma();
    frame(api, 'Home', 1100, 756);
    frame(api, 'Done', 750, 832, 'galaxy-z-fold-7/inner/book/portrait');
    const list = tagCandidates(api, config);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Home', by: 'size' });
    expect(list[0].candidates).toContain('surface-duo-2/spanned/spanned/landscape');
  });

  it('lists a frame whose tag points at a device the catalog no longer has', () => {
    const api = createFakeFigma();
    frame(api, 'Old', 10, 10, 'gone/main/-/portrait');
    expect(tagCandidates(api, config)[0]).toMatchObject({ name: 'Old', by: 'none' });
  });

  it('writes the chosen tag and catalog version', async () => {
    const api = createFakeFigma();
    const f = frame(api, 'Home', 1100, 756);
    await applyTag(api, f.id, 'surface-duo-2/spanned/spanned/landscape', catalog.version);
    expect(f.getSharedPluginData(NAMESPACE, 'target')).toBe('surface-duo-2/spanned/spanned/landscape');
    expect(f.getSharedPluginData(NAMESPACE, 'catalogVersion')).toBe(catalog.version);
  });

  it('refuses a missing frame or a malformed key', async () => {
    const api = createFakeFigma();
    const f = frame(api, 'Home', 1100, 756);
    await expect(applyTag(api, '9:9', 'pixel-9/main/-/portrait', catalog.version)).rejects.toThrow(/Frame 9:9 not found/);
    await expect(applyTag(api, f.id, 'not a key', catalog.version)).rejects.toThrow(/not a key/);
  });
});
