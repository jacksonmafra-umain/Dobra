// How the Findings tab organises a report: frames grouped by device (worst first), a frame's
// findings grouped by rule, and a rule × device table for the overview. Pure, so it is tested
// without a DOM.
import type { Report, ReportFrame } from '@dobra/core/report';
import { parseTargetKey } from '@dobra/core/targets';

type Finding = ReportFrame['findings'][number];
type Severity = Finding['severity'];
export interface Counts {
  error: number;
  warn: number;
  info: number;
}

export interface FrameEntry {
  frame: ReportFrame;
  label: string;
  counts: Counts;
}

export interface DeviceGroup {
  /** The catalog device id, or '' for frames that match no device. */
  id: string;
  name: string;
  counts: Counts;
  frames: FrameEntry[];
}

const RANK: Record<Severity, number> = { error: 0, warn: 1, info: 2 };
const zero = (): Counts => ({ error: 0, warn: 0, info: 0 });

function countsOf(findings: readonly Finding[]): Counts {
  const c = zero();
  for (const f of findings) c[f.severity]++;
  return c;
}

/** Worst first: more errors, then more warnings. */
const worse = (a: Counts, b: Counts) => b.error - a.error || b.warn - a.warn || b.info - a.info;

/** "inner · book · portrait, landscape": the display, posture and every orientation a frame stands for. */
export function frameLabel(frame: ReportFrame): string {
  const targets = frame.targets.map(parseTargetKey).filter((t) => t !== null);
  if (!targets.length) return frame.name;
  const [first] = targets;
  const orientations = [...new Set(targets.map((t) => t.orientation))];
  return [first.displayId, first.pose, orientations.join(', ')].filter(Boolean).join(' · ');
}

export function deviceGroups(report: Pick<Report, 'frames'>, deviceName: (id: string) => string | undefined): DeviceGroup[] {
  const byId = new Map<string, DeviceGroup>();
  for (const frame of report.frames) {
    const id = (frame.targets[0] && parseTargetKey(frame.targets[0])?.deviceId) || '';
    let group = byId.get(id);
    if (!group) {
      group = { id, name: id ? (deviceName(id) ?? id) : 'Unmatched frames', counts: zero(), frames: [] };
      byId.set(id, group);
    }
    const counts = countsOf(frame.findings);
    group.frames.push({ frame, label: frameLabel(frame), counts });
    for (const s of ['error', 'warn', 'info'] as const) group.counts[s] += counts[s];
  }
  const groups = [...byId.values()];
  const matched = groups.filter((g) => g.id).sort((a, b) => worse(a.counts, b.counts));
  return [...matched, ...groups.filter((g) => !g.id)];
}

export function filterGroups(groups: DeviceGroup[], query: string, onlyErrors: boolean): DeviceGroup[] {
  const q = query.trim().toLowerCase();
  return groups
    .map((g) => {
      const deviceHit = !q || g.name.toLowerCase().includes(q) || g.id.includes(q);
      const frames = g.frames.filter((f) => (!onlyErrors || f.counts.error > 0) && (deviceHit || f.label.toLowerCase().includes(q)));
      return { ...g, frames };
    })
    .filter((g) => g.frames.length > 0);
}

export interface RuleGroup {
  ruleId: string;
  severity: Severity;
  findings: Finding[];
}

export function ruleGroups(findings: readonly Finding[]): RuleGroup[] {
  const byRule = new Map<string, RuleGroup>();
  for (const f of findings) {
    const g = byRule.get(f.ruleId);
    if (!g) byRule.set(f.ruleId, { ruleId: f.ruleId, severity: f.severity, findings: [f] });
    else {
      g.findings.push(f);
      if (RANK[f.severity] < RANK[g.severity]) g.severity = f.severity;
    }
  }
  return [...byRule.values()].sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.findings.length - a.findings.length);
}

export interface RuleRow {
  ruleId: string;
  severity: Severity;
  total: number;
  /** Findings of this rule on each device, in `devices` order. */
  perDevice: number[];
}

/** Rules in rows, devices in columns; only devices that match the catalog. */
export function ruleMatrix(groups: DeviceGroup[]): { devices: DeviceGroup[]; rows: RuleRow[] } {
  const devices = groups.filter((g) => g.id);
  const rows = new Map<string, RuleRow>();
  devices.forEach((d, i) => {
    for (const { frame } of d.frames)
      for (const f of frame.findings) {
        let row = rows.get(f.ruleId);
        if (!row) rows.set(f.ruleId, (row = { ruleId: f.ruleId, severity: f.severity, total: 0, perDevice: devices.map(() => 0) }));
        if (RANK[f.severity] < RANK[row.severity]) row.severity = f.severity;
        row.total++;
        row.perDevice[i]++;
      }
  });
  return { devices, rows: [...rows.values()].sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.total - a.total) };
}

const HASH = '#frame=';

export const hashForFrame = (ref: string) => HASH + encodeURIComponent(ref);

export function frameRefFromHash(hash: string): string | null {
  if (!hash.startsWith(HASH)) return null;
  try {
    return decodeURIComponent(hash.slice(HASH.length)) || null;
  } catch {
    return null;
  }
}
