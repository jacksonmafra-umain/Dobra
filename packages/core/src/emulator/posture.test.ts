import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../catalog/load';
import { EmulatorPlanError } from './plan';
import { emulatorPosture, posturesOf } from './posture';

const catalog = loadCatalog();
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as EmulatorPlanError).code;
  }
  return null;
};

describe('emulatorPosture', () => {
  it('maps a book foldable posture to the emulator posture and leaves rotation to the user', () => {
    expect(emulatorPosture(catalog, 'galaxy-z-fold-7', 'book')).toEqual({ device: 'galaxy-z-fold-7', posture: 'book', emulator: 2, rotation: 0, orientation: 'portrait' });
    expect(emulatorPosture(catalog, 'galaxy-z-fold-7', 'closed')).toMatchObject({ emulator: 1, rotation: null });
    expect(emulatorPosture(catalog, 'galaxy-z-fold-7', 'open')).toMatchObject({ emulator: 3, rotation: null });
  });

  it('turns the screen for a posture the catalog marks as rotated', () => {
    expect(emulatorPosture(catalog, 'galaxy-z-fold-7', 'tabletop')).toMatchObject({ emulator: 2, rotation: 1, orientation: 'landscape' });
  });

  it('takes an orientation relative to the posture display', () => {
    // The Fold 7 inner display is taller than wide, so portrait is its natural rotation.
    expect(emulatorPosture(catalog, 'galaxy-z-fold-7', 'open', 'portrait')).toMatchObject({ rotation: 0 });
    expect(emulatorPosture(catalog, 'galaxy-z-fold-7', 'open', 'landscape')).toMatchObject({ rotation: 1 });
  });

  it('refuses what the emulator cannot do, with a reason', () => {
    expect(code(() => emulatorPosture(catalog, 'pixel-9-pro-fold', 'rear-display'))).toBe('no-posture');
    expect(code(() => emulatorPosture(catalog, 'galaxy-z-trifold', 'left-half'))).toBe('no-posture');
    expect(code(() => emulatorPosture(catalog, 'iphone-17', 'open'))).toBe('no-posture');
    expect(code(() => emulatorPosture(catalog, 'galaxy-z-fold-7', 'flex'))).toBe('no-posture');
    expect(code(() => emulatorPosture(catalog, 'nope', 'open'))).toBe('unknown-device');
  });

  it('names the postures a device offers, and a wrong one in its error', () => {
    expect(posturesOf(catalog, 'galaxy-z-fold-7')).toEqual(['closed', 'open', 'book', 'tabletop', 'dual-screen']);
    expect(() => emulatorPosture(catalog, 'galaxy-z-fold-7', 'flex')).toThrow(/closed, open, book, tabletop, dual-screen/);
  });

  it('sends a folding iOS simulator to Device Hub, since simctl cannot fold it', () => {
    expect(() => emulatorPosture(catalog, 'iphone-duo', 'book')).toThrow(/Device Hub/);
    expect(() => emulatorPosture(catalog, 'iphone-duo', 'book')).toThrow(/closed, open, book/);
    expect(() => emulatorPosture(catalog, 'iphone-17', 'open')).toThrow(/doesn't fold/);
  });
});

