# Size classes and devices as Figma variables — design

Status: draft for review · 2026-09-27

## 1. Goal

Designers who work on foldables and large screens in Figma want to use size classes the way the
code does: switch a frame between Compact, Medium and Expanded, or between devices and postures, and
see its margins, gutters, columns, size, safe areas and hinge follow. Dobra already knows all of
these values: the catalog holds the breakpoints and device facts, and an app profile holds the
layout per size class. This design turns them into Figma variables with modes, written by the Dobra
plugin.

### Success criteria

- One plugin run creates, in the open file:
  - size-class collections with one mode per size class;
  - a device collection with one mode per chosen device and posture.
  All values come from the catalog, plus the app profile when one is loaded.
- A designer binds a frame's width, padding, gap or grid to a variable, switches the frame's mode,
  and the frame follows. The same frame works across all size classes with no manual numbers.
- Running the plugin again is safe:
  - it changes nothing when nothing changed;
  - it updates values the catalog or profile changed;
  - it keeps values the designer edited in Figma;
  - it never breaks existing bindings.
- It works on every Figma plan. When a plan's mode limit is hit, the plugin splits collections
  instead of failing.
- Adapt & flag switches the new collections' modes when it adapts a frame.

### Non-goals

- Binding variables to the designer's frames automatically. That would be rewriting designs, which
  the foldable-artboards spec already rules out.
- Writing variables through the Figma REST API. That needs an Enterprise plan; the plugin API
  works on every plan.
- Exporting a design-tokens JSON file (W3C DTCG, Tokens Studio). It is deferred until someone asks,
  but the pure variable description in §4 would make it a small addition.
- Height-based modes. Rules that depend on height reach designers through the device collection
  (§3.2).

## 2. Decisions taken

| Topic | Decision |
|---|---|
| Purpose | Both: responsive layout by size-class mode, and device reference values by device mode |
| Values | Platform defaults in the catalog (Material 3, Apple), overridden by an optional app profile |
| Figma plan | Unknown or mixed: design for the smallest mode limit and split when needed |
| Where | A new **Variables** tab in the Dobra plugin, written with `figma.variables` |
| Device → size class | Values are copied into each device mode. A Figma alias can't pin another collection's mode, so it would follow the frame's size-class mode, not the device's |
| Mode names | They match the size-class ids case-insensitively, so Adapt's existing mode switch finds them (§6) |

## 3. Collections, modes and variables

Variable names use `/`, so Figma groups them into folders. Units are Figma px: dp on Android and pt
on iOS, as the presets already do. Every variable's description names its source, and ends with
"(estimated)" when the value is estimated.

### 3.1 Size classes

There are two collections, one per platform, because Adapt matches a mode by the size-class id alone
and both platforms have a `compact`:

- **Dobra · Size classes · Android**: modes `Compact`, `Medium`, `Expanded`, `Large`, `ExtraLarge`.
  These are the `WindowSizeClass` width ids, with breakpoints at 600, 840, 1200 and 1600.
- **Dobra · Size classes · iOS**: modes `Compact` and `Regular` (UIKit horizontal size class).

The designer picks the platforms: Android, iOS, or both.

| Variable | Type | Scope | Value |
|---|---|---|---|
| `layout/margin` | number | gap (padding and spacing) | page margin |
| `layout/gutter` | number | gap | grid gutter |
| `layout/columns` | number | none (grid count) | grid columns |
| `layout/panes` | number | none | panes the layout uses |
| `breakpoint/min-width` | number | width and height | lower bound of the class |
| `breakpoint/max-width` | number | width and height | upper bound, or 0 when unbounded |

**Defaults.**
- They live in a new catalog block, `layoutDefaults.<platform>.<class>`, with `margin`, `gutter`,
  `columns`, `panes` and a `source` for each value.
- Android comes from Material 3's window-size-class layout guidance (`material3`). iOS uses a new
  `apple-hig` source.
- Anything the guidance doesn't publish (for example iOS columns and gutters) is `estimated`. The
  catalog's rule of never presenting a guess as a fact applies.
- The implementation plan fills in the exact table, with each value checked against its source.

**Profile.**
- When an app profile is loaded, each mode takes its values from the profile's layout rule for that
  class, using the same `ruleMatches` logic the simulator uses, at a representative window of the
  class: the class's minimum width, with regular height.
- The profile's `pageMargin.base` becomes the margin, `grid.columns` and `grid.gutter` the columns and
  gutter, and `panes` the panes.
- A value the profile doesn't set keeps the default.

### 3.2 Devices

**Dobra · Devices** has one mode per target the designer picks. A target is a device, display,
posture and orientation. Modes are named like `Galaxy Z Fold 7 · Inner · Book · Portrait`.

| Variable | Type | Value |
|---|---|---|
| `window/width`, `window/height` | number | the target's window (`resolveTarget`) |
| `safe-area/top`, `/bottom`, `/left`, `/right` | number | safe area or insets |
| `hinge/present`, `hinge/separating` | boolean | first fold that separates or occludes |
| `hinge/x`, `/y`, `/width`, `/height` | number | that fold's rect, or 0 when there is none |
| `layout/margin`, `/gutter`, `/columns`, `/panes` | number | the layout resolved for this exact target: profile rule if one is loaded, else the default for its size class. For `margin` this is the page margin after safe-area `max`/`add` |
| `size-class/width`, `size-class/height` | string | for example `medium` / `compact` |
| `media/pointer`, `/keyboard`, `/viewing-distance` | string | `Environment.media` |

Height-dependent rules, such as a short landscape window, show up here, because each device mode is
resolved for its own window.

## 4. Architecture

```
catalog (+ profile) + choice ──▶ core: variableSpec() ──▶ plugin: applyVariables() ──▶ figma.variables
                                   pure, tested                thin, tested with FakeFigma
```

**Core (`packages/core/src/variables.ts`):**
- `variableSpec(catalog, { profile?, platforms, targets })` returns `VariableSpec`: a list of
  collections. Each has a stable key, a name and modes (key and name). Each variable has a stable key,
  a name, a type, scopes, a description and a value per mode key.
- It is pure: no Figma and no DOM.
- The catalog schema gains `layoutDefaults`, validated so that every Android width class and both iOS
  classes are present with non-negative numbers and a known source.

**Plugin:**
- `packages/figma-plugin/src/variables.ts` holds `applyVariables(api, spec, opts)`, which returns a
  `VariablesSummary`.
- `messages.ts` and `handlers.ts` route a new `variables` command.
- The UI gains a **Variables** tab, and the manifest a Variables menu entry.

### 4.1 The Variables tab

1. **Size classes:** a checkbox (on) and the platforms (Android, iOS, both).
2. **Devices:** a checkbox and a picker grouped by category, reusing the Artboards tab's list, with
   shortcuts:
   - **Required coverage**: one representative target per required cell;
   - **All foldables**;
   - **Clear**.
   It shows the resulting mode count.
3. **App profile:** optional. The designer pastes or picks a profile JSON. It is validated with the
   profile schema; errors show the field path, as `ConfigErrorPage` does. A line says which source is
   in use: "Platform defaults", or "Profile: <name>".
4. **Options:** "Overwrite my edits" (off) and "Remove modes no longer selected" (off).
5. **Create variables** or **Update variables**. The label depends on whether Dobra collections exist.
6. **Summary:**
   - modes and variables per collection;
   - counts of created, updated, kept edits and removed;
   - splits and warnings (§5).

## 5. Updating, mode limits and errors

**Identity.**
- Each collection and variable Dobra writes stores a Dobra key in plugin data, for example `devices`
  or `layout/margin`.
- The collection also stores a map from mode key (a size-class id or a target key) to `modeId`.
- Updates match by these keys, not by names, so a designer can rename things and bindings survive.

**Update rules.**
- New modes and variables are added. Changed catalog or profile values are updated.
- Each value's last written value is stored per variable and mode. When the current value differs,
  the designer edited it: the edit is kept and listed as "kept your edit (Dobra value: N)", unless
  "Overwrite my edits" is on.
- Modes of targets no longer selected are kept and listed as "no longer selected". "Remove modes no
  longer selected" deletes them. They are kept by default because frames using a deleted mode fall
  back to the default mode silently.
- Variables Dobra no longer produces are listed, never deleted automatically.
- A second run with the same input reports 0 created, 0 updated and 0 removed.

**Mode limits.**
- The limit is found by trying.
- When Figma refuses a mode for the limit, the device collection is rebuilt as one collection per
  category: `Dobra · Devices · Foldable book`, and so on.
- A category that still doesn't fit is split into numbered parts (`… · Foldable book 2`).
- A size-class collection that doesn't fit (a plan with very few modes) is split into numbered parts
  the same way.
- The summary explains every split and the limit that caused it.

**Errors.**
- **No edit access:** "You need edit access to create variables", and nothing is written.
- **Name clash:** a collection with Dobra's name that has no Dobra key is left alone. Dobra creates
  `… (Dobra)` next to it and warns.
- **Scope:** only local variables are written. Library variables are read-only.
- **One collection fails:** each collection is applied on its own, so a failure in one is reported
  and the others are still written.
- **Undo:** the run is committed as one undo step.

## 6. Adapt & flag

Adapt already sets, on the adapted frame, every local collection's mode whose name matches the new
size class case-insensitively. With the names in §3.1 it switches the right Android or iOS size-class
collection with no change.

Adapt also switches the device collection. For every Dobra device collection that has a mode for the
adapted target key, it sets that mode on the frame, so the frame's size, safe areas and hinge
variables follow the device it was adapted to.

## 7. Testing

**Core (`variables.test.ts`, catalog schema tests):**
- mode lists per platform;
- the defaults table is complete and validated;
- profile overrides per class, and a missing profile value keeps the default;
- device values equal `resolveTarget` for sampled targets (window, safe area, hinge) and the resolved
  layout from `matchRule`;
- a phone gets `hinge/present` false and zero positions;
- keys are stable across runs;
- an invalid profile is rejected with its path.

**Plugin (`variables.test.ts` with `FakeFigma`):**
- The fake gains:
  - variable collections, modes and variables;
  - values per mode;
  - plugin data;
  - a configurable mode limit that throws Figma's error.
- Tests:
  - the first run creates everything;
  - an unchanged second run changes nothing;
  - a changed value updates;
  - a designer edit is kept, and overwritten only with the option;
  - a deselected target keeps its mode, and is removed only with the option;
  - a limit of 4 splits by category, then into numbered parts;
  - a name clash gets "(Dobra)";
  - a read-only file writes nothing;
  - one failing collection doesn't stop the rest;
  - Adapt sets the device mode.

**UI:** the tab rendered in a browser with simulated messages, as the other tabs are.

**By hand, once per release, in Figma desktop:**
1. Create the collections.
2. Bind a frame's padding to `layout/margin` and switch modes.
3. Run again and confirm nothing changes.
4. Edit one value, run again, and confirm the edit is kept.
5. Adapt a frame and confirm its device mode.

## 8. Delivery

- One issue: labels `enhancement`, `area:plugin` and `area:core`.
- One implementation plan.
- Two PRs, microcommits, nothing merged directly to `main`:
  1. **Core:** `layoutDefaults` in the catalog, and `variableSpec`.
  2. **Plugin:** `applyVariables`, the Variables tab, and the Adapt device-mode switch. Stacked on
     PR 1.

## 9. Risks

1. **Mode limits per plan.** They aren't known in advance and differ by plan. Splitting by trying
   handles them, but many small collections are harder to browse. The summary names the limit it hit.
2. **Default values.** Material 3 publishes margins and pane counts per window size class; columns,
   gutters and most iOS values are less explicit. Those stay marked estimated, and teams are expected
   to load their own profile.
3. **Grid binding.** Binding `layout/columns` and `layout/gutter` to layout grids depends on Figma's
   support for variables on layout guides. If binding them doesn't work, the variables still document
   the values, and padding, gap and size bindings are unaffected. The implementation checks this first.
4. **Figma's error text.** Detecting the mode limit relies on the error Figma throws. The code treats
   any `addMode` failure after at least one mode as a limit, and reports Figma's message verbatim.
