# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository contains

Dobra is a set of tools for designing foldable and dual-screen UIs on iOS and Android. It is an npm
workspaces monorepo; see `README.md` for the parts, the layout and the commands.

- `packages/core` (`@dobra/core`): the device catalog, targets, the layout engine, the geometry rules, frame matching, coverage, reports and resize transitions. Pure TypeScript, no DOM, no React.
- `packages/figma-plugin` (`@dobra/figma-plugin`): artboard presets, tagging, coverage, the checker and Adapt & flag. Tags live in the `dobra` shared plugin data namespace.
- `packages/cli` (`@dobra/cli`): `dobra check site <url>`, website checks with fold emulation.
- `apps/simulator` (`@dobra/simulator`): the Dobra simulator (Vite, React, Tailwind v4).
- `apps/report` (`@dobra/report`): the web report that opens report JSON.
- `docs`: the Android brief (`docs/android-extension-brief.md`), specs and plans.

Commands: `npm test`, `npm run typecheck`, `npm run dev`, `npm run build`, `npm run build:single`,
`npm run dev:report`, `npm run build:report`, `npm run build:cli`, then `npm run dobra -- check site <url>`.

"Dobra" is the brand. "hinge" in code and docs means the physical part of a device (hinge overlays, `hinge-content`, catalog `hinge` fields); keep it.

## Architecture

- **Config-driven.** The catalog (`packages/core/src/catalog/catalog.json`) and the app profile (`packages/core/src/profiles/sample.profile.json`) drive what the tools show: devices, displays, postures, orientations, size classes, safe areas, hardware, reserved regions, rules and screens.
- **Provenance is first-class.** Every value carries a `source` (for example `figma-ui`, `figma-tokens`, `apple-device`, `estimated`), and the UI shows estimated values as such.
- **Simulator surfaces:** device/posture/orientation pickers, free resize, screen picker, overlays (safe areas, margins, grid, reserved, fold), Present (Alert/Sheet), zoom, light/dark, LTR/RTL, an inspector, the collision checker, the parity view and report export.

## Rules from the brief that constrain all work

- Keep the architecture config-driven. Any value hardcoded in a component that varies by device, platform or breakpoint is a bug.
- Use one renderer with two platform profiles (`platform: "ios" | "android"`). Don't fork the engine. Units are per platform (`pt`, or `dp`/`sp`), so an Android device must never show "pt".
- Android size classes use the `WindowSizeClass` breakpoints (width 600/840/1200, height 480/900). Don't force them into compact/regular.
- Folds are a **list**, since tri-folds have two hinges. Split decisions follow `isSeparating`, not the fold state.
- Every Android number needs a `source` (device spec, Figma token, `androidx.window` docs, or `estimated`). Never present guesses as facts.
- iOS and Android are peer clients of the same spec. Don't describe one as mirroring the other in code or comments.
