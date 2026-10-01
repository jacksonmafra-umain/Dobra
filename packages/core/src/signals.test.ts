import { describe, expect, it } from 'vitest';
import type { GeoNode } from './geo';
import { chromeMajor, signalFindings, type FrameRuntime, type FrameSignals } from './signals';

const target = { deviceId: 'galaxy-z-flip-6', displayId: 'inner', pose: 'flex-rotated', orientation: 'landscape' } as const;
const runtime = (chrome: string): FrameRuntime => ({ kind: 'android-chrome', serial: 's', model: 'SM-F741B', android: '16', chrome, emulator: false });
const two: FrameSignals = {
  viewport: { width: 880, height: 360, dpr: 3 },
  devicePosture: 'folded',
  segments: [
    { x: 0, y: 0, width: 440, height: 360 },
    { x: 440, y: 0, width: 440, height: 360 },
  ],
  mq: { horizontalSegments2: true, verticalSegments2: false, postureFolded: true },
  deviceState: 'HALF_OPENED',
};
const node = (id: string, x: number, width: number): GeoNode => ({ id, name: id, role: 'container', rect: { x, y: 0, width, height: 360 }, children: [] }) as unknown as GeoNode;

describe('chromeMajor', () => {
  it('reads the major version', () => {
    expect(chromeMajor('154.0.8037.57')).toBe(154);
    expect(chromeMajor('')).toBe(0);
  });
});

describe('fold-layout-missing', () => {
  it('warns when nothing lines up with the fold', () => {
    expect(signalFindings(two, runtime('154.0'), [node('a', 0, 880)], target).map((f) => f.ruleId)).toEqual(['fold-layout-missing']);
  });
  it('is quiet when a pane edge sits on the fold', () => {
    expect(signalFindings(two, runtime('154.0'), [node('left', 0, 436), node('right', 446, 434)], target)).toEqual([]);
  });
  it('never runs on Chrome older than 138', () => {
    expect(signalFindings(two, runtime('133.0'), [node('a', 0, 880)], target)).toEqual([]);
  });
});

describe('fold-posture-mismatch', () => {
  it('notes a half-open device whose page does not see the fold posture', () => {
    const f = signalFindings({ ...two, segments: null, devicePosture: 'continuous' }, runtime('154.0'), [], target);
    expect(f.map((x) => [x.ruleId, x.severity])).toEqual([['fold-posture-mismatch', 'info']]);
  });
});
