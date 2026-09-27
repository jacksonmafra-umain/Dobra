# Android adaptive model: devices, media facts, scenes, Grid and FlexBox — design

Date: 2026-09-25
Status: approved in conversation, pending written-spec review
Aligned with: `2026-09-25-foldable-artboards-design.md` (Hinge), branch `docs/foldable-artboards-spec`

## 1. Goal

Close the gaps in the simulator's Android model that the Android adaptive guides expose, without
forking the engine and without changing how existing iOS rules resolve:

1. More devices, and more facts per device (media-query facts, cover-screen policy).
2. Navigation 3–style **scenes** that decide single versus multi-pane, split at the hinge.
3. **Grid** and **FlexBox** as layout forms in the rules, next to today's `perRow` form.

References: developer.android.com — design/ui, adaptive-apps/guides/mediaquery, guide/navigation/
navigation-3, adaptive-apps/guides/grid, adaptive-apps/guides/flexbox; PCMag "The Best Folding Phones
for 2026". The PhoneArena roundup was not readable (bot check) and is not used.

### Success criteria

- New devices are selectable, and their media facts appear in the inspector, the URL and the matrix.
- Rules can match on media facts; existing rules resolve exactly as before.
- A screen that declares `list-detail` splits at the hinge in book and tabletop, and falls back to one
  pane with a stated reason when the minimum widths do not fit.
- Grid and FlexBox entries resolve to the same item widths in Node tests and in the rendered page.
- Three observed failures reproduce as fixtures and raise Hinge findings with the expected rule ids.
- Every new number has a `source`; guesses are `estimated: true`.

### Non-goals

- Rendering both displays at once for dual-screen or rear-display modes (they stay documented).
- A full CSS Grid implementation (named lines, dense packing, implicit rows).
- Changing iOS rules to the new forms.

## 2. Decisions taken

| Topic | Decision |
|---|---|
| Approach | Additive: the existing rule model stays; `grid`, `flex` and `scenes` are optional additions |
| Vocabulary | Primitives are platform-neutral and cite Compose on Android and HIG / SwiftUI on iOS |
| Device categories | Hinge `category` values: `phone`, `foldable-book`, `foldable-flip`, `dual-screen`, `multi-fold`, `tablet`, plus `desktop` (agreed with Hinge). Replaces the current `class` field |
| Device list and fields | Hinge's Catalog slice (2) owns the new devices, the cover-screen `policy`/`continuity` fields and the media-fact schema fields (§3). This branch contributes the entries and consumes the fields; it does not add them to the schema |
| Findings | Hinge `Finding` shape and rule ids; no parallel check vocabulary |
| Target key | Hinge key with the derived orientation, plus optional `rotation` for Android |
| Branding | The repo is de-branded by Hinge slice 0 (history rewrite). This work continues on the rewritten branch; nothing here names the former brand |
| Location | New modules in `src/engine`; Hinge slice 1 moves them to `packages/core` |

## 3. Devices and device facts (delivered by Hinge's Catalog slice)

Everything in this section lands in the Catalog slice. This branch reads the fields once that slice
merges: the inspector, URL state, rule matching and checks in §4–§6.

### 3.1 New devices (handed to the Catalog slice)

| Device | Category | Values | Source |
|---|---|---|---|
| Pixel 10 Pro Fold | foldable-book | inner 2152×2076 px, 8.0"; density assumed 2.4375 → 851×883 dp; outer 443×995 dp; vertical crease, width 0, occlusion NONE | PCMag (px), estimated (density, outer) |
| Motorola Razr (2026) | foldable-flip | inner 2640×1080 px, 6.9"; density assumed 2.75 → 393×960 dp; cover 3.6", size unknown | PCMag (px), estimated |
| Motorola Razr Ultra (2026) | foldable-flip | inner 2992×1224 px, 7.0"; density assumed 3.0 → 408×997 dp; cover 4.0", size unknown | PCMag (px), estimated |
| Oppo Find N6 | foldable-book | named without specs; every value estimated with a note | estimated |

Razr+ is the older Razr Ultra line; Hinge adds at most one older Razr+ if its size differs.

### 3.2 Cover-screen policy

`coverScreen` on a display changes from `{ userGranted, note }` to:

```json
{ "policy": "user-granted" | "any-app" | "allow-list", "continuity": true | false, "note": "…" }
```

- Samsung Flip: `user-granted` (Settings › Labs, or Good Lock MultiStar), `continuity: false` by default.
- Motorola Razr: `any-app` with a compatibility warning, `continuity: true`.
- No manifest flag puts an app on a cover screen; the inspector keeps saying so.

### 3.3 Media-query facts (`UiMediaScope`)

Per device, with UI overrides:

| Field | Values | Phone default | Desktop default |
|---|---|---|---|
| `pointerPrecision` | `Fine`, `Coarse`, `Blunt`, `None` | `Coarse` | `Fine` |
| `keyboardKind` | `Physical`, `Virtual`, `None` | `Virtual` | `Physical` |
| `viewingDistance` | `Near`, `Medium`, `Far` | `Near` | `Medium` |
| `hasCamera` | boolean | `true` | device value |
| `hasMicrophone` | boolean | `true` | device value |

`windowPosture` (`Flat`, `Book`, `Tabletop`) is derived from the separating folds, not stored.
Overrides cover a tablet with a mouse or a phone driving DeX. The facts live in `Environment.media`,
the URL (`ptr`, `kbd`, `dist`, `cam`, `mic`) and the matrix report. Rules may match on them, for
example `"match": { "pointerPrecision": ["Fine"] }`; the schema rejects unknown values.

## 4. Scenes

A top-level `scenes` block names pane strategies after Navigation 3's `SceneStrategy`:

| Scene | Parameters | Panes |
|---|---|---|
| `single` | — | main |
| `list-detail` | `listFraction` (default 0.4), `listMinWidth`, `detailMinWidth` | list, detail |
| `two-pane` | `ratio` (default 0.5), `paneMinWidth` | primary, secondary |
| `supporting-pane` | `supportingWidth`, `mainMinWidth` | main, supporting |

Each screen declares the scene it wants (`"scene": "list-detail"`). A layout rule may force
`"scene": "single"`.

Resolution, first match wins:

1. The rule forces `single` → one pane.
2. A fold separates the window → split at the hinge bounds: side by side for `Book`, stacked for
   `Tabletop` (content on top, controls at the bottom, Material 3 tabletop guidance).
3. The content width holds every pane's minimum → split by the scene's parameters.
4. Otherwise fall back to `single` and show the top entry of the back stack (detail over list, as
   Navigation 3 does), recording the reason: "list-detail → single: 320 + 360 dp minimum does not fit
   352 dp".

Output: `layout.scene = { strategy, fellBack, reason, panes: [{ role, rect }] }`, replacing `panes`
and `paneRects`. With three separating regions, `list-detail` fills list and detail and leaves the
third region empty and marked estimated; Navigation 3 has no three-pane strategy.

iOS uses the same vocabulary; the inspector maps it to `NavigationSplitView` columns (HIG) so the
parity view compares like with like. "What changed" reports scene switches.

## 5. Grid and FlexBox

A component entry in a rule takes one of three forms; the component registry lists which forms each
component accepts.

1. **perRow** (unchanged): `perRow`, `minItemWidth`, `maxItemWidth`.
2. **grid** — Compose `Grid`; SwiftUI `Grid` / `LazyVGrid(.adaptive)`:
   ```json
   { "grid": { "columns": [{ "adaptive": { "min": 320, "max": 500 } }], "gap": 24 } }
   { "grid": { "columns": [{ "fr": 3 }, { "fr": 2 }], "areas": { "image": [0], "actions": [1] } } }
   ```
   Tracks: `{ "fixed": n }`, `{ "fr": n }`, `{ "adaptive": { "min", "max" } }` (repeats as many as fit).
   `areas` map named items to track indices; spans must stay inside the track count.
3. **flex** — Compose `FlexBox`; SwiftUI stacks / `ViewThatFits`:
   ```json
   { "flex": { "wrap": true, "basis": 96, "grow": 1, "shrink": 1, "gap": 12, "justify": "space-between" } }
   ```
   Resolved with the guide's five steps: base size from basis, order, lines (wrap and gap),
   grow/shrink and justify on the main axis, align on the cross axis.

Every form resolves in the engine to `{ items: [{ width }], lines }`. The renderer maps the same
values to CSS grid or flexbox, and the width checks read only the engine output, so Node tests and
the headless matrix agree. Existing rules do not change; the new sample screens use `grid` for the
product list and `flex` for shortcuts.

## 6. Checks

The simulator emits Hinge `Finding`s (`ruleId`, `severity`, `target`, `nodeId`, `rect`, `message`,
`source`, `estimated`). This work feeds:

| Rule id | Fed by |
|---|---|
| `landscape-not-wide` | scene and hero variants below the 600 dp breakpoint |
| `min-legible-width` | Grid/FlexBox/perRow resolved widths against `minLegibleWidth` |
| `pane-split` | scene panes compared with the hinge bounds |
| `tabletop-controls` | scene roles in tabletop posture |
| `touch-target` | `pointerPrecision` and platform minimums (48 dp / 44 pt) |
| `chrome-overlap` | floating navigation bar against short windows (threshold estimated) |
| `hinge-content` | existing collision checker, via Hinge's `findCollisions` once extracted |

## 7. Error handling

zod validation with the offending path, as today: empty track lists, spans outside the track count,
unknown scene or pane roles, component forms the registry does not allow, unknown media-fact values,
and cover-screen policies outside the enum.

## 8. Testing

- Table tests per scene: fallback with reason, book and tabletop split at the hinge, tri-fold with an
  empty third region, rule-forced `single`.
- Grid: adaptive track counts at several widths, `fr` sums, spans. FlexBox: basis/grow/shrink,
  wrapping line breaks, justify.
- Media facts: defaults per category, overrides, rule matching.
- Fixtures for observed failures #1 (side-by-side on the 352 dp Flip cover), #2 (141 dp card) and
  #5 (text at 40% pane width) asserting Hinge rule ids, severity and source.

## 9. Delivery

Branch `feat/android-window-states-clean`, rebased onto `chore/remove-brand` (Hinge slice 0). It gets its
own issue and a PR against that base; the pre-rewrite local branch is never pushed.
Microcommits in this order, each buildable:

1. Finish window states (split, freeform, pop-up, picture-in-picture, display size, font scale,
   keyboard, portrait-only letterboxing, targetSdk 36 note).
2. Scenes.
3. Grid and FlexBox forms.
4. Media-fact consumers: inspector, URL (`ptr`, `kbd`, `dist`, `cam`, `mic`), overrides and rule
   matching. Starts after Hinge's Catalog slice adds the fields.
5. Checks emitting Hinge findings.

New devices, cover policy and media-fact schema fields land through Hinge's Catalog slice.

## 10. Risks

1. Compose `Grid`, `FlexBox` and `mediaQuery` are experimental; names may change. The config uses our
   own primitive names and cites the Compose APIs, so a rename touches docs, not data.
2. Most new device numbers are estimated from pixels and an assumed density; they stay flagged
   until checked with `adb shell wm size` / `wm density`.
3. Ordering with Hinge slices 0–2: step 4 waits for the Catalog slice, and this branch must not
   duplicate its schema fields.
