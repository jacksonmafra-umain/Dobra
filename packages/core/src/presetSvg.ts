// Preset artboards as files: an SVG a designer can paste into Figma, and JSON the plugin imports.
import type { PresetFrame } from './presets';

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const rect = (r: { x: number; y: number; width: number; height: number }, fill: string, opacity: number) =>
  `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${fill}" fill-opacity="${opacity}"/>`;

/** An SVG of the frame with its overlay as named groups; pasting it into Figma gives editable layers. */
export function toSVG(p: PresetFrame): string {
  const i = p.insets;
  const insets = [
    { x: 0, y: 0, width: p.width, height: i.top },
    { x: 0, y: p.height - i.bottom, width: p.width, height: i.bottom },
    { x: 0, y: 0, width: i.left, height: p.height },
    { x: p.width - i.right, y: 0, width: i.right, height: p.height },
  ].filter((r) => r.width > 0 && r.height > 0);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${p.width}" height="${p.height}" viewBox="0 0 ${p.width} ${p.height}">`,
    `<title>${escapeXml(p.name)}</title>`,
    `<rect id="frame" width="${p.width}" height="${p.height}" rx="${p.cornerRadius}" fill="#ffffff"/>`,
    `<g id="insets">${insets.map((r) => rect(r, '#3b82f6', 0.12)).join('')}</g>`,
    `<g id="reserved">${p.reserved.map((r) => rect(r.rect, '#f59e0b', 0.3)).join('')}</g>`,
    `<g id="safe-zone">${p.safeZones.map((r) => rect(r, '#ef4444', 0.08)).join('')}</g>`,
    `<g id="hinge">${p.hinges.map((h) => rect(h.rect, '#ef4444', 0.2)).join('')}</g>`,
    '</svg>',
  ].join('');
}

export function toPluginJSON(frames: PresetFrame[]): string {
  return JSON.stringify({ version: 1, frames }, null, 2);
}
