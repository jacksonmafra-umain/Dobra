import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../catalog/load';
import { emulatorPlan } from './plan';
import { renderScript, shQuote } from './script';

const catalog = loadCatalog();
const syntaxOk = (s: string) => execFileSync('sh', ['-n'], { input: s });

describe('shQuote', () => {
  it('single-quotes and escapes a single quote', () => {
    expect(shQuote("it's")).toBe("'it'\\''s'");
    expect(shQuote('a b')).toBe("'a b'");
  });
});

describe('renderScript', () => {
  it('writes a valid Android script that finds an image, creates the AVD and sets every key', () => {
    const s = renderScript(emulatorPlan(catalog, 'galaxy-z-fold-7'));
    syntaxOk(s);
    expect(s.startsWith('#!/bin/sh\nset -eu\n')).toBe(true);
    expect(s).toContain('"$SDK"/system-images/android-*');
    expect(s).toContain("printf 'no\\n' | \"$AVDMANAGER\" create avd -n 'dobra_galaxy-z-fold-7' -k \"$IMAGE\"");
    expect(s).toContain("set_key 'hw.sensor.hinge.areas' '984-0-0-2184'");
    expect(s).toContain('ANDROID_AVD_HOME');
    expect(s).toContain('"$EMULATOR" -avd \'dobra_galaxy-z-fold-7\'');
  });

  it('writes a valid iOS script', () => {
    const s = renderScript(emulatorPlan(catalog, 'ipad-pro-13'));
    syntaxOk(s);
    expect(s).toContain("UDID=$(xcrun simctl create 'iPad Pro 13-inch (Dobra)' 'com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M5-12GB' \"$RUNTIME\")");
    expect(s).toContain('xcrun simctl boot "$UDID"');
  });

  it('quotes a name that needs it and lists the limits as notes', () => {
    const s = renderScript(emulatorPlan(catalog, 'galaxy-z-flip-7', { name: "Jo's flip" }));
    syntaxOk(s);
    expect(s).toContain("'Jo'\\''s flip'");
    expect(s).toMatch(/note: The cover display isn'\\''t emulated/);
  });

  it('narrows the image search to a requested API level', () => {
    expect(renderScript(emulatorPlan(catalog, 'pixel-9', { api: 34 }))).toContain('WANT_API=34');
  });
});
