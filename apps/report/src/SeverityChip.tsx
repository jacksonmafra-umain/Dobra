export type SeverityLabel = 'ERROR' | 'WARN' | 'INFO';

/** The chip text for a finding's severity; anything unrecognised reads as information. */
export function severityLabel(severity: string): SeverityLabel {
  return severity === 'error' ? 'ERROR' : severity === 'warn' ? 'WARN' : 'INFO';
}

export function SeverityChip({ severity }: { severity: string }) {
  const label = severityLabel(severity);
  return <span className={`chip chip--${label.toLowerCase()}`}>{label}</span>;
}

export function PassChip() {
  return <span className="chip chip--pass">PASS</span>;
}
