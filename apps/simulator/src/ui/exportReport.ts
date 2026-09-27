// Turns the rendered sample screen into a Hinge Report that the web report can open. The findings
// come from core's geometry rules over what is on screen, not from the simulator's own layout checks.
import { loadCatalog } from '@dobra/core/catalog/load';
import type { Rect } from '@dobra/core/config/types';
import type { Target } from '@dobra/core/engine/checks';
import type { Environment } from '@dobra/core/engine/environment';
import type { GeoNode, GeoRole } from '@dobra/core/geo';
import { buildReport, type Report } from '@dobra/core/report';
import { envConfigOf, isKnownTarget, targetKey } from '@dobra/core/targets';

export interface NodeRecord {
  id: string;
  name: string;
  role: GeoRole;
  /** In window units, relative to the screen's top-left corner. */
  rect: Rect;
  fontSize?: number;
  chars?: number;
  scrollAxis?: 'x' | 'y' | 'none';
  layout?: 'horizontal' | 'vertical' | 'none';
  clips?: boolean;
  parent: string | null;
}

export function toGeoTree(records: NodeRecord[]): GeoNode[] {
  const nodes = new Map<string, GeoNode>();
  for (const { parent: _parent, ...node } of records) nodes.set(node.id, { ...node, children: [] });
  const roots: GeoNode[] = [];
  for (const rec of records) {
    const node = nodes.get(rec.id)!;
    const parent = rec.parent ? nodes.get(rec.parent) : undefined;
    (parent ? parent.children! : roots).push(node);
  }
  return roots;
}

const catalog = loadCatalog();
const envConfig = envConfigOf(catalog);

export type Exportable = { ok: true } | { ok: false; reason: string };

/** Only catalog frames can be exported: other windows would come back as a size mismatch or no match. */
export function exportable(env: Pick<Environment, 'isFree' | 'window'>, target: Target): Exportable {
  if (env.isFree) return { ok: false, reason: 'Free resize is not a catalog target.' };
  if (env.window.mode !== 'fullscreen') return { ok: false, reason: 'Only full screen windows match a catalog frame.' };
  if (!isKnownTarget(envConfig, target)) return { ok: false, reason: 'This pose and orientation is not a catalog target.' };
  return { ok: true };
}

export function simulatorReport(target: Target, label: string, url: string, width: number, height: number, records: NodeRecord[], now = new Date()): Report {
  const key = targetKey(target);
  return buildReport(catalog, { kind: 'simulator', ref: url, name: label }, [{ ref: key, name: label, page: 'Simulator', width, height, tag: key, root: toGeoTree(records) }], now);
}

export const reportFileName = (target: Target) => `hinge-report-${targetKey(target).replaceAll('/', '_')}.json`;

// The element and role rules match the CLI's collector (packages/cli/src/collect.ts), so a screen
// in the simulator and the same page in the CLI become the same geometry.
const TEXT = 'h1,h2,h3,h4,h5,h6,p,li,label,dt,dd,td,th,figcaption,blockquote';
const INTERACTIVE =
  'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=tab],[role=checkbox],[role=switch],[tabindex]:not([tabindex="-1"])';
const CHROME = 'header,nav,footer,[role=banner],[role=navigation],[role=contentinfo]';
const MEDIA = 'img,video,picture,canvas,svg,iframe';

function roleOf(el: Element, style: CSSStyleDeclaration): GeoRole | null {
  if (el.matches(INTERACTIVE)) return 'interactive';
  if (el.matches(CHROME) || style.position === 'fixed' || style.position === 'sticky') return 'chrome';
  if (el.matches(MEDIA)) return 'media';
  if (el.matches(TEXT) && (el.textContent ?? '').trim()) return 'text';
  if (style.display.includes('flex') || style.display.includes('grid') || /auto|scroll|hidden|clip/.test(style.overflowX + style.overflowY)) return 'container';
  return null;
}

/** Walks the rendered screen into records in window units, relative to the screen's top-left corner. */
export function collectRecords(host: HTMLElement, env: Pick<Environment, 'width'>): NodeRecord[] {
  const box = host.getBoundingClientRect();
  const scale = box.width / env.width || 1;
  const out: NodeRecord[] = [];
  const walk = (el: Element, parent: string | null) => {
    for (const child of Array.from(el.children)) {
      const style = getComputedStyle(child);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const r = child.getBoundingClientRect();
      const role = roleOf(child, style);
      if (!role || (r.width <= 1 && r.height <= 1)) {
        walk(child, parent);
        continue;
      }
      const id = `n${out.length}`;
      const tag = child.tagName.toLowerCase();
      const cls = typeof child.className === 'string' ? child.className.split(/\s+/)[0] : '';
      const rec: NodeRecord = {
        id,
        name: child.getAttribute('data-name') ?? (cls ? `${tag}.${cls}` : tag),
        role,
        rect: { x: (r.left - box.left) / scale, y: (r.top - box.top) / scale, width: r.width / scale, height: r.height / scale },
        scrollAxis:
          /auto|scroll/.test(style.overflowX) && child.scrollWidth > child.clientWidth
            ? 'x'
            : /auto|scroll/.test(style.overflowY) && child.scrollHeight > child.clientHeight
              ? 'y'
              : 'none',
        layout: style.display.includes('flex')
          ? style.flexDirection.startsWith('row')
            ? 'horizontal'
            : 'vertical'
          : style.display.includes('grid')
            ? 'horizontal'
            : 'none',
        ...(/hidden|clip/.test(style.overflowX + style.overflowY) ? { clips: true } : {}),
        parent,
      };
      if (role === 'text') {
        rec.chars = (child.textContent ?? '').trim().length;
        // Computed sizes are layout units, unaffected by the frame's zoom transform.
        rec.fontSize = parseFloat(style.fontSize);
      }
      out.push(rec);
      if (role !== 'media') walk(child, id);
    }
  };
  walk(host, null);
  return out;
}
