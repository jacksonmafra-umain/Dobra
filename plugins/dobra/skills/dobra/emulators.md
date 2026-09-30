# Create emulators and simulators

`dobra emulator` creates an Android emulator or an iOS simulator configured like a catalog device:
its display sizes, density, hinges and postures come from the catalog, each with its source.

## 1. Check it exists

    dobra emulator list --json

- **It prints JSON** (exit 0): the command is there. Keep the list: each device has `id`, `name`,
  `platform`, `category`, `support` (`full`, `partial` or `none`), `limits` and `postures` (the
  catalog posture names, such as `book` or `tabletop`).
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

Create every device you chose in one command:

    dobra emulator create <device-id> <device-id> … --json

Add `--api <n>` (Android image level) or `--runtime <id>` (iOS runtime) when the user needs one;
by default the newest installed is used. `--start` starts each emulator or boots each simulator
once it's created. `--name <name>` picks the name, for one device only (with several it exits 2);
the default is `dobra_<device>` on Android.

Every device is checked before anything is created, so an unknown device or one with no simulator
stops the whole command with exit 2 and nothing is made. Then each device is created in turn.

The JSON for one device is a single result. For several, it's `{ version: 1, results: [...] }`:
`results` has one entry per device, in order. A result has `platform`, `device`, `name`, `id` (the AVD name on
Android, the UDID on iOS), `image`, `applied` (each setting with its `label`, `value` and `source`),
`limits`, and `start` (the commands that start it, each as an argument list with real paths). A
device that failed has `error` in place of those. Run a `start` entry as given, or use `--start`.

| Exit | Meaning | What to do |
|---|---|---|
| 0 | Every device created | Go on |
| 2 | Invalid use: unknown device, a device with no simulator, bad options, `--name` with several devices, or a name outside `[A-Za-z0-9._-]`; nothing was created | Fix the request; don't retry as is |
| 1 | At least one device failed: no Android SDK or Xcode, no image for this processor, the name exists | Read each result's `error`, go on with the ones created, and tell the user what's missing. Replace an existing one only with their yes: add `--force` |

`--force` replaces an emulator or simulator of the same name. Ask before using it.

For a user who wants to run the steps themselves, or on another machine,
`dobra emulator script <device-id> <device-id> …` prints one shell script for all of them that
needs only the Android SDK or Xcode. Tell them to save it and run it as a file
(`sh dobra-emulators.sh`), not paste it into Terminal: pasted, its error handling runs in their own
shell and can close it. The site's emulator generator does the same with "Download script".

## 4. Use them

Install and launch the user's app with their own build tools. Then walk the postures and
orientations:

- **Find the device:** `adb devices` lists running Android emulators with their serials
  (`emulator-5554`); on iOS the UDID is the `id` from `create --json`.
- **Android postures and rotation:**

      dobra emulator posture <device-id> <posture> --json

  `<posture>` is one of the device's `postures` from `list --json`; never invent one. It finds the
  emulator created for that device (`dobra_<device-id>`); pass `--name <avd>` or `--serial <id>` for
  another. It sets the rotation the posture implies, or the one you give with
  `--orientation portrait` or `--orientation landscape`. The JSON has `device`, `posture`,
  `emulator` (the emulator's posture number), `serial` and `orientation`.

  | Exit | Meaning | What to do |
  |---|---|---|
  | 0 | Switched | Screenshot, and confirm the posture on screen before checking anything in it |
  | 2 | A posture it can't take (rear display, a device with two hinges, iOS, an unknown posture); the reason is on stderr | Report it as not checked, with the reason |
  | 1 | The emulator isn't running (stderr has the start command) or `adb` failed | Start it, or tell the user what failed |

  On an emulator that has just booted, wait until `adb -s <serial> shell getprop
  sys.boot_completed` prints `1`, then about 15 s more: first-boot setup resets the rotation
  otherwise.
- **iOS rotation:** use the Simulator's Device menu; iOS has no postures.

Keep screenshots out of the user's project:

    shots="$(mktemp -d)"; echo "$shots"
    adb -s <serial> exec-out screencap -p > "$shots/<screen>-<posture>.png"
    xcrun simctl io <udid> screenshot "$shots/<screen>-<orientation>.png"

Use the folder it printed in later commands. Capture each screen under review in each posture and
orientation, and look at the images for what the native workflow's runtime section lists.

Report per [report-format.md](report-format.md). Name each device, posture and orientation you ran,
copy its `limits` into "What wasn't checked", and list any posture whose change you couldn't
confirm on screen as not checked.
