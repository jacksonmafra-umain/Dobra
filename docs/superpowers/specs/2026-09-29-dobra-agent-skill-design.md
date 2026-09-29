# Dobra agent skill: design

Date: 2026-09-29. Owner: agent/04. Status: approved in conversation, awaiting spec review.

## Goal

One Claude Code skill, `dobra`, that any agent in any project can use to:

1. Check whether a URL is responsive on foldable and dual-screen devices, and report the issues found.
2. Help a native Android or iOS developer test their app against the Dobra guide and fix what fails.
3. Create foldable emulators and simulators, through the CLI agent/02 is designing.

The skill wraps what Dobra already has (the `dobra` CLI, the catalog, the report JSON and
`docs/guide`). It adds no engine logic and no new analyser.

## Decisions

- **Audience:** agents in any project, not only the Dobra monorepo. The skill calls the installed
  `dobra` command.
- **Native check:** code review against the guide now, plus a runtime check on emulators once
  agent/02's CLI exists.
- **Shape:** one skill with three workflows in reference files (approach A). Rejected: three separate
  skills (duplicated setup and vocabulary; the native flow often needs the site check or an emulator
  mid-task) and a new `dobra check code` static analyser (a large subsystem that agents do not need to
  apply the guide's rules).

## Dependencies

- On `main` today (confirmed by agent/03): the installer (`install.sh`, which puts
  `~/.dobra/bin/dobra` on the PATH and the code in `~/Dobra`), `dobra check site`, `dobra report`,
  `dobra simulator`, `dobra plugin`, `dobra update` (re-runs the installer), the catalog at
  `@dobra/core/catalog/catalog.json` with target keys such as `galaxy-z-fold-7/inner/book/landscape`,
  and the report schema in `packages/core/src/report.ts`.
- Not yet available (confirmed by agent/02): the emulator CLI. It is in design with no spec, branch
  or ETA. Tentative shape `dobra emulator create <device-id|target-key>`, generated from the catalog
  by a generator in `@dobra/core`. Android AVDs use the emulator's hinge and posture config; iOS can
  only use Apple's shipped simctl device types, so no folds and no hypothetical devices. Open on their
  side: default system image, tri-fold, iPad, changing a running emulator's posture or rotation.
  agent/04 asked for JSON output. The skill must not depend on any of this until it merges.

## Structure and distribution

```
.claude-plugin/marketplace.json        # repo root, lists the dobra plugin
plugins/dobra/
  .claude-plugin/plugin.json
  skills/dobra/
    SKILL.md             # triggers, locating dobra, routing, pointers to the workflows
    site-check.md        # workflow 1
    native-android.md    # workflow 2, Android
    native-ios.md        # workflow 2, iOS
    emulators.md         # workflow 3
    report-format.md     # output rules shared by every workflow
```

- **Plugin:** `/plugin marketplace add jacksonmafra-umain/Dobra`, then `/plugin install dobra`.
- **Installer:** a new `install.sh` step copies `plugins/dobra/skills/dobra` to
  `~/.claude/skills/dobra`, replacing an earlier copy. `dobra update` re-runs the installer, so it
  refreshes the skill too. `DOBRA_SKIP_SKILL=1` skips the step.
- **Locating Dobra**, in order: `dobra` on the PATH, `~/.dobra/bin/dobra`, then a Dobra checkout
  (`npm run dobra --`). If none is found, the skill shows the installer one-liner and asks before
  running it.
- **Guide location:** `$DOBRA_DIR/docs/guide` (default `~/Dobra/docs/guide`). If it is missing, the
  skill uses the published guide at `https://dobra-five.vercel.app/guide/`.
- **Triggers** (in the `description`): foldable, dual-screen, tri-fold, fold, hinge, posture, size
  class, `WindowSizeClass`, adaptive layout, "responsive on foldables", checking a URL on foldables or
  tablets.

`SKILL.md` stays short: how to find `dobra`, which workflow file to read for the request, and the
link to `report-format.md`. A request that spans workflows (a native review that needs an emulator)
reads both files.

## Workflow 1: site check (`site-check.md`)

1. **Scope.** Take the URL. For `localhost` or staging addresses, check they respond first. Default
   targets: the representative set (one device per required coverage cell). Named devices become
   `--category` values (`phone`, `foldable-book`, `foldable-flip`, `dual-screen`, `multi-fold`,
   `tablet`, `desktop`) or `--targets` keys read from the catalog. The skill never invents a key.
2. **Run** in a scratch folder so the user's project stays clean:
   `dobra check site <url> --out <dir>/foldable-report.json --md <dir>/report.md --fail-on never`.
   Keep the ZIP.
3. **Parse the JSON**, not the Markdown: `frames[].findings`, `unloaded`, `coverage`, `notes`,
   following `reportSchema`.
4. **Report** per `report-format.md`:
   - A verdict with counts by severity.
   - Findings grouped by rule, then by target. Each has the severity, the message, the target in
     words ("Galaxy Z Fold 7, inner display, book posture, landscape"), the `nodeId`, and a fix that
     links the section of `docs/guide/04-web.md` it applies (Viewport Segments API,
     `env(viewport-segment-*)`, media and container queries, safe areas, viewport units).
   - Estimated values labelled as such.
   - Unloaded targets and the report's notes. The emulation limits are always stated: iOS targets
     are size-only, and a tri-fold shows its first separating fold only.
   - The ZIP path, and how to open it: `dobra report`, or drop it into Foldable Check.
5. **Next steps:** re-run after a fix with the same targets, or only the failing ones.

Failure handling: a missing Chromium means telling the user to run `npx playwright install
chromium` or the installer again. A non-zero exit with `unloaded` entries is reported as "could not
load", not as findings.

## Workflow 2: native apps (`native-android.md`, `native-ios.md`)

1. **Detect the project.** Android: `build.gradle(.kts)`, and Compose (`androidx.compose`) or Views.
   iOS: `*.xcodeproj` or `Package.swift`, and SwiftUI or UIKit. Kotlin Multiplatform or React Native
   runs both checklists and says so.
2. **Code review.** Each checklist item is a guide rule with its section cited, for example
   `02-android.md#foldables-and-postures`. The skill asks which screens matter, or searches for
   them, and doesn't read the whole repo.
   - Android: `WindowSizeClass` breakpoints (width 600/840/1200 dp, height 480/900 dp); no branching
     on orientation or display size; `WindowInfoTracker`/`FoldingFeature` handled as a list, split
     decisions from `isSeparating`, not the fold state; adaptive components
     (`ListDetailPaneScaffold`, `NavigationSuiteScaffold`); insets and edge-to-edge; configuration
     changes; no device-model checks; no fixed-height containers holding scalable text; no panes too
     narrow to read.
   - iOS: size classes read from the environment (`horizontalSizeClass`, `verticalSizeClass`) rather
     than measured; adaptive containers (`NavigationSplitView`, `ViewThatFits`); safe areas and the
     keyboard; iPad windows and resizing; Dynamic Type up to the accessibility sizes; plus the shared
     anti-patterns in `08-anti-patterns.md`.
   - Each finding: file and line, what is wrong, a short guide citation, a Compose or SwiftUI fix in
     the project's style. Units are dp/sp on Android and pt on iOS. Any number without a primary
     source is labelled estimated.
3. **Runtime check.** Targets come from the catalog: for Android a book foldable, a flip, a
   dual-screen device, a tablet and a tri-fold; for iOS an iPhone in both orientations and iPad
   windows.
   - With `dobra emulator`: create the devices, install and launch the app, walk the postures and
     orientations, capture screenshots, look for clipped content, content under the hinge and panes
     too narrow to read, and report against the same checklist.
   - Without it: give the manual matrix from the guide's Testing sections. That covers Compose
     `@Preview` device specs from the catalog's dp values, `@PreviewScreenSizes` and
     `@PreviewFontScale`, Android Studio's foldable emulators, and iOS Simulator devices with
     Dynamic Type. On request, the skill generates a preview file with those specs. The report says
     plainly that the app was not run.
4. **Output** in the same format as the site check: a verdict, findings by severity, fixes, and what
   wasn't verified.

The skill does not edit the user's code unless asked. It offers to apply the fixes.

## Workflow 3: emulators (`emulators.md`)

- Probe with `dobra emulator --help`. If it fails, say "Emulator creation isn't available in this
  Dobra version yet" and fall back to the manual matrix in workflow 2. Never write AVD `config.ini`
  files or `simctl` calls by hand.
- If it exists: follow agent/02's interface (provisional: `create <device-id|target-key>` with JSON
  output), choose devices from the catalog, and state the iOS limit (Apple's device types only, no
  folds, no hypothetical devices).
- The interface is marked provisional in the file. When agent/02 ships, only this file changes.

## Output rules (`report-format.md`)

- Units per platform: dp/sp on Android, pt on iOS, CSS px on the web. An Android device never shows
  "pt".
- Numbers keep their `source`; estimated values are labelled.
- "hinge" means the physical part of the device.
- iOS and Android are peer clients of one spec; never describe one as mirroring the other.
- The report is written in the user's language; code, rule IDs and commands stay verbatim.
- Never claim something was verified when it was not run.

## Testing

- **Drift test (Vitest, in the repo):** every guide anchor the skill cites exists as a heading in
  `docs/guide`, and every `dobra check site` option the skill uses is accepted by
  `packages/cli/src/args.ts`.
- **Manifest check:** `claude plugin validate` on the plugin and marketplace manifests.
- **Manual run:** the site check on `examples/sites`; the native review on a small Compose sample and
  a small SwiftUI sample, each with known anti-patterns; the fallback with no `dobra` installed.

## Rollout

- One GitHub issue (labels `enhancement`, `area:docs` and a new `area:skill`), one PR linked with
  `Closes #N`, microcommits in this order: skill files, plugin and marketplace manifests, the
  `install.sh` step, the drift test, README docs.
- The emulator wiring is a follow-up PR after agent/02's command merges.

## Out of scope

- A static analyser (`dobra check code`).
- Building the emulator CLI (agent/02).
- Editing the user's code without their request.
