import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../catalog/load';
import { androidSettings } from './android';

const catalog = loadCatalog();
const device = (id: string) => {
  const d = catalog.devices.find((x) => x.id === id);
  if (!d || d.platform !== 'android') throw new Error(id);
  return d;
};

describe('androidSettings', () => {
  it('sets a single-display phone from its display', () => {
    const d = device('pixel-9');
    const main = Object.values(d.displays)[0];
    const s = androidSettings(d);
    expect(s.settings['hw.lcd.width']).toBe(String(main.pixels?.width ?? Math.round(main.size.width * main.density)));
    expect(s.settings['hw.sensor.hinge']).toBeUndefined();
    expect(s.limits).toEqual([]);
  });

  it('builds a book foldable from its inner and cover displays and one vertical crease', () => {
    const s = androidSettings(device('galaxy-z-fold-7'));
    expect(s.settings).toMatchObject({
      'hw.lcd.width': '1968',
      'hw.lcd.height': '2184',
      'hw.lcd.density': '420',
      'hw.displayRegion.0.1.xOffset': '0',
      'hw.displayRegion.0.1.yOffset': '0',
      'hw.displayRegion.0.1.width': '1080',
      'hw.displayRegion.0.1.height': '2520',
      'hw.sensor.hinge': 'yes',
      'hw.sensor.hinge.count': '1',
      'hw.sensor.hinge.type': '1',
      'hw.sensor.hinge.sub_type': '0',
      'hw.sensor.hinge.areas': '984-0-0-2184',
      'hw.sensor.hinge.ranges': '0-180',
      'hw.sensor.hinge.defaults': '180',
      'hw.sensor.posture_list': '1, 2, 3',
      'hw.sensor.hinge_angles_posture_definitions': '0-30, 30-150, 150-180',
      'hw.sensor.hinge.fold_to_displayRegion.0.1_at_posture': '1',
    });
  });

  it('says what a flip phone loses: its cover display', () => {
    const s = androidSettings(device('galaxy-z-flip-7'));
    expect(s.settings['hw.sensor.hinge.type']).toBe('0');
    expect(s.settings['hw.displayRegion.0.1.width']).toBeUndefined();
    expect(s.limits).toContain("The cover display isn't emulated: the emulator has no separate outer screen.");
  });

  it('gives a tri-fold two hinges and no posture list', () => {
    const s = androidSettings(device('galaxy-z-trifold'));
    expect(s.settings['hw.sensor.hinge.count']).toBe('2');
    expect(s.settings['hw.sensor.hinge.areas'].split(', ')).toHaveLength(2);
    expect(s.settings['hw.sensor.hinge.ranges']).toBe('0-180, 0-180');
    expect(s.settings['hw.sensor.posture_list']).toBeUndefined();
    expect(s.limits.join(' ')).toMatch(/more than one hinge/);
  });

  it('makes a dual-screen gap a physical hinge that hides content', () => {
    const s = androidSettings(device('surface-duo-2'));
    expect(s.settings['hw.sensor.hinge.sub_type']).toBe('1');
    expect(s.settings['hw.lcd.width']).toBe(String(Math.round(1100 * 2.5)));
    expect(s.applied.find((a) => a.label === 'Main display pixels')?.source).toBe('derived');
  });

  it("matches Google's own Pixel 9 Pro Fold AVD, and never maps its rear-display posture", () => {
    const s = androidSettings(device('pixel-9-pro-fold'));
    // Google's pixel_9_pro_fold AVD: lcd 2076×2152 at 390 dpi, folded region 1080×2424.
    expect(s.settings).toMatchObject({ 'hw.lcd.width': '2076', 'hw.lcd.height': '2152', 'hw.lcd.density': '390', 'hw.displayRegion.0.1.width': '1080', 'hw.displayRegion.0.1.height': '2424' });
    expect(s.limits.join(' ')).toMatch(/rear display/);
  });

  it('lists a display it cannot place', () => {
    expect(androidSettings(device('huawei-mate-xt')).limits.join(' ')).toMatch(/isn't emulated as its own region/);
  });
});
