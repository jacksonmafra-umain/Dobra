// Android emulator settings (an AVD's config.ini keys) for a catalog device. Every number comes
// from the catalog; the emulator vocabulary below comes from the emulator's hardware-properties.ini.
import type { Catalog } from '../config/schema';

export type AndroidDevice = Extract<Catalog['devices'][number], { platform: 'android' }>;
export interface AppliedSetting {
  label: string;
  value: string;
  source: string;
}
export interface AndroidSettings {
  settings: Record<string, string>;
  applied: AppliedSetting[];
  limits: string[];
}

/**
 * Emulator posture ids (hardware-properties.ini `hw.sensor.posture_list`: 1 closed, 2 half-open,
 * 3 open) and the angle range of each, as the emulator's own foldable AVD defines them.
 */
const POSTURE_ID = { cover: 1, flat: 3, book: 2, tabletop: 2, partial: 2, dual: 3 } as const;
const POSTURE_ANGLES: Record<number, string> = { 1: '0-30', 2: '30-150', 3: '150-180' };

type Display = AndroidDevice['displays'][string];
const pixelsOf = (d: Display) => d.pixels ?? { width: Math.round(d.size.width * d.density), height: Math.round(d.size.height * d.density) };

export function androidSettings(device: AndroidDevice): AndroidSettings {
  const settings: Record<string, string> = {};
  const applied: AppliedSetting[] = [];
  const limits: string[] = [];
  const postures = device.postures ?? [];
  const ids = Object.keys(device.displays);
  const mainId = postures.find((p) => p.kind === 'flat')?.display ?? ids.find((id) => device.displays[id].hinges?.length) ?? ids[0];
  const main = device.displays[mainId];
  const px = pixelsOf(main);
  // The emulator takes any dpi: Google's own Pixel 9 Pro Fold AVD uses 390.
  const density = Math.round(main.density * 160);

  settings['hw.lcd.width'] = String(px.width);
  settings['hw.lcd.height'] = String(px.height);
  settings['hw.lcd.density'] = String(density);
  settings['hw.keyboard'] = 'yes';
  applied.push({ label: 'Main display', value: main.label, source: main.source });
  applied.push({ label: 'Main display pixels', value: `${px.width}×${px.height}`, source: main.pixels ? main.source : 'derived' });
  applied.push({ label: 'Density', value: `${density} dpi`, source: main.source });

  const coverId = postures.find((p) => p.kind === 'cover')?.display;
  const used = new Set([mainId]);
  if (coverId && coverId !== mainId) {
    used.add(coverId);
    const cover = device.displays[coverId];
    const cpx = pixelsOf(cover);
    if (device.category === 'foldable-flip') {
      limits.push("The cover display isn't emulated: the emulator has no separate outer screen.");
    } else {
      // The folded region may be larger than the main display: Google's Pixel 9 Pro Fold AVD has a 1080×2424 region on a 2076×2152 screen.
      settings['hw.displayRegion.0.1.xOffset'] = '0';
      settings['hw.displayRegion.0.1.yOffset'] = '0';
      settings['hw.displayRegion.0.1.width'] = String(cpx.width);
      settings['hw.displayRegion.0.1.height'] = String(cpx.height);
      settings['hw.sensor.hinge.fold_to_displayRegion.0.1_at_posture'] = '1';
      applied.push({ label: 'Folded region', value: `${cover.label}, ${cpx.width}×${cpx.height}`, source: cover.pixels ? cover.source : 'derived' });
    }
  }
  for (const id of ids) if (!used.has(id)) limits.push(`The ${device.displays[id].label} isn't emulated as its own region.`);

  const hinges = main.hinges ?? [];
  if (hinges.length && new Set(hinges.map((h) => h.axis)).size > 1) {
    limits.push("Hinges on both axes can't be emulated together, so none are set.");
  } else if (hinges.length) {
    const d = main.density;
    settings['hw.sensor.hinge'] = 'yes';
    settings['hw.sensor.hinge.count'] = String(hinges.length);
    settings['hw.sensor.hinge.type'] = hinges[0].axis === 'vertical' ? '1' : '0';
    settings['hw.sensor.hinge.sub_type'] = hinges.some((h) => h.occlusion === 'FULL' && h.width > 0) ? '1' : '0';
    settings['hw.sensor.hinge.areas'] = hinges
      .map((h) =>
        h.axis === 'vertical'
          ? `${Math.round(h.position * d)}-0-${Math.round(h.width * d)}-${px.height}`
          : `0-${Math.round(h.position * d)}-${px.width}-${Math.round(h.width * d)}`,
      )
      .join(', ');
    settings['hw.sensor.hinge.ranges'] = hinges.map(() => '0-180').join(', ');
    settings['hw.sensor.hinge.defaults'] = hinges.map(() => '180').join(', ');
    applied.push({ label: 'Hinges', value: `${hinges.length} ${hinges[0].axis}`, source: hinges[0].source });

    if (hinges.length > 1) {
      limits.push("Postures aren't configured for more than one hinge: set the hinge angles in the emulator's extended controls.");
    } else {
      const list = new Set<number>();
      for (const p of postures) {
        if (p.kind === 'rear') {
          limits.push(`The ${p.label} posture (rear display) isn't emulated.`);
          continue;
        }
        if (p.windowArea === 'dual-screen') limits.push(`The ${p.label} posture's dual-screen window area isn't emulated; it opens as the open posture.`);
        list.add(POSTURE_ID[p.kind]);
      }
      const sorted = [...list].sort((a, b) => a - b);
      if (sorted.length) {
        settings['hw.sensor.posture_list'] = sorted.join(', ');
        settings['hw.sensor.hinge_angles_posture_definitions'] = sorted.map((id) => POSTURE_ANGLES[id]).join(', ');
      }
    }
  }
  return { settings, applied, limits };
}
