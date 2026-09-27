// Which orientations a display can be shown in. Shared by the requirement check and target enumeration.
import type { DeviceSpec, Orientation } from './types';

export function offeredOrientations(device: DeviceSpec, displayId: string, postureRotation?: 0 | 90): Orientation[] {
  if (device.platform === 'ios') {
    const disp = device.displays[displayId];
    return disp ? (Object.keys(disp.orientations) as Orientation[]) : [];
  }
  const disp = device.displays[displayId];
  if (!disp) return [];
  if (disp.rotation.supported) return ['portrait', 'landscape'];
  const natural: Orientation = disp.size.width > disp.size.height ? 'landscape' : 'portrait';
  return [postureRotation === 90 ? (natural === 'landscape' ? 'portrait' : 'landscape') : natural];
}
