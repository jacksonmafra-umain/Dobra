# Anti-patterns

This part lists the layout mistakes that break most often on foldables, tablets, desktop windows
and resizable browsers. Each entry gives the mistake, why it fails, and what to do instead, with
the platform APIs that replace it.

## Branching on orientation instead of available width

**The mistake.** Choosing a two-column layout because the device is in landscape.

**Why it fails.** Orientation says which side is longer, not how much room there is. A
clamshell foldable's cover display can be landscape-shaped and still compact in width. An open book
foldable is portrait-shaped and wide enough for two panes. On the web, `orientation` is a property
of the viewport, and "opening the soft keyboard on many devices in portrait orientation will cause
the viewport to become wider than it is tall, thereby causing the browser to use landscape styles"
([MDN: orientation](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/orientation)).

**Instead.** Branch on width:

| Platform | Use |
|---|---|
| Android | `windowSizeClass.isWidthAtLeastBreakpoint(WindowSizeClass.WIDTH_DP_MEDIUM_LOWER_BOUND)` ([window size classes](https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes)) |
| iOS | `@Environment(\.horizontalSizeClass)`. SwiftUI sets it from the device type, its orientation and Slide Over or Split View, so read it rather than orientation ([horizontalSizeClass](https://developer.apple.com/documentation/swiftui/environmentvalues/horizontalsizeclass)) |
| Web | A `min-width` media query, or a container query on the component's own width ([MDN: container queries](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_size_and_style_queries)) |

## Reading the display size instead of the window size

**The mistake.** Laying out from the screen's pixel size.

**Why it fails.** An app gets a window, not the display. It can be in split-screen, a
desktop-windowing window, one display of a foldable, or a browser tab of any width. Android's
guidance is to avoid "physical hardware values for making layout decisions"
([display sizes](https://developer.android.com/develop/ui/compose/layouts/adaptive/support-different-display-sizes)).
On the web, `screen.width` is the screen's width, and "not all of the width given by this property
may be available to the window itself"
([MDN: Screen.width](https://developer.mozilla.org/en-US/docs/Web/API/Screen/width)).

**Instead.**

| Platform | Use |
|---|---|
| Android | `currentWindowAdaptiveInfoV2()` in Compose, or `WindowMetricsCalculator.getOrCreate().computeCurrentWindowMetrics(activity)` ([reference](https://developer.android.com/reference/androidx/window/layout/WindowMetricsCalculator)) |
| iOS | The size class, and the space the container proposes (for example `ViewThatFits`, which picks "the first child view that fits" ([ViewThatFits](https://developer.apple.com/documentation/swiftui/viewthatfits))) |
| Web | Media queries on the viewport, container queries on the component, or `ResizeObserver` for an element's size ([MDN: ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver)) |

## Taking the first folding feature on a foldable

**The mistake.** `foldingFeatures.firstOrNull()`, then treating the device as "folded or not".

**Why it fails.** The API reports a list: `collectFoldingFeaturesAsState()` returns
`State<List<FoldingFeature>>`
([fold-aware guide](https://developer.android.com/develop/ui/compose/layouts/adaptive/foldables/make-your-app-fold-aware)).
A device with two hinges needs every entry to know where the areas between them are. How many
features a given tri-fold reports in each posture is [unverified — confirm before use].

**Instead.** Filter the list by `isSeparating`, and lay out one area between each pair of separating
features. On the web, iterate every viewport segment rather than assuming two
(see the Web part).

## Hardcoding device names or model checks

**The mistake.** `if (model == "…Fold…")`, or "is tablet" checks from a device list.

**Why it fails.** New devices ship all the time, and the same device changes shape when it folds.
The Android guidance is direct: "Window size classes are not intended for *isTablet*‑type logic"
([window size classes](https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes)).

**Instead.** Decide from the window: its size class, its folding features and its insets. Decide
from capabilities, not model names.

## Assuming the window size never changes after first layout

**The mistake.** Measuring once at launch and keeping the result.

**Why it fails.** Windows change size while the app runs:
- **Fold and unfold:** the window changes when the device folds.
- **Resizing:** the user resizes it in split-screen or desktop windowing.
- **iPad:** "factors like device orientation can change at runtime"
  ([horizontalSizeClass](https://developer.apple.com/documentation/swiftui/environmentvalues/horizontalsizeclass)).
- **Android:** `NavigationSuiteScaffold` "dynamically changes the UI during runtime window size
  changes" ([adaptive navigation](https://developer.android.com/develop/ui/compose/layouts/adaptive/build-adaptive-navigation)),
  and a size change is a configuration change that recreates the Activity unless it is handled
  ([configuration changes](https://developer.android.com/guide/topics/resources/runtime-changes)).

**Instead.** Read size from state that updates: the Compose adaptive info, the SwiftUI environment,
or CSS queries. Keep UI state in `rememberSaveable` or a `ViewModel` on Android, so a fold doesn't
reset the screen (same page).

## Fixed-height containers holding user-scalable text

**The mistake.** A card, button or bar with a fixed height and text inside.

**Why it fails.** Users scale text:
- **Android:** `sp` is "scaled by the user's font size preference"
  ([dimension resources](https://developer.android.com/guide/topics/resources/more-resources)).
- **iOS:** Dynamic Type scales text, and `ScaledMetric` scales numeric values with it
  ([ScaledMetric](https://developer.apple.com/documentation/swiftui/scaledmetric)).
- **Web:** WCAG 1.4.4 (AA) requires that text "can be resized without assistive technology up to
  200 percent without loss of content or functionality". Text that is "clipped, truncated or
  obscured" at 200% is a listed failure
  ([WCAG 2.2: Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)).

**Instead.** Let containers grow with their content: set a minimum height, not a fixed one. Scale
spacing that sits next to text with `ScaledMetric` on iOS, or use `rem` and `em` on the web. Test at
200% text size on every platform.

## Treating a wide window as automatically meaning "tablet UI"

**The mistake.** Switching to a "tablet design" whenever the window is wide.

**Why it fails.** Width says how much room there is, not what kind of device it is:
- a wide window can be a desktop window driven by mouse and keyboard, or an unfolded phone held in
  one hand;
- a tablet can run your app in a narrow split-screen window.

Window size classes are "determined by the window size available to your application regardless
of the type of device"
([window size classes](https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes)).

**Instead.** Use width to decide how many panes and which navigation shape. Use input and
capability signals for input-specific behaviour: pointer precision, keyboard and posture. The
web's `pointer` media feature covers pointer precision (see the Web part).

## Splitting into panes too narrow to read

**The mistake.** Splitting a window in two because it is wide enough overall, which leaves each
pane so narrow that text wraps after a word or two.

**Why it fails.** A 40% pane of a 360 dp window is 144 dp: roughly a word per line at body size.
A width breakpoint for the whole window doesn't guarantee a readable pane.

**Instead.** Give each pane holding reading text a minimum width, and fall back to one pane when a
pane would be narrower.

- **A concrete floor: 320 CSS px (dp or pt) for a pane holding body text.** This follows WCAG
  1.4.10 Reflow (AA), which requires content to work "at a width equivalent to 320 CSS pixels"
  without scrolling in two dimensions
  ([WCAG 2.2: Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)). WCAG states that
  width for the viewport. Applying it to each pane is this guide's recommendation, not a WCAG
  requirement.
- **Enforcing it:**
  - **Android:** use two panes only when `windowWidth / 2 ≥ 320 dp` after margins, and let the
    list-detail scaffold show one pane otherwise
    ([list-detail](https://developer.android.com/develop/ui/compose/layouts/adaptive/list-detail)).
  - **iOS:** `ViewThatFits` with the two-pane layout first and the single pane second.
  - **Web:** `grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr))` gives
    columns that are never narrower than 20rem and collapse to one when they can't fit
    ([MDN: minmax()](https://developer.mozilla.org/en-US/docs/Web/CSS/minmax)).
- **Checking it:** Dobra's own checker flags text blocks narrower than 200 units as
  `min-legible-width`. That threshold is marked estimated: it catches the worst cases, and the
  320 floor above is the design target.

## Glossary entries

reflow | Content re-laying out to fit a narrower viewport without two-dimensional scrolling (WCAG 1.4.10, 320 CSS px) | Web (WCAG); applies to all | Android: none as a term; iOS: none as a term | https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
orientation | Whether the window or viewport is taller than wide (portrait) or wider than tall (landscape); not the device's physical orientation | Android, iOS, Web | Android: `Configuration.orientation`; iOS: the device or interface orientation; Web: the `orientation` media feature | https://developer.mozilla.org/en-US/docs/Web/CSS/@media/orientation
screen vs window | The screen is the physical display; the window is the area the app gets, which can be smaller, split or resized | Android, iOS, Web | Android: display metrics vs window metrics; iOS: screen vs window scene; Web: `screen.width` vs the viewport | https://developer.android.com/develop/ui/compose/layouts/adaptive/support-different-display-sizes
sp | Scale-independent pixel: like dp, but also scaled by the user's font size preference | Android | iOS: Dynamic Type text styles; Web: `rem` | https://developer.android.com/guide/topics/resources/more-resources
dp | Density-independent pixel: a unit relative to a 160 dpi screen, where 1 dp is about 1 px | Android | iOS: `pt`; Web: CSS `px` | https://developer.android.com/guide/topics/resources/more-resources
ScaledMetric | A SwiftUI property wrapper that scales a numeric value with Dynamic Type | iOS | Android: `sp`, or scaling by the font scale; Web: `rem` and `em` | https://developer.apple.com/documentation/swiftui/scaledmetric

## Sources

- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/orientation
- https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_size_and_style_queries
- https://developer.mozilla.org/en-US/docs/Web/API/Screen/width
- https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver
- https://developer.mozilla.org/en-US/docs/Web/CSS/minmax
- https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes
- https://developer.android.com/develop/ui/compose/layouts/adaptive/support-different-display-sizes
- https://developer.android.com/develop/ui/compose/layouts/adaptive/foldables/make-your-app-fold-aware
- https://developer.android.com/develop/ui/compose/layouts/adaptive/build-adaptive-navigation
- https://developer.android.com/develop/ui/compose/layouts/adaptive/list-detail
- https://developer.android.com/guide/topics/resources/runtime-changes
- https://developer.android.com/guide/topics/resources/more-resources
- https://developer.android.com/reference/androidx/window/layout/WindowMetricsCalculator
- https://developer.apple.com/documentation/swiftui/environmentvalues/horizontalsizeclass
- https://developer.apple.com/documentation/swiftui/viewthatfits
- https://developer.apple.com/documentation/swiftui/scaledmetric
- https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html
- https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
