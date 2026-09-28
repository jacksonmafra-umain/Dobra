import type { CoverageMatrix } from '@dobra/core/coverage';
import type { Report } from '@dobra/core/report';

/** Present over required across all categories, as a whole percent; null when nothing is required. */
export function coveragePercent(m: Pick<CoverageMatrix, 'byCategory'>): number | null {
  let required = 0;
  let present = 0;
  for (const c of Object.values(m.byCategory)) {
    required += c.required;
    present += c.present;
  }
  return required > 0 ? Math.round((present / required) * 100) : null;
}

const R = 34;
const C = 2 * Math.PI * R;

/** The report's headline: how much of what is required is covered, and what was checked. */
export function CoverageSummary({ report }: { report: Report }) {
  const pct = coveragePercent(report.coverage);
  const counts: Record<string, number> = { error: 0, warn: 0, info: 0 };
  for (const f of report.frames) for (const x of f.findings) counts[x.severity] = (counts[x.severity] ?? 0) + 1;
  return (
    <section className="summary panel" aria-label="Coverage summary">
      <div>
        <div className="summary__eyebrow">Required coverage</div>
        <div className="summary__figure">{pct === null ? '—' : `${pct}%`}</div>
        <div className="summary__stats">
          <span>{report.frames.length} frames</span>
          <span className="sev sev--error">{counts.error} error</span>
          <span className="sev sev--warn">{counts.warn} warn</span>
          <span className="sev sev--info">{counts.info} info</span>
        </div>
      </div>
      <svg className="summary__ring" viewBox="0 0 80 80" width="80" height="80" aria-hidden>
        <circle cx="40" cy="40" r={R} className="summary__track" />
        <circle cx="40" cy="40" r={R} className="summary__value" strokeDasharray={`${((pct ?? 0) / 100) * C} ${C}`} transform="rotate(-90 40 40)" />
      </svg>
    </section>
  );
}
