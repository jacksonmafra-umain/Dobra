import { describe, expect, it } from 'vitest';
import { loadCatalog } from './catalog/load';
import { envConfigOf } from './targets';
import { presetSpec } from './presets';
import { escapeXml, toPluginJSON, toSVG } from './presetSvg';

const p = presetSpec(envConfigOf(loadCatalog()), { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned', orientation: 'landscape' });

describe('preset export', () => {
  it('writes an SVG with named groups Figma turns into layers', () => {
    const svg = toSVG(p);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1100" height="756"/);
    expect(svg).toContain('<g id="hinge">');
    expect(svg).toContain('<g id="safe-zone">');
    expect(svg).toContain('<rect x="537" y="0" width="26" height="756"');
  });

  it('escapes text so a device name cannot break the SVG', () => {
    expect(escapeXml('A & B <C>')).toBe('A &amp; B &lt;C&gt;');
    expect(toSVG({ ...p, name: 'A & B' })).toContain('<title>A &amp; B</title>');
  });

  it('writes JSON the plugin can import', () => {
    expect(JSON.parse(toPluginJSON([p]))).toEqual({ version: 1, frames: [p] });
  });
});
