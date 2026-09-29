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
