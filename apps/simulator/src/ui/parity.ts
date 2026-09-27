// Pairs a device with its nearest peer on the other platform and compares how both resolve.
import type { DeviceSpec, Orientation, SimulatorConfig, Size } from '@dobra/core/config/types';
import type { Finding } from '@dobra/core/engine/checks';
import type { Environment, Selection } from '@dobra/core/engine/environment';
import type { Layout } from '@dobra/core/engine/layout';
import { formatSizeClass } from '@dobra/core/engine/sizeClass';

type Category = DeviceSpec['category'];

/** When the other platform has no device in a category, try these in order. */
const FALLBACK: Record<Category, Category[]> = {
  phone: ['phone'],
  'foldable-book': ['foldable-book', 'tablet', 'phone'],
  'foldable-flip': ['foldable-flip', 'phone'],
  'dual-screen': ['dual-screen', 'foldable-book', 'tablet'],
  'multi-fold': ['multi-fold', 'tablet'],
  tablet: ['tablet'],
  desktop: ['desktop', 'tablet'],
};

/** A display's natural size: iOS stores the portrait size, Android the size as mounted. */
function naturalSize(d: DeviceSpec, displayId = Object.keys(d.displays)[0]): Size {
  const display = d.displays[displayId as keyof typeof d.displays] as { portraitSize?: Size; size?: Size };
  return (display.portraitSize ?? display.size)!;
}

/** Devices are paired by their short side, so a landscape-mounted display pairs like the rest. */
const shortSide = (d: DeviceSpec) => Math.min(naturalSize(d).width, naturalSize(d).height);

export function counterpartOf(config: SimulatorConfig, device: DeviceSpec): DeviceSpec {
  const others = config.devices.filter((d) => d.enabled && d.platform !== device.platform);
  const width = shortSide(device);
  for (const category of FALLBACK[device.category]) {
    const pool = others.filter((d) => d.category === category);
    if (pool.length) return pool.reduce((best, d) => (Math.abs(shortSide(d) - width) < Math.abs(shortSide(best) - width) ? d : best));
  }
  return others[0];
}

/** Returns `vs` only when it names an enabled device on the other platform. */
export function validCounterpart(config: SimulatorConfig, deviceId: string, vs: string | undefined): string | undefined {
  const device = config.devices.find((d) => d.id === deviceId);
  const other = config.devices.find((d) => d.id === vs && d.enabled);
  return device && other && other.platform !== device.platform ? other.id : undefined;
}

export function counterpartSelection(config: SimulatorConfig, sel: Selection, counterpartId: string, orientation: Orientation): Selection {
  const device = config.devices.find((d) => d.id === counterpartId)!;
  const displayId = Object.keys(device.displays)[0];
  const base: Selection = { ...sel, deviceId: counterpartId, displayId, pose: undefined, free: null, orientation };
  if (device.platform === 'ios') return base;
  const size = naturalSize(device, displayId);
  const natural: Orientation = size.width > size.height ? 'landscape' : 'portrait';
  return { ...base, rotation: natural === orientation ? 0 : 90, windowMode: undefined };
}

export interface ParitySide {
  env: Environment;
  layout: Layout;
  findings: Finding[];
}

export interface ParityRow {
  label: string;
  a: string;
  b: string;
  differs: boolean;
}

const describeFindings = (f: Finding[]) => (f.length ? [...new Set(f.map((x) => x.ruleId))].sort().join(', ') : 'none');

export function parityRows(a: ParitySide, b: ParitySide): ParityRow[] {
  const row = (label: string, f: (s: ParitySide) => string): ParityRow => ({ label, a: f(a), b: f(b), differs: f(a) !== f(b) });
  const panes = (s: ParitySide) => s.layout.scene.panes.length;
  return [
    row('Window', (s) => `${s.env.width} × ${s.env.height} ${s.env.unit}`),
    row('Size class', (s) => formatSizeClass(s.env.sizeClass)),
    row('Layout rule', (s) => s.layout.rule.id),
    row('Navigation', (s) => s.layout.navigation.pattern),
    row('Scene', (s) => `${s.layout.scene.strategy} · ${panes(s)} pane${panes(s) === 1 ? '' : 's'}`),
    row('Findings', (s) => describeFindings(s.findings)),
  ];
}
