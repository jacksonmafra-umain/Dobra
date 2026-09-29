# Emulator and simulator generator (sub-project A)

## Goal

Pick a device from the Dobra catalog and get an Android emulator (AVD) or an iOS simulator configured
like it, created by one command. Two entry points share one generator:

- **CLI:** `dobra emulator create <device>` runs the steps on this machine.
- **Site:** a Generator page prints the same steps as a self-contained shell script to paste and run,
  for people without the Dobra repo.

This is sub-project A of three. Out of scope here, each with its own spec later:

- **B:** switch a running emulator's posture (`adb emu posture`, `fold`, `unfold`, `rotate`).
- **C:** run `dobra check site` inside the emulator's Chrome.

## Decisions already made

| Question | Decision |
|---|---|
| Entry points | Both: the CLI and a site section that prints the command or script |
| What the pasted line needs | Both variants: a self-contained script (only the Android SDK or Xcode) and the Dobra CLI line |
| Missing Android system image | Use the newest image already installed; `--api <level>` picks another; with none installed, stop and print the `sdkmanager` command |
| Machine-readable output | `--json` (asked for by agent/04's shared skill) |

## Architecture

### One plan, two renderers

`@dobra/core` gets `emulatorPlan(catalog, deviceId, options): EmulatorPlan`: pure data, no I/O. A plan
is:

- **`platform`:** `'android'` or `'ios'`.
- **`name`:** the AVD name or simulator name to create.
- **`steps`:** an ordered list, each step one of:
  - `find-image`: pick the newest installed system image (Android) or runtime (iOS), or the one
    requested. It records how to list candidates and the install hint when there are none.
  - `run`: an argv array, for example `avdmanager create avd …` or `xcrun simctl create …`.
  - `write-config`: key and value pairs to set in a file (the AVD's `config.ini`).
  - `print`: text for the person, for example the start command.
- **`applied`:** what the plan sets, as labelled values with their catalog `source`.
- **`limits`:** what the emulator can't reproduce, as sentences (for example "The cover display of a
  flip phone isn't emulated").

Two consumers:

- **CLI (`packages/cli`):** executes the plan with a `Runner` interface (`run(argv)`,
  `readFile`/`writeFile`, `env`). Tests use a fake runner, so CI needs neither SDK nor Xcode.
- **Site and `dobra emulator script`:** `renderScript(plan): string` in core turns the plan into a
  POSIX `sh` script. It quotes every value, uses `set -eu`, finds the SDK from `ANDROID_HOME`,
  `ANDROID_SDK_ROOT` or the default macOS and Linux paths, and prints the `sdkmanager` hint if no image
  is found. Windows isn't supported by the script. The CLI works on any OS the SDK tools run on,
  because it doesn't use the script.

Because both consume the same plan, the site and the CLI can't disagree about settings.

### Android plan

- **Create:** `avdmanager create avd -n <name> -k <image>` (plus `--force` only when the person passes it, and no `-d`), then
  `write-config` on `~/.android/avd/<name>.avd/config.ini` (or `ANDROID_AVD_HOME`).
- **Image:** `system-images;android-<api>;<tag>;<abi>`. The ABI follows the host: `arm64-v8a` on
  Apple silicon and ARM Linux, `x86_64` elsewhere. The tag prefers `google_apis_playstore`, then
  `google_apis`, then `default`. "Newest" is the highest API level among installed images with a
  usable tag and ABI. The CLI reads `sdkmanager --list_installed`, or the `system-images` folder when
  that fails. The script lists the folder.
- **Settings, from the catalog only** (no hardcoded device values):
  - **Single-display devices** (phones, tablets, desktop): `hw.lcd.width`, `hw.lcd.height` and
    `hw.lcd.density` from the display's `pixels` and `density` (density × 160, rounded to a whole
    number: the emulator takes any dpi, and Google's own Pixel 9 Pro Fold AVD uses 390).
  - **Book foldables** (for example Galaxy Z Fold 7): `hw.lcd.*` from the inner display.
    `hw.displayRegion.0.1.*` from the cover display, as the region shown when folded.
    `hw.sensor.hinge=yes`, with count, type, areas and ranges from the inner display's hinges.
    `hw.sensor.posture_list` and `hw.sensor.hinge_angles_posture_definitions` from the catalog
    postures. The reference is the emulator's own foldable AVDs, for example the local `fold_api36`.
  - **Flip phones:** a horizontal hinge on the inner display. The cover display is listed in `limits`
    ("not emulated: the emulator has no separate cover screen").
  - **Tri-folds (two hinges) and dual-screen devices (an occluding gap):** the key names exist in
    `hardware-properties.ini` (`hw.sensor.hinge.count`, `hw.sensor.hinge.type`,
    `hw.sensor.hinge.sub_type`). Their accepted values have to be confirmed against the emulator
    source or documentation during implementation. If a value can't be confirmed, the plan creates
    the device without that part and lists it in `limits`. Nothing is guessed.
  - **Density across displays:** the emulator has one density. The inner display's density is used,
    and a different cover density goes to `limits`.
- **Start hint:** `emulator -avd <name>`.

### iOS plan

- **Catalog:** each iOS device gets an optional `simulator` field with the `simctl` device type
  identifier (for example `com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro`) and a `source`
  (`apple-device`). Generic catalog devices (for example `iphone-mini`) name the closest real model,
  marked `estimated`. Hypothetical devices (for example `iphone-duo`) have none.
- **Create:** `xcrun simctl create "<name>" <device type> <runtime>`. The runtime is the newest
  installed iOS runtime (`xcrun simctl list runtimes --json`), or the one given with `--runtime`.
- **Scope:** iPhone and iPad.
- **No simulator:** a device without `simulator` fails with exit 2 and a message saying there is no
  Apple simulator for it.
- **Missing device type** (older Xcode): fail with exit 1, naming the type and the Xcode it needs.
- **Start hint:** `xcrun simctl boot <udid> && open -a Simulator`.

### CLI

```
dobra emulator list [--json]
dobra emulator create <device> [--api <n>] [--runtime <id>] [--name <name>] [--start] [--force] [--json]
dobra emulator script <device> [--api <n>] [--runtime <id>] [--name <name>]
```

- **`<device>`:** a catalog device id, for example `galaxy-z-fold-7`. Unknown ids exit 2 and suggest
  the closest ids.
- **Name:** by default `dobra_<device-id>` for AVDs (letters, digits, `._-`) and `<Device name> (Dobra)`
  for simulators. An existing emulator with that name is left alone and exits 1, unless `--force`
  replaces it.
- **`--start`:** starts the emulator or boots the simulator after creating it.
- **`list`:** every catalog device with its platform, category and whether it can be emulated fully,
  partly (with the limits) or not at all.
- **`--json`:** `{ platform, device, name, id, image, applied, limits, start }` for `create`, and an
  array for `list`. Agents read this, so it's a stable contract, versioned with `"version": 1`.
- **Human output:** what was created, the settings applied, the limits and the start command.
- **Exit codes:** 0 on success; 2 for invalid use (unknown device, no simulator for it, bad options);
  1 when a platform tool is missing or fails (no SDK, no image, `avdmanager` or `simctl` error),
  with the tool's error and the fix.
- **Missing tools:** without the Android SDK or Xcode, the command says which tool is missing and how
  to install it, and exits 1.

### Site: Generator page

- **Page:** a new page on `apps/site` (`/generator/`) linked from the landing page and the header.
- **Picking:** a device picker built from the catalog (grouped by category, platform shown), an API
  level field for Android and a runtime field for iOS, both optional.
- **Output:** the script from `renderScript`, a Copy button, the `limits` as notes, and the
  equivalent `npm run dobra -- emulator create …` line for people with the repo.
- **Hypothetical iOS devices:** the page says there is no simulator and shows no script.
- **Runs in the browser only:** the site just renders text, nothing is executed or sent.

## Testing

- **Core, `emulatorPlan`:** for one device of each kind (single display, book, flip, tri-fold,
  dual-screen, iPhone, iPad, hypothetical iOS), check the settings against the catalog's numbers,
  the step order and the `limits`.
- **Core, `renderScript`:** a snapshot per kind, quoting with names and values that need escaping,
  and a check that the script passes `sh -n`.
- **CLI:** `list`, `create` and `script` with a fake runner. Cover the newest-image choice, `--api`,
  `--force`, an existing name, missing tools, no images, JSON output and exit codes.
- **Site:** a render test that the Generator page lists every catalog device and shows a script for
  one Android and one iOS device; the site's link and asset tests keep passing.
- **Real machine:** an end-to-end test that creates and deletes a throwaway AVD and simulator. It runs
  only when it finds the SDK or Xcode, so CI skips it.

## Review focus

The inputs most likely to break this, which the review must check even where the tests don't:

1. A machine with only x86_64 images on Apple silicon, or only ARM images on Intel: `find-image`
   must say so instead of creating an AVD that won't boot.
2. `ANDROID_AVD_HOME` or `ANDROID_SDK_ROOT` set to non-default paths, and paths with spaces.
3. A catalog density that doesn't map to a density the emulator accepts.
4. A device whose postures don't map to the emulator's posture ids: no invented mapping, a `limits`
   line instead.
5. Running `create` twice: the second run must not half-overwrite the first.

## Rules this follows

- **Config-driven:** every number comes from the catalog, with its `source`. The emulator plan
  contains no device-specific constant.
- **Folds are a list:** the hinge settings come from the display's hinge list, and tri-folds are
  handled by count, not as a special case.
- **Peer platforms:** Android and iOS are separate plans from the same catalog. Neither is described
  as a copy of the other.
