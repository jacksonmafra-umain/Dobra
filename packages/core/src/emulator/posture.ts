// A catalog posture on a running Android emulator: the emulator's posture id (hardware-properties.ini:
// 1 closed, 2 half-open, 3 open) and, when the posture or the caller asks for one, an absolute
// rotation (Settings.System.USER_ROTATION: 0 natural, 1 turned 90°). Uses the same mapping the AVD's
// posture list was built from, so a posture the AVD offers is always one this can switch to.
import type { Catalog } from '../config/schema';
import { POSTURE_ID } from './android';
import { EmulatorPlanError } from './plan';

export interface EmulatorPosture {
  device: string;
  posture: string;
  emulator: 1 | 2 | 3;
  /** USER_ROTATION to set, or null to leave the rotation as it is. */
  rotation: 0 | 1 | null;
  /** What that rotation shows, or null when it's left alone. */
  orientation: 'portrait' | 'landscape' | null;
  note?: string;
}

export function posturesOf(catalog: Catalog, deviceId: string): string[] {
  const d = catalog.devices.find((x) => x.id === deviceId);
  return d?.platform === 'android' ? (d.postures ?? []).map((p) => p.id) : [];
}

export function emulatorPosture(catalog: Catalog, deviceId: string, postureId: string, orientation?: 'portrait' | 'landscape'): EmulatorPosture {
  const device = catalog.devices.find((d) => d.id === deviceId);
  if (!device) throw new EmulatorPlanError('unknown-device', `Unknown device "${deviceId}". Run dobra emulator list to see them.`);
  if (device.platform === 'ios') {
    const poses = device.poses ?? [];
    // simctl has no pose, fold or posture command (checked on Xcode 27.2 beta 2); Device Hub has the buttons.
    if (poses.some((p) => p.folded))
      throw new EmulatorPlanError(
        'no-posture',
        `The ${device.name} simulator folds only in Xcode's Device Hub (DeviceHub.app, in Xcode's Contents/Applications): simctl can't fold it. Its poses: ${poses.map((p) => p.id).join(', ')}.`,
      );
    throw new EmulatorPlanError('no-posture', `${device.name} is an iOS simulator: it doesn't fold, so it has no postures.`);
  }
  const postures = device.postures ?? [];
  const posture = postures.find((p) => p.id === postureId);
  if (!posture)
    throw new EmulatorPlanError(
      'no-posture',
      postures.length ? `${device.name} has no posture "${postureId}". It has: ${postures.map((p) => p.id).join(', ')}.` : `${device.name} doesn't fold, so it has no postures.`,
    );
  if (Object.values(device.displays).some((d) => (d.hinges?.length ?? 0) > 1))
    throw new EmulatorPlanError('no-posture', `${device.name} has more than one hinge, so its emulator has no postures: set the hinge angles in the emulator's extended controls.`);
  if (posture.kind === 'rear') throw new EmulatorPlanError('no-posture', `The ${posture.label} posture (rear display) isn't emulated.`);

  const display = device.displays[posture.display];
  const natural = display.size.height >= display.size.width ? 'portrait' : 'landscape';
  const rotation = orientation ? (orientation === natural ? 0 : 1) : posture.rotation === undefined ? null : posture.rotation === 90 ? 1 : 0;
  return {
    device: device.id,
    posture: posture.id,
    emulator: POSTURE_ID[posture.kind],
    rotation,
    orientation: rotation === null ? null : rotation === 0 ? natural : natural === 'portrait' ? 'landscape' : 'portrait',
    ...(posture.windowArea === 'dual-screen' ? { note: `The ${posture.label} posture's dual-screen window area isn't emulated; it opens as the open posture.` } : {}),
  };
}
