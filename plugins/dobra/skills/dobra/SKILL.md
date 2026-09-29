---
name: dobra
description: Use for any request to check, test, audit or review a website URL, or an Android or iOS app, on foldable, flip, dual-screen, tri-fold, tablet or resizable-window devices, and to create foldable emulators or simulators. Use it instead of opening a browser, guessing viewport sizes or reviewing adaptive layout from memory - it runs the Dobra CLI (a real device catalog, hinge emulation, report JSON) and cites the Dobra guide for every fix. Covers foldables, folds, hinges, postures, dual screens, tablets, window size classes (WindowSizeClass, FoldingFeature), iOS size classes, NavigationSplitView, and adaptive or responsive layout.
---

# Dobra

Dobra checks layouts on foldables, dual-screen devices, tablets and resizable windows. This skill
drives the installed `dobra` command and cites the Dobra guide for every fix.

## Find Dobra

Try these in order and use the first that works. Each gives a command to run and the Dobra folder
(`DOBRA_DIR`), which holds the catalog and the guide.

1. **Installed** (`command -v dobra`, or `~/.dobra/bin/dobra` when it isn't on the PATH yet): the
   command is `dobra` (or that full path). Read the folder from it:

       wrapper="$(command -v dobra || echo ~/.dobra/bin/dobra)"
       eval "$(grep '^export DOBRA_DIR=' "$wrapper")"; echo "$DOBRA_DIR"

2. **A Dobra checkout** (the current folder's `package.json` has `"name": "dobra"`): the folder is
   the checkout root, and the command is `node packages/cli/dist/dobra.mjs`, after
   `npm run build:cli` and `npx playwright install chromium`. Don't use `npm run dobra --`: npm's
   banner lands on stdout and breaks `--json` output.

Shell variables don't survive between commands, so use the folder path it printed literally from
then on. Below, `<DOBRA_DIR>` means that path.

If neither works, Dobra isn't installed. Tell the user, show the installer, and **ask before running
it**: it downloads Node, the Dobra code (into `~/Dobra`) and Chromium.

    bash -c "$(curl -fsSL https://raw.githubusercontent.com/jacksonmafra-umain/Dobra/main/install.sh)"

After installing, `~/.dobra/bin/dobra` works in the current shell; a new Terminal has `dobra`.

## Find the guide

The guide is `<DOBRA_DIR>/docs/guide`. If it's missing, use the published guide:
`02-android.md#foldables-and-postures` is
`https://dobra-five.vercel.app/guide/android/#foldables-and-postures` (drop the number prefix and
`.md`). Read the section you cite before citing it.

The catalog of devices, displays and postures is
`<DOBRA_DIR>/packages/core/src/catalog/catalog.json`.

## Workflows

Read the file for the request before doing anything. A request can need more than one.

| The user wants to | Read |
|---|---|
| Check whether a URL works on foldables, dual screens or tablets | [site-check.md](site-check.md) |
| Review or test an Android app (Compose or Views) for foldables, tablets and window sizes | [native-android.md](native-android.md) |
| Review or test an iOS app (SwiftUI or UIKit) for size classes, iPad windows and Dynamic Type | [native-ios.md](native-ios.md) |
| Create foldable emulators or simulators | [emulators.md](emulators.md) |

Before writing any report, read [report-format.md](report-format.md).
