# Website checks in real Android Chrome (sub-project C)

## Goal

Check a website in Chrome running on an Android device, an emulator or a real phone, with the
same rules, report and ZIP as `dobra check site`. Today's check runs Chromium on the machine and
emulates each device. This one uses real Android Chrome, so the report shows three things emulation
can't:

1. **Real Android Chrome layout:** Chrome's own toolbar and insets, the real user agent, real touch,
   and the real viewport.
2. **Real fold APIs:** whether the site reacts to viewport segments and `navigator.devicePosture`, as
   Chrome reports them on a folding device.
3. **Real phones:** the same check on a connected phone, such as a Galaxy Z Flip 6, through adb.

Parts A (`dobra emulator create`) and B (`dobra emulator posture`) are merged. This spec builds on
them.

## Facts this relies on (probed on this machine, 2026-09-29)

- **DevTools works:** `adb forward tcp:<port> localabstract:chrome_devtools_remote` exposes Chrome's
  DevTools on an emulator. Playwright's `chromium.connectOverCDP` drives it: navigation,
  `page.evaluate`, and the real viewport (Galaxy Z Fold 7 AVD: 750×680 CSS px at 2.625).
- **Old Chrome on the images:** the emulator images ship Chrome 133. Viewport segments and
  `devicePosture` are there from Chrome 138. On 133, `navigator.devicePosture.type` stays
  `continuous` and `window.viewport` is undefined in every posture.
- **An emulator does fold** after the part-A fix (#192): closed shows the cover display, and
  half-open and open show the inner one.
- **A real phone qualifies:** the connected phone `RZCXA15YFEJ` is a Galaxy Z Flip 6
  (`ro.product.model` `SM-F741B`) on Android 16 with Chrome 154, new enough for the fold APIs.
- **Catalog gap:** the catalog has the Flip 7 but no Flip 6.

## Decisions already made

| Question | Decision |
|---|---|
| What C is for | All three: real Chrome layout, real fold APIs, real phones |
| Approach | One engine behind `dobra check site --on`; `dobra check device` is a second way in to the same engine; Playwright's experimental `_android` API only where it does something the plain adb connection can't, after a test |

## User-facing interface

```
dobra check site <url> --on <serial> [check site options] [--hold]
dobra check device <serial> <url> [the same options]
dobra check site --on            # no serial: list connected devices and exit 0
```

- **`<serial>`** is an adb serial: `emulator-5554` or a phone's serial.
- **Options:** the same as `check site` (`--out`, `--md`, `--zip`, `--no-zip`, `--wait`,
  `--fail-on`, `--no-transitions`). `--targets` and `--category` don't apply and exit 2.
- **The device list** gives each device's serial, kind (emulator or phone), model, Android version,
  Chrome version, the catalog device it matches (or "not in catalog"), and whether its Chrome
  reports fold APIs (138 or newer).
- **`--hold`** (real phones only): before each posture after the first, it prints "Fold the phone to
  <posture>, then press Enter" and waits. On an emulator, postures change automatically and `--hold`
  exits 2.
- **Exit codes:** as `check site` (0 clean, 1 findings at `--fail-on` or a target that couldn't load,
  2 invalid use). Also exit 1 when the device goes away mid-check, when Chrome isn't installed, or
  when DevTools can't be reached. The message says which, and how to fix it (for example: enable USB
  debugging, unlock the phone).

## Architecture

New code lives in `packages/cli/src/device/`, with one responsibility per file. Core gets data and
rules only.

### `device/adb.ts`: find devices and read their state

- **`listDevices(runner)`:** `adb devices -l`, then per serial `getprop` `ro.product.model`,
  `ro.build.version.release`, `ro.kernel.qemu` (1 on an emulator), and Chrome's `versionName` from
  `dumpsys package com.android.chrome`.
- **`deviceState(runner, serial)`:** `dumpsys device_state` gives the committed state (`CLOSED`,
  `HALF_OPENED`, `OPENED`); `dumpsys window displays` gives `mCurrentRotation`.
- **Reuses the Runner** from part A (`createNodeRunner`), so it's tested with the fake runner.
- **Read-only on phones:** Dobra never changes a phone's settings. It only opens Chrome tabs,
  forwards a port and reads state. Rotation and posture changes happen only on emulators, through
  part B.

### `device/chrome.ts`: connect to Chrome on the device

- **Start Chrome:** `am start -a android.intent.action.VIEW -d <url> com.android.chrome`.
- **Forward DevTools:** `adb forward tcp:0 localabstract:chrome_devtools_remote`; the local port
  that adb picks is read back from `adb forward --list`.
- **Connect:** `chromium.connectOverCDP` on that port, then take the page whose URL matches.
- **Clean up:** the forward is always removed, also on failure (`adb forward --remove`).
- **Screenshots:** Playwright's `page.screenshot` over DevTools.
- **Where `_android` might help:** the plan first tests whether it adds anything over this, for
  example launching Chrome with a fresh profile, or screenshots that include the system bars. It's
  adopted only for a proven gain, and behind the same interface, so the check doesn't depend on it.

### `device/identify.ts`: which catalog device and posture this is

- **Emulators Dobra created:** `adb emu avd name` gives `dobra_<device-id>`, and that names the
  catalog device.
- **Phones:** a new optional catalog field on Android devices, `models: { id: string; source: string }[]`,
  lists model ids such as `SM-F741B`. The model prefix before any region suffix is matched, and the
  first device listing it wins.
- **A device the catalog doesn't know** (or an emulator Dobra didn't create) is checked as a window
  only: the real viewport, the collector, and the rules that need no catalog geometry. The report
  says so for each frame.
- **Posture:**
  - **Emulators:** it's the posture Dobra set.
  - **Phones:** it's read from the device state and matched to the catalog. `CLOSED` is the
    device's `cover` posture. `OPENED` is `flat`. `HALF_OPENED` is the half-open posture whose hinge
    axis, in the current rotation, matches: `book` for a vertical hinge, `tabletop` for a horizontal
    one.
  - **Flips:** their natural hinge is horizontal, so half-open portrait maps to their `tabletop`-kind
    posture (`flex`).
  - **No match:** the frame is window-only, with a note.

### `device/checkDevice.ts`: the check loop

- **Emulators:** for each catalog posture the AVD offers (from the part-B mapping), it sets the
  posture through part B, waits for the window to settle, then collects. With `--no-transitions`
  it skips the "resize vs reload" pass, which compares the layout after a live posture change with
  a fresh load in that posture, as `check site` does.
- **Phones:** it checks the current posture. With `--hold`, it asks for each remaining posture in
  catalog order and checks it when the device state changes. A state that hasn't changed within 60
  seconds is skipped with a note.
- **Each frame:**
  1. `collectLayout(page)` runs, the collector `check site` already uses.
  2. The frame's **signals** are read in the page:

     ```
     { viewport: { width, height, dpr },
       devicePosture: 'continuous' | 'folded' | null,
       segments: [{ x, y, width, height }] | null,
       mq: { horizontalSegments2, verticalSegments2, postureFolded } }
     ```

  3. A screenshot is taken.
  4. The frame goes into the same `ReportInput`, with the target tag
     `<device>/<display>/<posture>/<orientation>`, so every existing rule and the coverage work
     unchanged.

### Core changes

- **Catalog:**
  - The `models` field above, with a source per model id.
  - A **Galaxy Z Flip 6** entry, `galaxy-z-flip-6`: displays, density, hinge and postures from
    Samsung's published specs. Values that aren't published, such as the density, are marked
    `estimated`, like the Flip 7.
  - `models` for the catalog devices whose model ids Samsung, Google, Motorola and OnePlus publish,
    each with its source. A device whose id can't be sourced gets none.
- **Report:** two optional fields on `ReportFrame`, so older reports still parse:
  - `runtime`: `{ kind: 'android-chrome', serial, model, android, chrome, emulator: boolean }`;
  - `signals`: the object above.
- **New rules in `rules.ts`,** run only on frames that have `signals`:
  - **`fold-layout-missing` (warn):** Chrome reports two segments, but no element's box edge lies
    within 8 CSS px of the gap between them, so the page doesn't lay out along the fold. The 8 px
    tolerance is a rule setting in the app profile, not a constant.
  - **`fold-posture-mismatch` (info):** the device is half-open, but `devicePosture` isn't
    `folded`, and Chrome is 138 or newer. The page may be forcing a posture, or the API is off.
- **Report note:** frames checked on Chrome older than 138 get one report note: "Chrome <version>
  on <device> doesn't report viewport segments or posture (they need Chrome 138), so fold APIs
  weren't checked there." The fold-API rules don't run for those frames, rather than passing them.

### Report app

- **Frame detail:** the header shows where the frame ran: device, model, Android, Chrome, and
  emulator or phone.
- **Signals:** they're listed next to the findings (segments, posture). Nothing else changes.

## Testing

- **Unit, with the fake runner:**
  - **Device discovery:** parsing `adb devices -l` and `getprop`, emulator versus phone, and the
    Chrome version.
  - **Device state:** reading the committed state and the rotation.
  - **Chrome:** the port-forward lifecycle, including removal on failure.
  - **Identifying the device:** AVD name, model prefix, and unknown.
  - **Mapping phone posture:** book, tabletop and flip.
  - **`--hold`:** prompting and the 60 s timeout, with a fake clock.
- **Core:**
  - `models` validation and Flip 6 catalog validation;
  - both new rules, with synthetic layouts and signals;
  - the report note;
  - older reports without `runtime` or `signals` still parse.
- **CLI:** the device list, `check device` as the same engine, exit codes, and `--targets`, `--hold`
  on an emulator, and `--on` without a serial.
- **Real emulator** (`DOBRA_MACHINE_TEST=1`): create a Fold 7 AVD, boot it, run
  `check site --on emulator-<port>` on a fixture page from `examples/sites`, then check the frames:
  one per posture, the real viewport width, and screenshots in the ZIP.
- **Real phone** (`DOBRA_DEVICE=<serial>`, never on by default): check a fixture page served from the
  machine and reached through `adb reverse`, then check a frame with `signals.segments` when the
  phone is half-open.

## Review focus

1. **A phone that is locked, has USB debugging off or has Chrome closed:** a clear exit 1 with the
   fix, never a hang.
2. **Two devices with the same model, or an unauthorized device in `adb devices`:** it lists them
   and never picks one silently.
3. **The DevTools forward must always be removed,** after success, failure or Ctrl+C, and a leftover
   forward from an earlier run mustn't break a new one.
4. **The phone's own state:** nothing on a real phone may change except opening a Chrome tab. No
   settings are written, and nothing is installed.
5. **Chrome older than 138:** the fold-API rules are skipped with a note, never reported as a pass.

## Out of scope

- **iOS Safari in the simulator:** automating it needs Appium or WebDriver tooling, so it gets its
  own spec if wanted.
- **Updating Chrome on the emulator images** (Play Store sign-in): the device list shows the Chrome
  version, and the note says what's missing.
- **Checking several devices in one run:** one `--on` serial per run for now.
