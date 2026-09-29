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

First check for the emulator command: see [emulators.md](emulators.md). If it's there, follow it
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
