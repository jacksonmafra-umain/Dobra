// Which catalog device a connected device is, and which of its postures a phone is in now.
import { deviceForModel } from '@dobra/core/catalog/models';
import type { Catalog } from '@dobra/core/config/schema';
import type { Runner } from '../emulator/runner';
import type { ConnectedDevice } from './adb';

export interface Identified {
  deviceId: string | null;
  how: 'avd-name' | 'model' | 'unknown';
}

/** An emulator Dobra created is named dobra_<device>; anything else is looked up by its model. */
export async function identify(r: Runner, adb: string, d: ConnectedDevice, catalog: Catalog): Promise<Identified> {
  if (d.emulator) {
    const res = await r.exec(adb, ['-s', d.serial, 'emu', 'avd', 'name']);
    const avd = res.code === 0 ? res.stdout.split(/\r?\n/)[0].trim() : '';
    const id = /^dobra_(.+)$/.exec(avd)?.[1];
    if (id && catalog.devices.some((x) => x.id === id)) return { deviceId: id, how: 'avd-name' };
  }
  const byModel = d.model ? deviceForModel(catalog, d.model) : null;
  return byModel ? { deviceId: byModel, how: 'model' } : { deviceId: null, how: 'unknown' };
}

/**
 * The catalog posture for a phone's fold state and rotation. Half-open is book when the hinge runs
 * top to bottom on screen and tabletop when it runs across; a rotation of 90° or 270° turns the
 * display's own hinge axis.
 */
export function phonePosture(
  catalog: Catalog,
  deviceId: string,
  state: 'CLOSED' | 'HALF_OPENED' | 'OPENED',
  rotation: 0 | 1 | 2 | 3,
): { posture: string; orientation: 'portrait' | 'landscape' } | null {
  const device = catalog.devices.find((d) => d.id === deviceId);
  if (!device || device.platform !== 'android' || !device.postures?.length) return null;
  const turned = rotation % 2 === 1;
  const orientationOf = (displayId: string) => {
    const { width, height } = device.displays[displayId].size;
    return (turned ? width > height : height >= width) ? 'portrait' : 'landscape';
  };
  const pick = (kind: string) => {
    const p = device.postures!.find((x) => x.kind === kind);
    return p ? { posture: p.id, orientation: orientationOf(p.display) as 'portrait' | 'landscape' } : null;
  };
  if (state === 'CLOSED') return pick('cover');
  if (state === 'OPENED') return pick('flat');
  const axis = device.postures.map((p) => device.displays[p.display].hinges?.[0]?.axis).find(Boolean);
  if (!axis) return null;
  const onScreen = turned ? (axis === 'vertical' ? 'horizontal' : 'vertical') : axis;
  return pick(onScreen === 'vertical' ? 'book' : 'tabletop');
}
