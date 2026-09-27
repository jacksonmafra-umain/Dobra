# Hinge

Tools for designing foldable and dual-screen UIs. Hinge covers phones, book and flip foldables,
dual-screen devices, multi-folds, tablets and desktop, on iOS and Android.

## What's here

| Part | What it does | State |
| --- | --- | --- |
| Simulator (`apps/simulator`) | Renders devices, postures and window states, plus scenes and Grid/FlexBox layouts. Runs collision and rule checks, shows and overrides media facts, and compares iOS and Android side by side | Merged |
| Core (`packages/core`) | Holds the device catalog, targets, the layout engine, the geometry rules, frame matching and coverage. Reports are in review with the web report | Merged |
| Figma plugin (`packages/figma-plugin`) | Artboard presets with hinge overlays, Tag frames, coverage, a checker, and Adapt & flag | Merged |
| Web report (`apps/report`) | Shows a Figma file's coverage and findings | In review: #22 |
| CLI (`packages/cli`) | Checks websites with fold emulation | In review: #34 |

## Layout

This is an npm workspaces monorepo:

- `packages/core`: `@hinge/core`, in pure TypeScript with no DOM and no React. It holds the catalog
  (`src/catalog/catalog.json`), the sample profile (`src/profiles/sample.profile.json`), the engine
  and the checks.
- `packages/figma-plugin`: the Figma plugin. See its [README](packages/figma-plugin/README.md) for how to build and load it.
- `apps/simulator`: `@hinge/simulator`, built with Vite, React and Tailwind.
- `examples/sites`: static pages that reproduce foldable failures, used by the website checks.
- `docs`: the Android brief, design specs and implementation plans.

## Quick start

```sh
npm install
npm run dev          # simulator dev server
npm test             # tests in every workspace
npm run typecheck    # type-check every workspace
npm run build        # production build of the simulator
npm run build:single # the simulator as one self-contained HTML file
npm run preview      # serve the production build
```

## Design docs

Design specs are in [`docs/superpowers/specs`](docs/superpowers/specs), and implementation plans are in
[`docs/superpowers/plans`](docs/superpowers/plans).
