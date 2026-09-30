// What Chrome on a real Android device reports about a checked frame: where it ran (runtime) and
// what it said about the window and the fold (signals).

export interface FrameRuntime {
  kind: 'android-chrome';
  serial: string;
  model: string;
  android: string;
  chrome: string;
  emulator: boolean;
}

export interface FrameSignals {
  viewport: { width: number; height: number; dpr: number };
  devicePosture: 'continuous' | 'folded' | null;
  segments: { x: number; y: number; width: number; height: number }[] | null;
  mq: { horizontalSegments2: boolean; verticalSegments2: boolean; postureFolded: boolean };
  /** The committed device state when the frame was read, for fold-posture-mismatch. */
  deviceState: 'CLOSED' | 'HALF_OPENED' | 'OPENED' | null;
}
