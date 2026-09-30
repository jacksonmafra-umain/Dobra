# Responsive and adaptive layout: a cross-platform reference

A reference for engineers who build for Android (Jetpack Compose), iOS (SwiftUI) and the Web. It
answers what the breakpoints are, what each platform calls them, and which API to use. Each page
stands on its own, and a single glossary defines every term across the guide.

## Last verified

**2026-09-27.** Every link was fetched on this date, and every API name was checked against the
documentation or the library source.

| Platform | Checked against |
|---|---|
| Android | `androidx.window` 1.5.1 (stable, 19 November 2025); Compose Material 3 Adaptive 1.3.0 (stable, 12 August 2026); Android 16 (API level 36) behaviour changes; API names confirmed in the androidx source (`androidx-main`) |
| iOS | Apple documentation and Human Interface Guidelines, checked 2026-09-28, and the iOS 27.1 beta APIs for the foldable iPhone (`ArrangementView`, reserved regions, the vertical bar), checked 2026-09-30: each API's availability as its reference page lists it (for example `NavigationSplitView` iOS 16+, `containerRelativeFrame` and `inspector` iOS 17+). HIG Layout change log 9 September 2026; HIG Multitasking 9 June 2025. Verified through Apple's documentation JSON, since the HTML pages need JavaScript |
| Web | Baseline status from MDN and web.dev, checked 2026-09-27. Viewport segments (media features, `env(viewport-segment-*)`, `window.viewport.segments`): Limited availability, Chrome, Edge and Chrome Android 138, not in Firefox or Safari. Device Posture API: Limited availability, Chrome 132. Container style queries for custom properties: Newly available in 2026 (Firefox 151). Container size queries: Widely available since February 2023. Specs: Media Queries Level 5, CSS Environment Variables Level 1 and CSS Values and Units Level 4 (W3C Working Drafts), CSS Viewport Level 1 (Editor's Draft), Device Posture (Candidate Recommendation Draft) |

Volatile statements carry the version they were checked against. Anything that could not be
confirmed is marked [unverified — confirm before use].

## Parts

| Page | Answers |
|---|---|
| Mental model | Why layout follows the window, not the device, and when to branch versus flow |
| Android | Window size classes, window metrics, folds and postures, adaptive scaffolds, insets, configuration changes, Android 16 rules, testing |
| iOS | Size classes, adaptive containers, safe areas, iPad windows, the foldable iPhone, Dynamic Type, testing |
| Web | Media and container queries, intrinsic layout, viewport units, safe areas, viewport segments, testing |
| Mapping | The same concept's name on each platform, and how the breakpoints line up |
| Patterns | List-detail, supporting pane, grid reflow, canvas and controls, navigation, modals, long text, in all three stacks |
| Accessibility | Font scaling, the 200% test, touch targets, RTL |
| Anti-patterns | Common mistakes, why they fail, and what to do instead |
| Glossary | Every term in the guide, with its equivalents on the other platforms |

## Sourcing rules

- **Primary sources only:** developer.android.com, m3.material.io, android-developers.googleblog.com,
  developer.apple.com, developer.mozilla.org, web.dev, and W3C/WHATWG specifications.
- **Other sources:** anything else appears only as further reading, marked non-authoritative, and
  never as the source of a number or an API contract.
- **Where the platforms differ,** the guide says so. No platform is the reference for another.

## Sources

- https://developer.android.com/jetpack/androidx/releases/window
- https://developer.android.com/jetpack/androidx/releases/compose-material3-adaptive
- https://developer.android.com/about/versions/16/behavior-changes-16
