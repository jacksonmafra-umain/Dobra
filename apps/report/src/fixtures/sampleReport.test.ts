import { writeFileSync } from 'node:fs';
import { parseReport } from '@dobra/core/report';
import { describe, expect, it } from 'vitest';
import { sampleReport } from './sampleReport';

// For screenshots: SAMPLE_REPORT_OUT=<path> npm test -w @dobra/report -- src/fixtures writes the JSON.
if (process.env.SAMPLE_REPORT_OUT) writeFileSync(process.env.SAMPLE_REPORT_OUT, JSON.stringify(sampleReport(), null, 2));

describe('sampleReport', () => {
  it('is a valid report with an error, a size-matched frame, an unknown size, an unloaded frame and a note', () => {
    const r = parseReport(JSON.parse(JSON.stringify(sampleReport())));
    expect(r.frames.flatMap((f) => f.findings).some((f) => f.severity === 'error')).toBe(true);
    expect(r.frames.map((f) => f.confidence).sort()).toEqual(['none', 'size', 'tag']);
    expect(r.unloaded).toHaveLength(1);
    expect(r.notes).toHaveLength(1);
  });
});
