# Create emulators and simulators

`dobra emulator` creates an Android emulator or an iOS simulator configured like a catalog device:
its display sizes, density, hinges and postures come from the catalog, each with its source.

## 1. Check it exists

    dobra emulator list --json

- **It prints JSON** (exit 0): the command is there. Keep the list: each device has `id`, `name`,
  `platform`, `category`, `support` (`full`, `partial` or `none`) and `limits`.
- **`Unknown command: emulator`**, or in a checkout the site-check usage text: this Dobra is
  older. Say "Emulator creation isn't available in this Dobra version. `dobra update` gets the
  latest." Then use the "Runtime check without emulators" section of
  [native-android.md](native-android.md) or [native-ios.md](native-ios.md).

Don't probe with `--help`: it prints the usage and exits 2 even when the command exists.

Never write AVD `config.ini` files, or `avdmanager` or `simctl` calls, by hand in its place: the
command builds devices from the catalog so their sizes, hinges and postures match what the rules
check.

## 2. Pick the devices

Use catalog IDs from the list. Before creating one, read its `support` and `limits` and tell the
user what won't match the real device:

- `full`: configured like the device.
- `partial`: created, with the gaps in `limits` (for example, a flip's cover display isn't
  emulated, and a tri-fold's postures must be set by hand in the emulator's extended controls).
- `none`: no emulator or simulator exists, for example the hypothetical `iphone-duo`. Don't try to
  create it.

iOS simulators use the device types Apple ships, so they have no folds; a generic catalog size
gets the closest Apple model.

## 3. Create

    dobra emulator create <device-id> --json

Add `--api <n>` (Android image level) or `--runtime <id>` (iOS runtime) when the user needs one;
by default the newest installed is used. `--start` starts the emulator or boots the simulator once
it's created. `--name <name>` picks the name; the default is `dobra_<device>` on Android.

The JSON result has `platform`, `device`, `name`, `id` (the AVD name on Android, the UDID on iOS),
`image`, `applied` (each setting with its `label`, `value` and `source`), `limits`, and `start` (the
commands that start it, each as an argument list with real paths). Run a `start` entry as given,
or use `--start`.

| Exit | Meaning | What to do |
|---|---|---|
| 0 | Created | Go on |
| 2 | Invalid use: unknown device, a device with no simulator, bad options, or a name outside `[A-Za-z0-9._-]` | Fix the request; don't retry as is |
| 1 | A tool is missing or failed: no Android SDK or Xcode, no image for this processor, the name exists | Tell the user what's missing. Replace an existing one only with their yes: add `--force` |

`--force` replaces an emulator or simulator of the same name. Ask before using it.

For a user who wants to run the steps themselves, or on another machine,
`dobra emulator script <device-id>` prints a shell script that needs only the Android SDK or
Xcode.

## 4. Use them

Install and launch the user's app with their own build tools. Then walk the postures and
orientations:

- **Find the device:** `adb devices` lists running Android emulators with their serials
  (`emulator-5554`); on iOS the UDID is the `id` from `create --json`.
- **Android postures:** `adb -s <serial> emu posture <n>`, where 1 is closed, 2 half-open and 3
  open, matching the posture list `create` configures. Source: Dobra's emulator work, checked on a
  generated Galaxy Z Fold 7 with emulator 36.6.8; it's an emulator console command, not in
  Android's app documentation. The console answers `OK` when it takes it and `KO` when it doesn't.
  After each change, take a screenshot and confirm the posture on screen before you check
  anything in it. `dobra emulator` itself doesn't change a running emulator's posture.
- **Rotation:** rotate with the emulator's controls or the Simulator's Device menu.

Keep screenshots out of the user's project:

    shots="$(mktemp -d)"; echo "$shots"
    adb -s <serial> exec-out screencap -p > "$shots/<screen>-<posture>.png"
    xcrun simctl io <udid> screenshot "$shots/<screen>-<orientation>.png"

Use the folder it printed in later commands. Capture each screen under review in each posture and
orientation, and look at the images for what the native workflow's runtime section lists.

Report per [report-format.md](report-format.md). Name each device, posture and orientation you ran,
copy its `limits` into "What wasn't checked", and list any posture whose change you couldn't
confirm on screen as not checked.
