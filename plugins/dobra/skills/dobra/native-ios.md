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
