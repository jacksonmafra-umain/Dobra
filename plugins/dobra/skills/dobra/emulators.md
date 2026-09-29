# Create emulators and simulators

Dobra's emulator command is being designed. Its interface below is provisional: trust
`dobra emulator --help` over this file.

## 1. Check it exists

    dobra emulator --help

- **It fails** (`Unknown command: emulator`, exit 2): say "Emulator creation isn't available in
  this Dobra version yet. `dobra update` gets the latest." Then use the "Runtime check without
  emulators" section of [native-android.md](native-android.md) or [native-ios.md](native-ios.md).
- **It works:** follow its help, using the steps below as a guide.

Never write AVD `config.ini` files, `avdmanager` or `simctl` calls by hand to stand in for it: the
command builds devices from the catalog so their sizes, hinges and postures match what the rules
check.

## 2. Create the devices

Provisional shape: `dobra emulator create <device-id>` or `<target-key>`, with JSON output that
names each device it created.

- Pick devices by catalog ID (see the lists in the native workflow files).
- **Android** devices get the emulator's hinge and posture configuration, so folds work.
- **iOS** can only use device types Apple ships: no folds, no custom sizes, and no simulator for
  hypothetical catalog devices such as `iphone-duo`. Say so when the user asks for one.

## 3. Use them

Install and launch the user's app with their own build tools, then walk each posture and
orientation the command offers. What to look for is in the native workflow's runtime section.
Report per [report-format.md](report-format.md), naming each device and posture you actually ran.
