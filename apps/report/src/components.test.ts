import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CoverageSummary, coveragePercent } from './CoverageSummary';
import { sampleReport } from './fixtures/sampleReport';
import { ReportHeader } from './ReportHeader';

const html = <P extends object>(el: (props: P) => unknown, props: P) => renderToStaticMarkup(createElement(el as never, props as never));

describe('ReportHeader', () => {
  it('shows the logo for each system theme, the heading and the catalog badge', () => {
    const out = html(ReportHeader, { catalogVersion: '0.5.0' });
    expect(out).toContain('<picture');
    expect(out).toContain('media="(prefers-color-scheme: light)"');
    expect(out).toContain('alt="Dobra"');
    expect(out).toContain('<h1>Foldable Check</h1>');
    expect(out).toContain('catalog 0.5.0');
  });
});

describe('coveragePercent', () => {
  it('sums present over required across categories', () => {
    expect(coveragePercent({ byCategory: { phone: { required: 4, present: 3 }, 'foldable-book': { required: 4, present: 1 } } })).toBe(50);
  });
  it('rounds to a whole percent', () => {
    expect(coveragePercent({ byCategory: { phone: { required: 3, present: 2 } } })).toBe(67);
  });
  it('is null when nothing is required, never NaN', () => {
    expect(coveragePercent({ byCategory: {} })).toBeNull();
    expect(coveragePercent({ byCategory: { phone: { required: 0, present: 0 } } })).toBeNull();
  });
});

describe('CoverageSummary', () => {
  it('shows the figure, a ring and the counts from the report', () => {
    const r = sampleReport();
    const out = html(CoverageSummary, { report: r });
    const pct = coveragePercent(r.coverage);
    expect(out).toContain(pct === null ? '—' : `${pct}%`);
    expect(out).toContain('<svg');
    expect(out).toContain(`${r.frames.length} frames`);
  });
  it('shows a dash instead of a percentage when nothing is required', () => {
    const r = { ...sampleReport(), coverage: { cells: [], byCategory: {} } };
    const out = html(CoverageSummary, { report: r });
    expect(out).toContain('—');
    expect(out).not.toContain('NaN');
  });
});
