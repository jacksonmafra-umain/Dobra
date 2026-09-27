# Hinge

Tools for designing foldable and dual-screen UIs. Hinge covers phones, book and flip foldables,
dual-screen devices, multi-folds, tablets and desktop, on iOS and Android.

## What's here

| Part | What it does | State |
| --- | --- | --- |
| Simulator (`apps/simulator`) | Renders devices, postures and window states, plus scenes and Grid/FlexBox layouts, and runs collision and rule checks | Merged |
| Core (`packages/core`) | Holds the device catalog, the layout engine and the rule checks. Coverage and reports are in review with the plugin and web report | Merged |
| Figma plugin (`packages/figma-plugin`) | Artboard presets with hinge overlays, Tag frames, coverage, a checker, and Adapt & flag | In review: #18, #20 |
| Web report (`apps/report`) | Shows a Figma file's coverage and findings | In review: #22 |
| CLI (`packages/cli`) | Checks websites with fold emulation | Planned |

## Layout

This is an npm workspaces monorepo:

- `packages/core`: `@hinge/core`, in pure TypeScript with no DOM and no React. It holds the catalog
  (`src/catalog/catalog.json`), the sample profile (`src/profiles/sample.profile.json`), the engine
  and the checks.
- `apps/simulator`: `@hinge/simulator`, built with Vite, React and Tailwind.
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
