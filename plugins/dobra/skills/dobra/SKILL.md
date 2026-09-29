---
name: dobra
description: Use when checking whether a website works on foldable, flip, dual-screen, tri-fold or tablet devices; when reviewing or testing an Android (Jetpack Compose or Views) or iOS (SwiftUI or UIKit) app's adaptive layout (window size classes, WindowSizeClass, size classes, folding features, hinge, postures, split panes); or when creating foldable emulators or simulators. Runs the Dobra CLI and cites the Dobra guide.
---

# Dobra

Dobra checks layouts on foldables, dual-screen devices, tablets and resizable windows. This skill
drives the installed `dobra` command and cites the Dobra guide for every fix.

## Find Dobra

Try these in order and use the first that works:

1. `command -v dobra`: use `dobra`.
2. `test -x ~/.dobra/bin/dobra`: use `~/.dobra/bin/dobra`.
3. The current folder is a Dobra checkout (its `package.json` has `"name": "dobra"`): use
   `npm run dobra --` after `npm run build:cli` and `npx playwright install chromium`.

If none works, Dobra isn't installed. Tell the user, show the installer, and **ask before running
it**: it downloads Node, the Dobra code (into `~/Dobra`) and Chromium.

    bash -c "$(curl -fsSL https://raw.githubusercontent.com/jacksonmafra-umain/Dobra/main/install.sh)"

After installing, `~/.dobra/bin/dobra` works in the current shell; a new Terminal has `dobra`.

## Find the guide

The guide is in `${DOBRA_DIR:-$HOME/Dobra}/docs/guide`, or `docs/guide` in a checkout. If neither
exists, use the published guide: `02-android.md#foldables-and-postures` is
`https://dobra-five.vercel.app/guide/android/#foldables-and-postures` (drop the number prefix and
`.md`). Read the section you cite before citing it.

The catalog of devices, displays and postures is
`${DOBRA_DIR:-$HOME/Dobra}/packages/core/src/catalog/catalog.json`.

## Workflows

Read the file for the request before doing anything. A request can need more than one.

| The user wants to | Read |
|---|---|
| Check whether a URL works on foldables, dual screens or tablets | [site-check.md](site-check.md) |
| Review or test an Android app (Compose or Views) for foldables, tablets and window sizes | [native-android.md](native-android.md) |
| Review or test an iOS app (SwiftUI or UIKit) for size classes, iPad windows and Dynamic Type | [native-ios.md](native-ios.md) |

Before writing any report, read [report-format.md](report-format.md).
