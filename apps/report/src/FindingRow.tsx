import type { Finding } from '@dobra/core/engine/checks';
import { targetKey } from '@dobra/core/targets';
import { SeverityChip } from './SeverityChip';

/** One finding: its severity chip, rule id and message, and the target it was checked against. */
export function FindingRow({ finding }: { finding: Pick<Finding, 'severity' | 'ruleId' | 'estimated' | 'message' | 'target'> }) {
  return (
    <div className="finding">
      <SeverityChip severity={finding.severity} />
      <div className="finding__body">
        <strong className="mono">{finding.ruleId}</strong>
        {finding.estimated && <span className="badge">estimated</span>}
        <div>{finding.message}</div>
        <div className="finding__target mono">{targetKey(finding.target)}</div>
      </div>
    </div>
  );
}
