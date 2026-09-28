import type { PresetFrame } from '@dobra/core/presets';

/** Same three kinds as the simulator: a physical gap, a separating crease, a flat crease. */
export function hingeKind(h: { separating: boolean; occludes: boolean }): 'occludes' | 'line' | 'flat' {
  return h.occludes ? 'occludes' : h.separating ? 'line' : 'flat';
}

/** The target's hinges and hinge safe zones over a frame thumbnail, colored by CSS classes. */
export function FrameOverlay({ preset, width, height }: { preset: Pick<PresetFrame, 'safeZones' | 'hinges'>; width: number; height: number }) {
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      {preset.safeZones.map((z, i) => (
        <rect key={`z${i}`} className="overlay-safe" x={z.x} y={z.y} width={z.width} height={z.height} />
      ))}
      {preset.hinges.map((h, i) => (
        <rect key={`h${i}`} className={`overlay-hinge overlay-hinge--${hingeKind(h)}`} x={h.rect.x} y={h.rect.y} width={Math.max(h.rect.width, 2)} height={Math.max(h.rect.height, 2)} />
      ))}
    </svg>
  );
}
