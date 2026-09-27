import type { DeviceSpec } from '../config/types';

/**
 * What a posture offers a layout, whatever the device calls it. `partial` is a multi-fold with
 * some panels folded away; `dual` and `rear` are WindowAreaController presentation modes.
 */
export const POSTURE_KINDS = ['cover', 'flat', 'book', 'tabletop', 'partial', 'dual', 'rear'] as const;
export type PostureKind = (typeof POSTURE_KINDS)[number];

/** The kinds of posture a device offers. A device with no poses or postures is flat. */
export function postureKinds(d: DeviceSpec): Set<PostureKind> {
  const list = d.platform === 'ios' ? (d.poses ?? []) : (d.postures ?? []);
  return new Set<PostureKind>(list.length ? list.map((p) => p.kind) : ['flat']);
}
