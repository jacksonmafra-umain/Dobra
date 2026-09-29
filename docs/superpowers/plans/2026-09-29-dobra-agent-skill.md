# Dobra agent skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `dobra` Claude Code skill that checks websites on foldables, reviews native Android
and iOS apps against the Dobra guide, and (later) creates emulators, installable as a plugin and by
`install.sh`.

**Architecture:** The skill is Markdown: a short `SKILL.md` router plus one reference file per
workflow and a shared output-rules file, under `plugins/dobra/skills/dobra/`. It calls the installed
`dobra` CLI and cites `docs/guide` sections. A Vitest drift test in `packages/cli` keeps the cited
guide anchors, the CLI options and the internal links honest; a second test covers the installer's
new copy step.

**Tech Stack:** Markdown skills, Claude Code plugin manifests, Bash (`install.sh`), Vitest 4,
Node 22.12+.

**Spec:** `docs/superpowers/specs/2026-09-29-dobra-agent-skill-design.md`

## Global Constraints

- Units per platform: dp/sp on Android, pt on iOS, CSS px on the web. An Android device never shows "pt".
- Every number keeps its `source`; estimated values are labelled estimated.
- "hinge" means the physical part of a device; keep the word.
- iOS and Android are peer clients of one spec; never describe one as mirroring the other.
- Android size classes: width 600/840/1200 dp, height 480/900 dp (`WindowSizeClass`); never compact/regular.
- Folds are a list; split decisions follow `isSeparating`, not the fold state.
- The skill never depends on `dobra emulator` existing; it probes at run time.
- The skill never writes AVD `config.ini` files or `simctl` calls by hand.
- The skill never edits the user's code unless asked, and never installs Dobra without a yes.
- Guide citations in skill files use the form `` `02-android.md#foldables-and-postures` `` (backticks, not Markdown links). Published form: `https://dobra-five.vercel.app/guide/<file without NN- and .md>/#<anchor>`.
- Everything in English. Commits: microcommits, English, no assistant mention, no `Co-Authored-By` or "Generated with" lines. PR: labelled, `Closes #N`, no assistant mention.
- Never push to or merge into `main`.

## Review Focus

1. **A URL whose server isn't running** (`http://localhost:3000` with nothing listening): the skill must say the server isn't answering, not report findings or "could not load" as a site defect. Pinned by the reachability step in `site-check.md` (Task 3) and manual scenario M2 (Task 9).
2. **Every target unloaded:** a report with zero findings and all targets in `unloaded` must never read as "pass". Pinned by the verdict table in `report-format.md` (Task 2) and scenario M3.
3. **Android numbers shown in pt:** a drift assertion in Task 2's test fails if `native-android.md` contains a number followed by `pt`.
4. **Running inside the user's repo leaves files behind:** the site check writes to a scratch folder, never the project root. Pinned by the `--out` path rule in `site-check.md` and scenario M1 (check `git status` is clean afterwards).
5. **An existing `~/.claude/skills/dobra` the user made themselves:** the installer must leave it alone. Pinned by the "foreign folder" test in Task 7.

---

## File Structure

```
.claude-plugin/marketplace.json                  # Task 6: lists the plugin
plugins/dobra/.claude-plugin/plugin.json         # Task 6
plugins/dobra/skills/dobra/SKILL.md              # Task 2 (router), rows added in Tasks 3-5
plugins/dobra/skills/dobra/report-format.md      # Task 2: output rules
plugins/dobra/skills/dobra/site-check.md         # Task 3
plugins/dobra/skills/dobra/native-android.md     # Task 4
plugins/dobra/skills/dobra/native-ios.md         # Task 4
plugins/dobra/skills/dobra/emulators.md          # Task 5
packages/cli/src/skill.test.ts                   # Task 2: drift test
packages/cli/src/installSkill.test.ts            # Task 7: installer step test
install.sh                                       # Task 7: install_skill step
README.md, CLAUDE.md                             # Task 8
```

Each commit leaves `npm test` green: the drift test only checks files that exist, and `SKILL.md`
only links workflow files already written.

---

### Task 1: Issue, label and branch

**Files:** none.

- [ ] **Step 1: Create the label**

```bash
gh label create "area:skill" --color "bfd4f2" --description "Agent skills and Claude Code plugin" --repo jacksonmafra-umain/Dobra
```

- [ ] **Step 2: Open the issue**

```bash
gh issue create --repo jacksonmafra-umain/Dobra \
  --title "Add a dobra agent skill for foldable checks" \
  --label enhancement --label area:docs --label area:skill \
  --body "$(cat <<'EOF'
A Claude Code skill, `dobra`, that any agent in any project can use to:

1. Check a URL on foldable and dual-screen devices with `dobra check site` and report the findings with fixes from the guide.
2. Review a native Android (Compose/Views) or iOS (SwiftUI/UIKit) app against `docs/guide`, and give a runtime test matrix.
3. Create emulators and simulators through the emulator CLI once it ships (it is being designed separately); until then the skill says it isn't available and falls back to the manual matrix.

It ships as a Claude Code plugin from this repo and `install.sh` copies it to `~/.claude/skills/dobra`.

Design: `docs/superpowers/specs/2026-09-29-dobra-agent-skill-design.md`.
Plan: `docs/superpowers/plans/2026-09-29-dobra-agent-skill.md`.
EOF
)"
```

Note the issue number as `N` for the PR in Task 9.

- [ ] **Step 3: Confirm the branch**

Run: `git branch --show-current`
Expected: `feat/dobra-agent-skill` (the spec commit is already on it). If not, `git checkout feat/dobra-agent-skill`.

---

### Task 2: Drift test, router and output rules

**Files:**
- Create: `packages/cli/src/skill.test.ts`
- Create: `plugins/dobra/skills/dobra/SKILL.md`
- Create: `plugins/dobra/skills/dobra/report-format.md`

**Interfaces:**
- Consumes: `USAGE` from `packages/cli/src/args.ts` (a string listing every `--option`).
- Produces: the skill folder at `plugins/dobra/skills/dobra/`; the `SKILL.md` "Workflows" table that Tasks 3-5 add rows to; the citation form `` `NN-name.md#anchor` ``.

- [ ] **Step 1: Write the failing test**

Create `packages/cli/src/skill.test.ts`:

```ts
// Keeps the dobra agent skill honest: the guide sections it cites exist, the CLI options it tells
// agents to pass are real, its links between files resolve, and Android text never shows pt.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { USAGE } from './args';

const ROOT = join(import.meta.dirname, '../../..');
const SKILL = join(ROOT, 'plugins/dobra/skills/dobra');
const GUIDE = join(ROOT, 'docs/guide');

const files = () => readdirSync(SKILL).filter((f) => f.endsWith('.md'));
const read = (f: string) => readFileSync(join(SKILL, f), 'utf8');

/** GitHub-style heading anchors, as the site renders them, for ASCII headings. */
function anchors(markdown: string): Set<string> {
  const out = new Set<string>();
  for (const line of markdown.split('\n')) {
    const m = /^#{1,6} (.+)$/.exec(line);
    if (!m) continue;
    out.add(m[1].trim().toLowerCase().replace(/[^a-z0-9 _-]/g, '').replace(/ /g, '-'));
  }
  return out;
}

describe('dobra skill', () => {
  it('has a SKILL.md named dobra with a description', () => {
    const text = read('SKILL.md');
    const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
    expect(front).not.toBeNull();
    expect(front![1]).toMatch(/^name: dobra$/m);
    const description = /^description: (.+)$/m.exec(front![1]);
    expect(description).not.toBeNull();
    expect(description![1].length).toBeLessThanOrEqual(1024);
  });

  it('cites only guide sections that exist', () => {
    const missing: string[] = [];
    for (const f of files()) {
      for (const [, file, anchor] of read(f).matchAll(/\b(\d{2}-[a-z-]+\.md)#([a-z0-9-]+)/g)) {
        const path = join(GUIDE, file);
        if (!existsSync(path) || !anchors(readFileSync(path, 'utf8')).has(anchor)) missing.push(`${f}: ${file}#${anchor}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('passes only options dobra check site accepts', () => {
    const unknown: string[] = [];
    for (const f of files()) {
      for (const line of read(f).split('\n')) {
        if (!line.includes('dobra check site')) continue;
        for (const [option] of line.matchAll(/--[a-z][a-z-]*/g)) {
          if (option !== '--help' && !USAGE.includes(option)) unknown.push(`${f}: ${option}`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it('links only files in the skill', () => {
    const broken: string[] = [];
    for (const f of files()) {
      for (const [, target] of read(f).matchAll(/\]\(([a-z-]+\.md)\)/g)) {
        if (!existsSync(join(SKILL, target))) broken.push(`${f} -> ${target}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('never gives Android sizes in pt', () => {
    if (!existsSync(join(SKILL, 'native-android.md'))) return;
    expect(read('native-android.md')).not.toMatch(/\d\s?pt\b/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @dobra/cli -- src/skill.test.ts`
Expected: FAIL with `ENOENT` (the skill folder doesn't exist yet).

- [ ] **Step 3: Write `SKILL.md`**

Create `plugins/dobra/skills/dobra/SKILL.md`:

```markdown
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

Before writing any report, read [report-format.md](report-format.md).
```

- [ ] **Step 4: Write `report-format.md`**

Create `plugins/dobra/skills/dobra/report-format.md`:

```markdown
# Report format

Every Dobra workflow ends with a report in this shape. Write it in the user's language; keep code,
rule IDs, commands, file paths and target keys verbatim.

## Verdict first

One line, from this table:

| Situation | Verdict |
|---|---|
| No findings and nothing unloaded | Pass |
| Only `info` or `warn` findings | Pass with warnings (counts) |
| Any `error` finding | Fails (counts by severity) |
| Every target unloaded, or the app wasn't run | Not checked: say what stopped it. Never "pass" |
| Some targets unloaded | The verdict for the rest, plus "N targets could not load" |

## Findings

Group by rule, then by target. For each finding give:

- the severity (`error`, `warn`, `info`);
- what's wrong, in one sentence;
- where: the target in words (for example "Galaxy Z Fold 7, inner display, book posture,
  landscape") and the element or `file:line`;
- the fix: a short code change in the project's language and style;
- the guide section, as a link to the local file or the published page.

List the most severe first. Merge findings that are the same problem on several targets into one
entry that lists the targets.

## Numbers and words

- Units follow the platform: dp and sp on Android, pt on iOS, CSS px on the web. An Android device
  never shows pt.
- Keep each number's source. A value from the catalog or a finding with `estimated: true` is
  written as estimated, for example "about 48 dp (estimated)".
- "hinge" means the physical part of the device.
- iOS and Android are peers: describe each on its own terms, never one as mirroring the other.
- Android size classes are the `WindowSizeClass` breakpoints (width 600, 840, 1200 dp; height 480,
  900 dp), never "compact/regular". iOS size classes are compact and regular.

## What wasn't checked

End with what the run couldn't prove: targets that didn't load, emulation limits, screens not
reviewed, and anything not run on a device or emulator. Never say something was verified if it
wasn't run.

## Next steps

Offer at most three: re-run after fixes, check more targets, apply the fixes (only when asked).
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -w @dobra/cli -- src/skill.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/skill.test.ts plugins/dobra/skills/dobra/SKILL.md plugins/dobra/skills/dobra/report-format.md
git commit -m "Add the dobra agent skill's router, report format and drift test"
```

---

### Task 3: Site-check workflow

**Files:**
- Create: `plugins/dobra/skills/dobra/site-check.md`
- Modify: `plugins/dobra/skills/dobra/SKILL.md` (Workflows table)

**Interfaces:**
- Consumes: the Workflows table and `report-format.md` from Task 2; the report JSON shape in `packages/core/src/report.ts` (`frames[].findings[]` with `ruleId`, `severity`, `target`, `nodeId`, `message`, `source`, `estimated`; `unloaded[]`; `coverage`; `notes`).
- Produces: nothing other tasks call.

- [ ] **Step 1: Write `site-check.md`**

Create `plugins/dobra/skills/dobra/site-check.md`:

````markdown
# Check a website on foldables

Runs `dobra check site`, which opens the page in Chromium at each device target, emulates the
hinge where the device has one, checks the foldable rules, and checks whether the page lays itself
out again when a foldable unfolds.

## 1. Scope

- **The address.** Pass it as given; the CLI adds `https://` when it's missing. For `localhost`,
  `127.0.0.1`, `*.local`, `*.test` or a staging host, first check it answers:

      curl -sS -o /dev/null -w '%{http_code}\n' <url>

  If nothing answers, tell the user the server isn't running and stop. That isn't a site finding.
- **The targets.** With no request, use the default: one representative device per required
  coverage cell. When the user names kinds of device, pass one `--category` per kind: `phone`,
  `foldable-book`, `foldable-flip`, `dual-screen`, `multi-fold`, `tablet`, `desktop`.
- **Named devices.** Build `--targets` keys, `device/display/posture/orientation` (`-` for no
  posture), from the catalog. Never guess an ID. List a device's displays and postures:

      node -e 'const c=require(process.argv[1]);const d=c.devices.find(d=>d.id===process.argv[2]);console.log(d?JSON.stringify({displays:Object.keys(d.displays),postures:(d.postures||d.poses||[]).map(p=>p.id+"@"+p.display)}):"unknown device")' "${DOBRA_DIR:-$HOME/Dobra}/packages/core/src/catalog/catalog.json" galaxy-z-fold-7

  `book@inner` becomes `galaxy-z-fold-7/inner/book/landscape`. If the CLI answers
  `Unknown target <key>`, that orientation isn't offered: try the other one.

## 2. Run

Write the results to a scratch folder, never into the user's project:

    out="$(mktemp -d)/dobra"; mkdir -p "$out"
    dobra check site <url> --out "$out/foldable-report.json" --md "$out/report.md" --fail-on never

Add `--targets <keys>` or `--category <name>` from step 1. `--fail-on never` keeps the exit code
for real failures (a target that couldn't load still exits 1). The run also writes
`$out/foldable-report.zip` with a screenshot per target; keep it.

If it fails before checking anything:

| Output | Meaning | Tell the user |
|---|---|---|
| `Executable doesn't exist` or `browserType.launch` | Chromium is missing | Run `npx playwright install chromium` in `~/Dobra`, or the installer again |
| `Not a web address` | The URL is malformed | Ask for a full URL |
| `Unknown target` | A bad `--targets` key | Rebuild it from the catalog (step 1) |

## 3. Read the JSON

Read `$out/foldable-report.json`, not the Markdown. What matters:

- `frames[]`: one per checked window. `frames[].targets` are the target keys it stands for;
  `frames[].findings[]` has `ruleId`, `severity`, `target`, `nodeId`, `message`, `source` and
  `estimated`.
- `unloaded[]`: targets that couldn't load, with a `reason`. These are "could not load", not
  findings.
- `coverage.cells[]`: which required device kinds were checked.
- `notes[]`: things the reader should know, such as a page cut short.

## 4. Explain each rule

| `ruleId` | What it means on a website | Fix, with the guide section |
|---|---|---|
| `hinge-content` | Content sits under the hinge or fold | Lay out around the fold with the Viewport Segments API: `04-web.md#foldables-and-dual-screens-the-viewport-segments-api` |
| `pane-split` | A pane crosses the hinge instead of splitting at it | One pane per segment, `@media (horizontal-viewport-segments: 2)` and `env(viewport-segment-*)`: `04-web.md#foldables-and-dual-screens-the-viewport-segments-api` |
| `tabletop-controls` | Controls sit in the top half in tabletop posture | Move controls below the fold with `vertical-viewport-segments`: `04-web.md#foldables-and-dual-screens-the-viewport-segments-api` |
| `landscape-not-wide` | Side-by-side panes in a window too narrow for them | Branch on width, not orientation: `08-anti-patterns.md#branching-on-orientation-instead-of-available-width`, `04-web.md#media-queries-and-container-queries` |
| `min-legible-width` | Text in a column too narrow to read | `08-anti-patterns.md#splitting-into-panes-too-narrow-to-read`, `04-web.md#intrinsic-layout` |
| `overflow-x` | Content runs past the window's width | `04-web.md#intrinsic-layout`, `04-web.md#viewport-units` |
| `chrome-overlap` | A fixed bar covers content in a short window | `04-web.md#safe-areas`, `04-web.md#viewport-units` |
| `touch-target` | A control is smaller than the touch minimum | `07-accessibility.md#touch-targets` |
| `resize-vs-reload` | The page lays itself out only on load, not when a foldable unfolds | Use CSS queries or `ResizeObserver`, not a width read once: `08-anti-patterns.md#assuming-the-window-size-never-changes-after-first-layout` |
| `frame-size-mismatch` | The checked window differs from the target's size | Report it as a note about the run |

A rule not in this table: explain `message` and cite the closest section of `04-web.md`.

## 5. Report

Follow [report-format.md](report-format.md). Also:

- Say where the package is (`$out/foldable-report.zip`) and how to open it: `dobra report`, then drop
  the ZIP into Foldable Check.
- Always state the emulation limits: iOS targets are size-only (Chromium with an iOS user agent, no
  hinge), and a tri-fold shows its first separating fold only
  (`04-web.md#testing-and-the-limits-of-emulation`).
- Offer to re-run with the same targets after a fix, or only the failing ones (from
  `frames[].targets`).
````

- [ ] **Step 2: Add the router row**

In `plugins/dobra/skills/dobra/SKILL.md`, replace:

```markdown
| The user wants to | Read |
|---|---|
```

with:

```markdown
| The user wants to | Read |
|---|---|
| Check whether a URL works on foldables, dual screens or tablets | [site-check.md](site-check.md) |
```

- [ ] **Step 3: Run the drift test**

Run: `npm test -w @dobra/cli -- src/skill.test.ts`
Expected: PASS. A failure in "cites only guide sections that exist" names the bad anchor: fix the anchor in `site-check.md` to the heading in `docs/guide`.

- [ ] **Step 4: Commit**

```bash
git add plugins/dobra/skills/dobra/site-check.md plugins/dobra/skills/dobra/SKILL.md
git commit -m "Add the site-check workflow to the dobra skill"
```

---

### Task 4: Native app workflows

**Files:**
- Create: `plugins/dobra/skills/dobra/native-android.md`
- Create: `plugins/dobra/skills/dobra/native-ios.md`
- Modify: `plugins/dobra/skills/dobra/SKILL.md` (Workflows table)

**Interfaces:**
- Consumes: the Workflows table and `report-format.md` from Task 2.
- Produces: the "manual matrix" sections that `emulators.md` (Task 5) falls back to, headed `## Runtime check without emulators` in both files.

- [ ] **Step 1: Write `native-android.md`**

Create `plugins/dobra/skills/dobra/native-android.md`:

````markdown
# Review an Android app

For Jetpack Compose and Android Views apps. Units are dp and sp.

## 1. Detect the project

- Android: a `build.gradle` or `build.gradle.kts` with `com.android.application` or
  `com.android.library`.
- Compose: `androidx.compose` in the dependencies or `@Composable` in the sources. Otherwise Views.
- Kotlin Multiplatform or React Native: review the Android code here and the iOS code with
  [native-ios.md](native-ios.md), and say so.

Ask which screens matter most, or find them: the activities in `AndroidManifest.xml`, the
navigation graph, and the top-level composables. Don't read the whole repository.

## 2. Review the code

Search for each pattern, read the hits in context, and report only real problems. Cite the section
for each finding.

| Check | Look for | Problem when | Guide |
|---|---|---|---|
| Size from the window | `WindowSizeClass`, `currentWindowAdaptiveInfo`, `currentWindowAdaptiveInfoV2`, `computeCurrentWindowMetrics` | Missing on screens that change layout | `02-android.md#window-size-classes`, `02-android.md#where-size-comes-from` |
| Breakpoints | `isWidthAtLeastBreakpoint`, `WIDTH_DP_*`, `HEIGHT_DP_*`, numbers like `600`, `840` near `dp` | Custom thresholds instead of 600/840/1200 dp width and 480/900 dp height; deprecated `windowWidthSizeClass` | `02-android.md#window-size-classes` |
| Display instead of window | `displayMetrics`, `getRealMetrics`, `screenWidthDp`, `Display.getSize` | Used for layout decisions | `08-anti-patterns.md#reading-the-display-size-instead-of-the-window-size` |
| Orientation branching | `ORIENTATION_LANDSCAPE`, `LocalConfiguration.current.orientation`, `isLandscape` | Picks the number of panes | `08-anti-patterns.md#branching-on-orientation-instead-of-available-width` |
| Folds as a list | `WindowInfoTracker`, `FoldingFeature`, `collectFoldingFeaturesAsState`, `firstOrNull()` | Takes only the first feature | `02-android.md#foldables-and-postures`, `08-anti-patterns.md#taking-the-first-folding-feature-on-a-foldable` |
| Split decision | `isSeparating`, `FoldingFeature.State.HALF_OPENED`, `state ==` | Splits on `state` instead of `isSeparating` (misses dual screens spanned `FLAT`) | `02-android.md#foldables-and-postures` |
| Device checks | `Build.MODEL`, `Build.DEVICE`, `"Fold"`, `isTablet` | Any layout decision from them | `08-anti-patterns.md#hardcoding-device-names-or-model-checks` |
| Adaptive components | `NavigationSuiteScaffold`, `ListDetailPaneScaffold`, `SupportingPaneScaffold`, hand-rolled `Row` of panes | Hand-rolled pane or navigation switching the scaffolds already do | `02-android.md#adaptive-components` |
| Insets | `enableEdgeToEdge`, `WindowInsets`, `safeDrawingPadding`, `imePadding`, hard-coded bar heights | No edge-to-edge handling when targeting SDK 35+, or fixed bar heights | `02-android.md#insets-and-edge-to-edge` |
| Configuration changes | `android:configChanges`, `remember {` holding screen state, `rememberSaveable`, `ViewModel` | Screen state in `remember` that a fold or resize resets | `02-android.md#configuration-changes`, `08-anti-patterns.md#assuming-the-window-size-never-changes-after-first-layout` |
| Orientation and resizability locks | `screenOrientation`, `resizableActivity`, `minAspectRatio`, `maxAspectRatio`, `setRequestedOrientation` | Relied on for layout; ignored at sw600dp and up when targeting API 36 | `02-android.md#platform-rules-to-know` |
| Scalable text in fixed boxes | `.height(` or `layout_height="..dp"` on containers holding `Text` | Fixed height, not `heightIn(min = …)` | `08-anti-patterns.md#fixed-height-containers-holding-user-scalable-text`, `07-accessibility.md#the-200-test` |
| Pane width | Panes in a `Row` with `weight` | A pane can end up too narrow to read | `08-anti-patterns.md#splitting-into-panes-too-narrow-to-read` |
| Touch targets | `.size(` under 48 dp on clickables | Below 48 dp | `07-accessibility.md#touch-targets` |

For each finding give `file:line`, the problem, the section, and a fix in the project's style. A
fold-aware split looks like this (from `02-android.md#foldables-and-postures`):

```kotlin
val folds by collectFoldingFeaturesAsState()
val separating = folds.filter { it.isSeparating }
when {
    separating.any { it.orientation == FoldingFeature.Orientation.HORIZONTAL } -> TabletopLayout(separating)
    separating.isNotEmpty() -> PanesAtFolds(separating)
    else -> SinglePane()
}
```

## 3. Runtime check

First check for the emulator command: see emulators.md. If it's there, follow it
with these devices, then walk each posture and orientation, capture a screenshot of each screen
under review, and look for clipped content, content under the hinge, and panes too narrow to read.

Devices, by catalog ID: `galaxy-z-fold-7` (book foldable), `galaxy-z-flip-7` (flip),
`surface-duo-2` (dual screen), `pixel-tablet` (tablet), `galaxy-z-trifold` (tri-fold).

## Runtime check without emulators

Say plainly that the app wasn't run, and give the user this matrix
(`02-android.md#testing`):

- **Compose previews** at the catalog's window sizes. Read each display's `portraitSize` (dp) from
  the catalog and write a spec per size, plus the platform presets:

  ```kotlin
  @Preview(name = "Fold 7 inner", device = "spec:width=<w>dp,height=<h>dp,dpi=<dpi>")
  @PreviewScreenSizes
  @PreviewFontScale
  @Composable
  fun ScreenPreviews() { AppTheme { Screen() } }
  ```

  Offer to write this file with the real sizes filled in. Previews can't show folding features,
  insets on a device, resizes or configuration changes.
- **Android Studio emulators:** the 7.6" fold-in foldable, a tablet, and the resizable emulator.
  Fold, unfold, rotate and resize with the screen under review open.
- **The minimum test sizes:** foldable 841×701 dp, 8" tablet 1024×640 dp, 10.5" tablet
  1280×800 dp, 13" Chromebook 1600×900 dp, and continuous resizing between them.
- **A physical device** is the only proof of hinge geometry and the real insets.

## 4. Report

Follow [report-format.md](report-format.md). Offer to apply the fixes; don't edit code unless the
user says so.
````

- [ ] **Step 2: Write `native-ios.md`**

Create `plugins/dobra/skills/dobra/native-ios.md`:

````markdown
# Review an iOS app

For SwiftUI and UIKit apps. Units are pt.

## 1. Detect the project

- iOS: an `*.xcodeproj`, `*.xcworkspace` or `Package.swift` with an iOS platform.
- SwiftUI: `import SwiftUI` and `: View` types. UIKit: `UIViewController` subclasses.
- Kotlin Multiplatform or React Native: review the iOS code here and the Android code with
  [native-android.md](native-android.md), and say so.

Ask which screens matter most, or find them from the `App` scene or the storyboard's initial
view controller. Don't read the whole repository.

## 2. Review the code

Search for each pattern, read the hits in context, and report only real problems.

| Check | Look for | Problem when | Guide |
|---|---|---|---|
| Size classes from the environment | `horizontalSizeClass`, `verticalSizeClass`, `traitCollection` | Missing on screens that change layout; compared with numbers | `03-ios.md#size-classes-are-assigned-not-measured` |
| Measuring instead | `UIScreen.main.bounds`, `UIScreen.main`, `GeometryReader` deciding layout | Layout from the screen size, or `GeometryReader` where a container would do | `08-anti-patterns.md#reading-the-display-size-instead-of-the-window-size`, `03-ios.md#adaptive-containers` |
| Orientation branching | `UIDevice.current.orientation`, `isLandscape`, `interfaceOrientation` | Picks the layout | `08-anti-patterns.md#branching-on-orientation-instead-of-available-width` |
| Device checks | `userInterfaceIdiom == .pad`, model strings | Any layout decision from them | `08-anti-patterns.md#hardcoding-device-names-or-model-checks`, `03-ios.md#ipad-windows` |
| Adaptive containers | `NavigationSplitView`, `NavigationStack`, `ViewThatFits`, `containerRelativeFrame`, `GridItem(.adaptive` | Hand-rolled switching those already do | `03-ios.md#adaptive-containers` |
| Safe areas and keyboard | `ignoresSafeArea`, `safeAreaInset`, `edgesIgnoringSafeArea`, fixed bottom padding | Controls outside the safe area, or ignoring `.keyboard` for content | `03-ios.md#safe-areas-and-the-keyboard` |
| Size changes at run time | Values measured in `onAppear` or `viewDidLoad` and kept | A size read once | `08-anti-patterns.md#assuming-the-window-size-never-changes-after-first-layout`, `03-ios.md#ipad-windows` |
| Dynamic Type | `.font(.system(size:`, `UIFont.systemFont(ofSize:`, `.frame(height:` around `Text`, `dynamicTypeSize`, `@ScaledMetric` | Fixed font sizes or fixed heights around text; no layout change at accessibility sizes | `03-ios.md#dynamic-type`, `08-anti-patterns.md#fixed-height-containers-holding-user-scalable-text`, `07-accessibility.md#the-200-test` |
| Pane width | `HStack` of panes, `NavigationSplitView` column widths | A column too narrow to read | `08-anti-patterns.md#splitting-into-panes-too-narrow-to-read` |
| Touch targets | `.frame(width:height:)` under 44 pt on buttons | Below 44 pt | `07-accessibility.md#touch-targets` |

For each finding give `file:line`, the problem, the section, and a fix in the project's style. For
example, from `03-ios.md#dynamic-type`:

```swift
@Environment(\.dynamicTypeSize) private var dynamicTypeSize

var body: some View {
    if dynamicTypeSize.isAccessibilitySize {
        VStack(alignment: .leading) { icon; label }
    } else {
        HStack { icon; label }
    }
}
```

iOS has no system foldable today. The catalog's `iphone-duo` is hypothetical: use it to talk about
design, never as a device to test on.

## 3. Runtime check

First check for the emulator command: see emulators.md. iOS simulators only exist
for device types Apple ships, so there are no folds. Use `iphone-17` (portrait and landscape),
`iphone-17-pro-max` (landscape gives a regular width), and `ipad-11` with a narrow window.

## Runtime check without emulators

Say plainly that the app wasn't run, and give the user this matrix (`03-ios.md#testing`):

- **Xcode previews** of each screen on an iPhone and an iPad, with
  `.environment(\.dynamicTypeSize, .accessibility5)` for the largest text.
- **Simulator:** each screen at compact width in portrait and landscape, in a narrow iPad window,
  at the largest accessibility text size, and with the keyboard up.
- **A resizable iPad window:** resize continuously and watch the split view collapse to one column.

## 4. Report

Follow [report-format.md](report-format.md). Offer to apply the fixes; don't edit code unless the
user says so.
````

- [ ] **Step 3: Add the router rows**

In `plugins/dobra/skills/dobra/SKILL.md`, after the site-check row, add:

```markdown
| Review or test an Android app (Compose or Views) for foldables, tablets and window sizes | [native-android.md](native-android.md) |
| Review or test an iOS app (SwiftUI or UIKit) for size classes, iPad windows and Dynamic Type | [native-ios.md](native-ios.md) |
```

- [ ] **Step 4: Run the drift test**

Run: `npm test -w @dobra/cli -- src/skill.test.ts`
Expected: PASS. Both files say `see emulators.md` without a link on purpose: Task 5 creates the file and turns it into a link, so this commit's link check stays green. Fix any anchor the anchor test names before moving on.

- [ ] **Step 5: Commit**

```bash
git add plugins/dobra/skills/dobra/native-android.md plugins/dobra/skills/dobra/native-ios.md plugins/dobra/skills/dobra/SKILL.md
git commit -m "Add the Android and iOS review workflows to the dobra skill"
```

---

### Task 5: Emulator workflow

**Files:**
- Create: `plugins/dobra/skills/dobra/emulators.md`
- Modify: `plugins/dobra/skills/dobra/SKILL.md`, `native-android.md`, `native-ios.md`

**Interfaces:**
- Consumes: the `## Runtime check without emulators` sections from Task 4.
- Produces: the only file that changes when the emulator CLI ships.

- [ ] **Step 1: Write `emulators.md`**

Create `plugins/dobra/skills/dobra/emulators.md`:

````markdown
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
````

- [ ] **Step 2: Link it from the other files**

In `native-android.md` and `native-ios.md`, replace `see emulators.md` with
`see [emulators.md](emulators.md)`.

In `SKILL.md`, after the iOS row, add:

```markdown
| Create foldable emulators or simulators | [emulators.md](emulators.md) |
```

- [ ] **Step 3: Run the drift test**

Run: `npm test -w @dobra/cli -- src/skill.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add plugins/dobra/skills/dobra/emulators.md plugins/dobra/skills/dobra/native-android.md plugins/dobra/skills/dobra/native-ios.md plugins/dobra/skills/dobra/SKILL.md
git commit -m "Add the emulator workflow to the dobra skill, probing for the command"
```

---

### Task 6: Plugin and marketplace manifests

**Files:**
- Create: `plugins/dobra/.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`

- [ ] **Step 1: Write the plugin manifest**

Create `plugins/dobra/.claude-plugin/plugin.json` (version matches the root `package.json`):

```json
{
  "name": "dobra",
  "description": "Check websites and Android and iOS apps on foldable, dual-screen and tablet devices with Dobra, and fix what breaks using the Dobra guide.",
  "version": "0.5.0",
  "author": { "name": "Jackson Mafra" },
  "homepage": "https://dobra-five.vercel.app/",
  "repository": "https://github.com/jacksonmafra-umain/Dobra",
  "keywords": ["foldable", "dual-screen", "responsive", "android", "ios", "adaptive-layout"]
}
```

- [ ] **Step 2: Write the marketplace manifest**

Create `.claude-plugin/marketplace.json`:

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "dobra",
  "description": "Dobra tools for foldable and dual-screen layouts.",
  "owner": { "name": "Jackson Mafra", "url": "https://github.com/jacksonmafra-umain" },
  "plugins": [
    {
      "name": "dobra",
      "source": "./plugins/dobra",
      "description": "Check websites and Android and iOS apps on foldables, and fix what breaks.",
      "category": "development"
    }
  ]
}
```

- [ ] **Step 3: Validate both**

Run: `claude plugin validate plugins/dobra && claude plugin validate .`
Expected: both report valid. Fix any field the validator names (it may reject `category` or want `version` in the marketplace entry; follow its message).

- [ ] **Step 4: Commit**

```bash
git add plugins/dobra/.claude-plugin/plugin.json .claude-plugin/marketplace.json
git commit -m "Publish the dobra skill as a Claude Code plugin"
```

---

### Task 7: Installer step

**Files:**
- Modify: `install.sh` (header settings comment, new `install_skill` function after `install_command`, a step in `main`, the closing message)
- Create: `packages/cli/src/installSkill.test.ts`

**Interfaces:**
- Produces: `install_skill <dir>` in `install.sh`: copies `<dir>/plugins/dobra/skills/dobra` to `$HOME/.claude/skills/dobra`, writes the `$MARKER` file in it, replaces an earlier copy that has the marker, leaves a folder without the marker alone. Uses `info` and `$MARKER` from `install.sh`.

- [ ] **Step 1: Write the failing test**

Create `packages/cli/src/installSkill.test.ts`:

```ts
// The installer's step that copies the dobra agent skill into ~/.claude/skills.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../../..');

/** Runs install.sh's install_skill function alone, with HOME in a temporary folder. */
function installSkill(home: string) {
  const script = `
    set -euo pipefail
    info() { printf '%s\\n' "$*"; }
    MARKER=.dobra-install
    eval "$(sed -n '/^install_skill() {/,/^}/p' "$1/install.sh")"
    install_skill "$1"
  `;
  return spawnSync('bash', ['-c', script, '_', ROOT], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
}

describe('install_skill', () => {
  it('copies the skill and marks it', () => {
    const home = mkdtempSync(join(tmpdir(), 'dobra-home-'));
    const r = installSkill(home);
    expect(r.status).toBe(0);
    const dest = join(home, '.claude/skills/dobra');
    expect(readFileSync(join(dest, 'SKILL.md'), 'utf8')).toMatch(/^name: dobra$/m);
    expect(existsSync(join(dest, '.dobra-install'))).toBe(true);
  });

  it('replaces a copy it installed before', () => {
    const home = mkdtempSync(join(tmpdir(), 'dobra-home-'));
    installSkill(home);
    const dest = join(home, '.claude/skills/dobra');
    writeFileSync(join(dest, 'stale.md'), 'old');
    expect(installSkill(home).status).toBe(0);
    expect(existsSync(join(dest, 'stale.md'))).toBe(false);
    expect(existsSync(join(dest, 'SKILL.md'))).toBe(true);
  });

  it('leaves a dobra skill folder it did not install alone', () => {
    const home = mkdtempSync(join(tmpdir(), 'dobra-home-'));
    const dest = join(home, '.claude/skills/dobra');
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, 'SKILL.md'), 'mine');
    const r = installSkill(home);
    expect(r.status).toBe(0);
    expect(readFileSync(join(dest, 'SKILL.md'), 'utf8')).toBe('mine');
    expect(r.stdout).toMatch(/Leaving .*dobra alone/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @dobra/cli -- src/installSkill.test.ts`
Expected: FAIL: `install_skill: command not found` (status 127).

- [ ] **Step 3: Add `install_skill` to `install.sh`**

Insert after the closing `}` of `install_command` (just before `main() {`):

```bash
# Copies the dobra agent skill to ~/.claude/skills so Claude Code can use Dobra in any project. A
# folder there that this script didn't write is left alone.
install_skill() {
  local src="$1/plugins/dobra/skills/dobra" dest="$HOME/.claude/skills/dobra"
  [ -d "$src" ] || { info "This version has no agent skill"; return 0; }
  if [ -e "$dest" ] && [ ! -f "$dest/$MARKER" ]; then
    info "Leaving $dest alone: Dobra didn't install it"
    return 0
  fi
  mkdir -p "$HOME/.claude/skills"
  rm -rf "$dest"
  cp -R "$src" "$dest"
  : >"$dest/$MARKER"
  info "Claude Code can now use Dobra: $dest"
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @dobra/cli -- src/installSkill.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Call it from `main` and document the setting**

In `main`, after the `install_command "$dir"` line, add:

```bash

  if [ "${DOBRA_SKIP_SKILL:-}" = 1 ]; then
    step "Skipping the Claude Code skill (DOBRA_SKIP_SKILL=1)"
  else
    step "Adding the dobra skill for Claude Code"
    install_skill "$dir"
  fi
```

In the header comment's settings list, after the `DOBRA_SKIP_BROWSER` line, add:

```bash
#   DOBRA_SKIP_SKILL    set to 1 to skip copying the Claude Code skill to ~/.claude/skills/dobra
```

In the closing `cat <<EOF` message, after the `dobra update` line, add:

```
In Claude Code, ask to check a site or an app on foldables: the dobra skill runs these for you.
```

- [ ] **Step 6: Check the script still parses and every test passes**

Run: `bash -n install.sh && npm test -w @dobra/cli -- src/installSkill.test.ts src/skill.test.ts`
Expected: no output from `bash -n`; both test files PASS.

- [ ] **Step 7: Commit**

```bash
git add install.sh packages/cli/src/installSkill.test.ts
git commit -m "Install the dobra skill for Claude Code with the rest of Dobra"
```

---

### Task 8: Docs

**Files:**
- Modify: `README.md` ("What you can do" list and a new subsection after "### Add the Figma plugin")
- Modify: `CLAUDE.md` ("What this repository contains" list)

- [ ] **Step 1: Read the sections you'll edit**

Run: `sed -n 1,80p README.md`
Match the existing bullet and heading style in what you add.

- [ ] **Step 2: Add to the README**

In "## What you can do", add a bullet in the list's style:

```markdown
- **Ask Claude Code.** The `dobra` skill checks a site or an Android or iOS app on foldables from
  any project and explains each fix with the guide.
```

After the "### Add the Figma plugin" subsection, add:

````markdown
### Use Dobra from Claude Code

The installer copies the `dobra` skill to `~/.claude/skills/dobra` (skip it with
`DOBRA_SKIP_SKILL=1`). Without the installer, add it as a plugin:

```
/plugin marketplace add jacksonmafra-umain/Dobra
/plugin install dobra@dobra
```

Then ask, in any project, for example "check https://example.com on foldables" or "review this
app's layout for foldables". The skill runs `dobra check site`, reviews Compose or SwiftUI code
against the guide, and says what it couldn't check.
````

- [ ] **Step 3: Add to CLAUDE.md**

In "## What this repository contains", after the `apps/site` line, add:

```markdown
- `plugins/dobra`: the `dobra` Claude Code skill (site checks, Android and iOS reviews, emulators) and its plugin manifest; `.claude-plugin/marketplace.json` lists it. `packages/cli/src/skill.test.ts` checks its guide anchors and CLI options.
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "Document the dobra skill for Claude Code"
```

---

### Task 9: Manual verification and PR

**Files:** none in the repo. Samples go in the session scratchpad.

- [ ] **Step 1: Build the CLI**

Run: `npm run build:cli && npx playwright install chromium`

- [ ] **Step 2: M1, site check on the examples**

Serve `examples/sites` (`npx http-server examples/sites -p 5173 -s &` or `python3 -m http.server 5173 -d examples/sites &`). In a fresh Claude Code session with `--plugin-dir plugins/dobra` from a scratch folder, ask: "Check http://localhost:5173/06-hinge-content.html on foldables." Expected: the skill finds `npm run dobra --` or `dobra`, runs with `--out` in a temp folder, reports `hinge-content` with a fix citing `04-web.md#foldables-and-dual-screens-the-viewport-segments-api`, states the iOS and tri-fold limits, and `git status` in the repo stays clean.

- [ ] **Step 3: M2, server not running**

Stop the server and ask again. Expected: "the server isn't answering", no check run.

- [ ] **Step 4: M3, nothing loads**

Ask to check `http://127.0.0.1:9/`, which refuses connections, after bypassing the reachability step ("run it anyway"). Expected: verdict "Not checked", never "Pass".

- [ ] **Step 5: M4, native samples**

In the scratchpad, write a Compose file using `foldingFeatures.firstOrNull()`, `state == HALF_OPENED` for the split, and `LocalConfiguration.current.orientation` to choose panes, and a SwiftUI file using `UIScreen.main.bounds.width > 700` and `.font(.system(size: 14))` inside `.frame(height: 44)`. Ask for a review of each. Expected: every planted problem found with `file:line`, the right section, units dp on Android and pt on iOS, and the runtime section says emulators aren't available and gives the manual matrix.

- [ ] **Step 6: M5, no Dobra**

Run a session with `PATH` stripped of `dobra`, `HOME` set to a temp folder, outside a checkout. Expected: the skill shows the installer and asks before running it.

- [ ] **Step 7: Fix what the scenarios found**

Each fix is its own commit, named for what it changes in the skill.

- [ ] **Step 8: Push and open the PR**

```bash
git push -u origin feat/dobra-agent-skill
gh pr create --repo jacksonmafra-umain/Dobra --base main \
  --title "Add the dobra agent skill for foldable checks" \
  --label enhancement --label area:docs --label area:skill \
  --body "$(cat <<'EOF'
Closes #N

- `plugins/dobra/skills/dobra`: a `dobra` skill with a router and workflows for site checks, Android and iOS reviews, and emulators (which probes for `dobra emulator` and falls back to a manual matrix until that command ships).
- `.claude-plugin/marketplace.json` and `plugins/dobra/.claude-plugin/plugin.json`: install with `/plugin marketplace add jacksonmafra-umain/Dobra`.
- `install.sh` copies the skill to `~/.claude/skills/dobra` (`DOBRA_SKIP_SKILL=1` skips it) and leaves a folder it didn't write alone.
- `packages/cli/src/skill.test.ts` checks that cited guide anchors exist, CLI options are real, links resolve and Android text has no pt. `installSkill.test.ts` covers the installer step.

Manual checks: site check on `examples/sites`, a stopped server, an unreachable host, Compose and SwiftUI samples with planted problems, and no Dobra installed.
EOF
)"
```

Replace `#N` with the issue number from Task 1. Then bind the PR with the ccd_pr tools and read its CI.
