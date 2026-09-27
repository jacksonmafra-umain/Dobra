// The Variables tab's summary, as plain lines: one per collection, then what needs the designer's eye.
import type { VariablesSummary } from '../variableTypes';

export function summaryLines(summary: VariablesSummary): string[] {
  const lines: string[] = [];
  for (const c of summary.collections) {
    lines.push(`${c.name}: ${c.modes} modes, ${c.variables} variables · ${c.created} created, ${c.updated} updated`);
    for (const e of c.keptEdits) lines.push(`Kept your edit: ${e.variable} in ${e.mode} (Dobra value: ${String(e.dobra)})`);
    if (c.stale.length) lines.push(`No longer selected: ${c.stale.join(', ')}`);
    if (c.removed.length) lines.push(`Removed: ${c.removed.join(', ')}`);
    if (c.orphanVariables.length) lines.push(`No longer written by Dobra: ${c.orphanVariables.join(', ')}`);
  }
  lines.push(...summary.warnings);
  for (const e of summary.errors) lines.push(e.collection === '*' ? e.message : `Could not write ${e.collection}: ${e.message}`);
  return lines;
}
