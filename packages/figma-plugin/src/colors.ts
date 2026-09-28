// The brand palette for what the plugin draws on the canvas. Figma fills take RGB in 0–1, and the
// main thread has no CSS, so the values come from @dobra/brand/tokens.
import { tokens } from '@dobra/brand/tokens';

export function figmaColor(hex: string): RGB {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`Not a #RRGGBB color: ${hex}`);
  return { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 };
}

// Light-theme values: artboards are usually light, and these read best on white.
const t = tokens.light;
export const CANVAS = {
  inset: figmaColor(t['accent-2']),
  reserved: figmaColor(t.warn),
  hinge: figmaColor(t.hinge),
  crease: figmaColor(t.fold),
  grid: figmaColor(t.pass),
};
