import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CoverageSummary, coveragePercent } from './CoverageSummary';
import { sampleReport } from './fixtures/sampleReport';
import { FindingsView, FrameDetail } from './FindingsView';
import { FrameOverlay, hingeKind } from './FrameOverlay';
import { ReportNotes } from './ReportNotes';
import { UnloadedList } from './UnloadedList';
import { ReportHeader } from './ReportHeader';
import { PassChip, SeverityChip, severityLabel } from './SeverityChip';

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

describe('severity chips', () => {
  it('labels each severity', () => {
    expect(severityLabel('error')).toBe('ERROR');
    expect(severityLabel('warn')).toBe('WARN');
    expect(severityLabel('info')).toBe('INFO');
  });
  it('reads an unknown severity as INFO instead of crashing', () => {
    expect(severityLabel('fatal')).toBe('INFO');
    expect(html(SeverityChip, { severity: 'fatal' })).toBe('<span class="chip chip--info">INFO</span>');
  });
  it('renders the pass chip', () => {
    expect(html(PassChip, {})).toBe('<span class="chip chip--pass">PASS</span>');
  });
});

describe('frame overlay', () => {
  it('draws each kind of hinge the way the simulator does', () => {
    expect(hingeKind({ separating: true, occludes: true })).toBe('occludes');
    expect(hingeKind({ separating: true, occludes: false })).toBe('line');
    expect(hingeKind({ separating: false, occludes: false })).toBe('flat');
  });
  it('uses classes, not color attributes, so the theme applies', () => {
    const preset = { safeZones: [{ x: 500, y: 0, width: 100, height: 756 }], hinges: [{ rect: { x: 537, y: 0, width: 26, height: 756 }, separating: true, occludes: true }] };
    const out = html(FrameOverlay, { preset, width: 1100, height: 756 });
    expect(out).toContain('class="overlay-safe"');
    expect(out).toContain('class="overlay-hinge overlay-hinge--occludes"');
    expect(out).not.toMatch(/fill="#/);
  });
});

describe('FrameDetail on a device', () => {
  it('shows where the frame ran and what Chrome reported', () => {
    const frame = {
      ...sampleReport().frames[0],
      runtime: { kind: 'android-chrome' as const, serial: 'RZCXA15YFEJ', model: 'SM-F741B', android: '16', chrome: '154.0.8037.57', emulator: false },
      signals: { viewport: { width: 880, height: 360, dpr: 3 }, devicePosture: 'folded' as const, segments: [{ x: 0, y: 0, width: 440, height: 360 }, { x: 440, y: 0, width: 440, height: 360 }], mq: { horizontalSegments2: true, verticalSegments2: false, postureFolded: true }, deviceState: 'HALF_OPENED' as const },
    };
    const out = renderToStaticMarkup(
      createElement(FrameDetail, { device: { id: 'd', name: 'Galaxy Z Flip 6', counts: { error: 0, warn: 0, info: 0 }, frames: [] }, entry: { frame, label: 'inner · flex-rotated · landscape', counts: { error: 0, warn: 0, info: 0 } }, thumbnail: null, preset: null }),
    );
    expect(out).toContain('SM-F741B · Android 16 · Chrome 154.0.8037.57 · phone RZCXA15YFEJ');
    expect(out).toContain('viewport 880×360 @3 · posture folded · segments 2');
  });
});

describe('FindingsView', () => {
  const report = sampleReport();
  const view = () =>
    renderToStaticMarkup(
      createElement(FindingsView, { report, thumbnails: {}, deviceName: (id: string) => `Device ${id}`, presetFor: () => null, coverage: createElement('p', null, 'COVERAGE') }),
    );

  it('opens on the overview, with the coverage and a rule × device table', () => {
    const out = view();
    expect(out).toContain('aria-current="page">Overview');
    expect(out).toContain('COVERAGE');
    expect(out).toContain('<table class="matrix">');
    const rule = report.frames.flatMap((f) => f.findings)[0].ruleId;
    expect(out).toContain(`<span class="mono">${rule}</span>`);
  });

  it('lists every device in the sidebar and in the narrow-screen picker', () => {
    const out = view();
    for (const f of report.frames.filter((x) => x.targets.length)) {
      const id = f.targets[0].split('/')[0];
      expect(out).toContain(`<span>Device ${id}</span>`);
      expect(out).toContain(`<optgroup label="Device ${id}">`);
    }
    expect(out).toContain('Only with errors');
  });

  it('shows a frame with its findings grouped by rule', () => {
    const frame = report.frames.find((f) => f.findings.length)!;
    const out = renderToStaticMarkup(
      createElement(FrameDetail, {
        device: { id: 'd', name: 'Device d', counts: { error: 0, warn: 0, info: 0 }, frames: [] },
        entry: { frame, label: 'inner · book · landscape', counts: { error: 0, warn: 0, info: 0 } },
        thumbnail: 'blob:shot',
        preset: null,
      }),
    );
    expect(out).toContain('Device d <span class="muted">· inner · book · landscape</span>');
    expect(out).toContain('src="blob:shot"');
    expect(out).toContain(`<strong class="mono">${frame.findings[0].ruleId}</strong>`);
    expect(out).toContain(`<li>${frame.findings[0].message}</li>`);
    expect(out).toMatch(/<details class="rule" open="">/);
  });
});

describe('hairline cards', () => {
  it('lists frames that could not load in an error card', () => {
    const out = html(UnloadedList, { unloaded: sampleReport().unloaded });
    expect(out).toContain('<section class="note-card note-card--error"');
    expect(out).toContain('<h2>Could not load</h2>');
    expect(out).toContain('Rate limited by Figma');
  });
  it('renders nothing when every frame loaded', () => {
    expect(html(UnloadedList, { unloaded: [] })).toBe('');
  });
  it('puts the notes in a card too', () => {
    expect(html(ReportNotes, { notes: ['a note'] })).toContain('<section class="note-card"');
  });
});
