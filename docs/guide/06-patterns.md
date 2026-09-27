# Patterns

This part catalogues the layouts that change shape across window sizes. Each pattern gives when to
use it, what it looks like at each size, and a sketch in Jetpack Compose, SwiftUI and CSS/HTML.
Sketches take their content as parameters, so they stay short. The APIs they use are cited in
the Android, iOS and Web parts.

## List → detail

**When.** A collection whose items open into a detail view: mail, messages, settings, search
results.

| Window | Layout | Back |
|---|---|---|
| Compact width | One pane: the list, then the detail replaces it | Back returns from detail to list |
| Medium and wider (and both panes ≥ 320 dp; see Anti-patterns) | List and detail side by side | Selecting another item doesn't add a back step |

On Android the default back behaviour, `PopUntilScaffoldValueChange`, matches the table
([list-detail](https://developer.android.com/develop/ui/compose/layouts/adaptive/list-detail)).

### Compose

```kotlin
@Composable
fun <T : Parcelable> ListDetail(
    list: @Composable (onOpen: (T) -> Unit) -> Unit,
    detail: @Composable (T?) -> Unit,
) {
    val navigator = rememberListDetailPaneScaffoldNavigator<T>()
    val scope = rememberCoroutineScope()
    NavigableListDetailPaneScaffold(
        navigator = navigator,
        listPane = { AnimatedPane { list { item -> scope.launch { navigator.navigateTo(ListDetailPaneScaffoldRole.Detail, item) } } } },
        detailPane = { AnimatedPane { detail(navigator.currentDestination?.contentKey) } },
    )
}
```

### SwiftUI

Added with the iOS part.

### CSS/HTML

```html
<div class="list-detail">
  <div class="panes" data-open="false">
    <nav class="list">…</nav>
    <article class="detail">…</article>
  </div>
</div>
```

```css
/* The container can't query itself, so the grid lives one level down. */
.list-detail { container-type: inline-size; }
.panes { display: grid; }
/* One pane: show the list, or the detail once an item is open. */
@container (width < 40rem) {
  .panes[data-open="true"] .list,
  .panes[data-open="false"] .detail { display: none; }
}
/* Two panes when both fit at 20rem (320px at the default font size). */
@container (width >= 40rem) {
  .panes { grid-template-columns: minmax(20rem, 1fr) 2fr; }
}
```

A container query answers "is this component wide enough", not "is the viewport wide enough".
It styles the container's descendants, never the container itself: an element's query container is
one of its ancestors ([CSS Conditional Rules Level 5](https://drafts.csswg.org/css-conditional-5/),
[MDN: container queries](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries)).
Keeping the one-pane rules inside their own query also stops them from outranking the two-pane
rules by specificity.
`@container` is Baseline widely available since February 2023
([MDN: @container](https://developer.mozilla.org/en-US/docs/Web/CSS/@container)).

## Supporting pane / inspector

**When.** Main content with related tools or information that's useful but not required: an
inspector, related items, comments.

| Window | Layout |
|---|---|
| Compact width | Main content only. The supporting content opens on demand as a sheet or a new screen |
| Expanded and wider | Main and supporting side by side |

### Compose

```kotlin
@Composable
fun MainWithSupport(main: @Composable () -> Unit, support: @Composable () -> Unit) {
    val navigator = rememberSupportingPaneScaffoldNavigator()
    NavigableSupportingPaneScaffold(
        navigator = navigator,
        mainPane = { AnimatedPane { main() } },
        supportingPane = { AnimatedPane { support() } },
    )
}
```

The scaffold shows both panes in large windows, and one at a time in small ones
([supporting pane](https://developer.android.com/develop/ui/compose/layouts/adaptive/build-a-supporting-pane-layout)).

### SwiftUI

Added with the iOS part.

### CSS/HTML

```css
/* <div class="with-support"><div class="layout"><main>…</main><aside>…</aside></div></div> */
.with-support { container-type: inline-size; }
.layout { display: grid; gap: 1rem; }
.layout > aside { display: none; }
@container (width >= 52.5rem) {           /* 840px at the default font size */
  .layout { grid-template-columns: 1fr minmax(20rem, 22rem); }
  .layout > aside { display: block; }
}
```

## Feed and grid reflow

**When.** Cards, photos or products where the number of columns should follow the width.

| Window | Layout |
|---|---|
| Any | As many columns as fit, each at least a minimum width; one column when only one fits |

No branch is needed: the layout flows.

### Compose

```kotlin
@Composable
fun <T> Feed(items: List<T>, card: @Composable (T) -> Unit) {
    LazyVerticalGrid(columns = GridCells.Adaptive(minSize = 180.dp)) {
        items(items) { card(it) }
    }
}
```

`GridCells.Adaptive` fits as many columns as possible at the minimum size and shares the
remaining width
([Lists and grids](https://developer.android.com/develop/ui/compose/lists)).

### SwiftUI

Added with the iOS part.

### CSS/HTML

```css
.feed {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 11.25rem), 1fr));
}
```

`minmax()` sets each column's minimum and maximum
([MDN: minmax()](https://developer.mozilla.org/en-US/docs/Web/CSS/minmax)). `min(100%, …)` keeps a
single column from overflowing a window narrower than the minimum.

## Canvas plus controls

**When.** A map, video, photo or document with controls: playback, filters, a list of places.

| Window or posture | Layout |
|---|---|
| Compact | Canvas on top, controls below, scrolling |
| Wide | Canvas and a side panel of controls |
| Tabletop (horizontal fold, half open) | Canvas above the fold, controls below it |

Tabletop is `state == HALF_OPENED` with `orientation == HORIZONTAL`
([fold-aware guide](https://developer.android.com/develop/ui/compose/layouts/adaptive/foldables/make-your-app-fold-aware)).

### Compose

```kotlin
@Composable
fun CanvasAndControls(canvas: @Composable () -> Unit, controls: @Composable () -> Unit) {
    val folds by collectFoldingFeaturesAsState()
    val tabletop = folds.firstOrNull {
        it.state == FoldingFeature.State.HALF_OPENED && it.orientation == FoldingFeature.Orientation.HORIZONTAL
    }
    if (tabletop != null) {
        val foldTop = with(LocalDensity.current) { tabletop.bounds.top.toDp() }
        Column {
            Box(Modifier.height(foldTop)) { canvas() }            // above the fold
            Box(Modifier.weight(1f)) { controls() }               // below it
        }
    } else {
        Column { Box(Modifier.weight(1f)) { canvas() }; controls() }
    }
}
```

`bounds` is in window coordinates, and this assumes the composable fills the window. Picking the
horizontal half-opened feature (`firstOrNull { … }`) is safe here, because tri-folds don't support
tabletop
([trifolds](https://developer.android.com/develop/ui/compose/layouts/adaptive/foldables/trifolds-and-landscape-foldables)).

### SwiftUI

Added with the iOS part. iOS has no fold API, so the SwiftUI sketch covers compact and wide only.

### CSS/HTML

```css
.stage { display: grid; min-height: 100dvh; grid-template-rows: 1fr auto; }
@media (vertical-viewport-segments: 2) {
  /* Tabletop: the top segment is y index 0, the bottom one is 0 1. */
  .stage {
    grid-template-rows:
      env(viewport-segment-height 0 0)
      calc(env(viewport-segment-top 0 1) - env(viewport-segment-bottom 0 0))
      1fr;
  }
  .stage > .controls { grid-row: 3; }
}
```

The Viewport Segments API is **experimental, limited availability, not Baseline**
([MDN: Viewport Segments API](https://developer.mozilla.org/en-US/docs/Web/API/Viewport_segments_API)),
so the rules above must be an enhancement over a working default.

- **Index order:** the CSSWG draft says "segments along the top edge have y position 0"
  ([CSS Environment Variables, Editor's Draft](https://drafts.csswg.org/css-env-1/)).
- **MDN contradicts itself:** its env() page says both that vertical index 0 is "the bottom-most
  segment" and that "the top segment is represented by `0 0`"
  ([MDN: env()](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env)). This guide
  follows the spec.

## Navigation chrome that changes shape

**When.** Top-level destinations (three to five) that stay reachable everywhere.

| Window | Chrome |
|---|---|
| Compact width or height, or tabletop | Bottom navigation bar |
| Otherwise | Navigation rail at the side |
| Wide, if you choose | Navigation drawer (not an Android default) |

This follows `NavigationSuiteScaffold`'s documented behaviour
([adaptive navigation](https://developer.android.com/develop/ui/compose/layouts/adaptive/build-adaptive-navigation)).

### Compose

```kotlin
@Composable
fun AppNavigation(destinations: List<Pair<String, ImageVector>>, selected: Int, onSelect: (Int) -> Unit, content: @Composable () -> Unit) {
    NavigationSuiteScaffold(
        navigationSuiteItems = {
            destinations.forEachIndexed { i, (label, icon) ->
                item(selected = i == selected, onClick = { onSelect(i) }, icon = { Icon(icon, null) }, label = { Text(label) })
            }
        },
    ) { content() }
}
```

`item(selected, onClick, icon, label)` inside `navigationSuiteItems` is
[unverified — confirm before use] against your Navigation Suite version. The guide shows the
scaffold and the `layoutType` override, not the item signature.

### SwiftUI

Added with the iOS part.

### CSS/HTML

```html
<div class="app"><nav class="suite">…</nav><main>…</main></div>
```

```css
.app { display: grid; min-height: 100dvh; grid-template-rows: 1fr auto; }
.suite { display: flex; justify-content: space-around; }            /* bottom bar */
@media (width >= 600px) and (height >= 480px) {
  .app { grid-template-columns: auto 1fr; grid-template-rows: none; }
  .suite { flex-direction: column; justify-content: start; }         /* rail */
}
```

The 600 and 480 thresholds mirror Android's medium width and height classes
([window size classes](https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes)).
The web has no standard size classes, so pick thresholds for your content.

## Modals: sheets, dialogs and popovers

**When.** A short task or a choice that interrupts the current screen.

| Window | Presentation |
|---|---|
| Compact width | Bottom sheet, reachable with one thumb |
| Wider | Centred dialog, or a popover anchored to the control that opened it |

### Compose

```kotlin
@Composable
fun AdaptiveModal(wide: Boolean, onDismiss: () -> Unit, body: @Composable () -> Unit) {
    if (wide) {
        AlertDialog(onDismissRequest = onDismiss, confirmButton = {}, text = { body() })
    } else {
        ModalBottomSheet(onDismissRequest = onDismiss) { body() }
    }
}
```

`ModalBottomSheet(onDismissRequest)` is from
[Bottom sheets](https://developer.android.com/develop/ui/compose/components/bottom-sheets).
`AlertDialog(onDismissRequest, confirmButton, text)` is [unverified — confirm before use] against
your Material 3 version. Pass `wide` from the window size class.

### SwiftUI

Added with the iOS part.

### CSS/HTML

```html
<button popovertarget="filters">Filters</button>
<div popover id="filters">…</div>

<dialog id="confirm">…</dialog>
```

```css
dialog { max-inline-size: min(100vw - 2rem, 32rem); }
@media (width < 600px) {
  dialog { margin-block-end: 0; inline-size: 100%; max-inline-size: none; }   /* sheet */
}
```

- **`<dialog>`:** Baseline widely available since March 2022; `showModal()` opens it modally
  ([MDN: dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog)).
- **The `popover` attribute:** Baseline 2024, newly available since April 2024
  ([MDN: popover](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/popover)).

## Forms and long text: measure lines, not pixels

**When.** Reading text and forms in a wide window.

| Window | Layout |
|---|---|
| Any | Text columns capped at a readable line length; fields no wider than their content needs |
| Wide | Extra space goes to margins or a second column, not longer lines |

WCAG 1.4.8 (AAA) caps blocks of text at "no more than 80 characters or glyphs (40 if CJK)"
([WCAG 2.2: Visual Presentation](https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html)).

### Compose

```kotlin
@Composable
fun ReadingColumn(content: @Composable ColumnScope.() -> Unit) {
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
        Column(Modifier.widthIn(max = 640.dp).padding(horizontal = 16.dp), content = content)
    }
}
```

`Modifier.widthIn(min, max)` is in Compose foundation layout
([Compose modifiers](https://developer.android.com/develop/ui/compose/modifiers-list)). 640 dp is a
starting value for body text at the default size: check it against the 80-character cap, since
line length depends on font and text size.

### SwiftUI

Added with the iOS part.

### CSS/HTML

```css
.prose { max-inline-size: 70ch; margin-inline: auto; padding-inline: 1rem; }
.field { max-inline-size: 30ch; }
```

`ch` is the width of the "0" glyph, so `70ch` measures lines in characters and follows the font
size ([MDN: <length>](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length)).

## Glossary entries

container query | A CSS rule (`@container`) that styles an element by the size of its container rather than the viewport | Web | Android: none (read the size the parent gives, for example `BoxWithConstraints`) [unverified — confirm before use]; iOS: `ViewThatFits` and the proposed size | https://developer.mozilla.org/en-US/docs/Web/CSS/@container
intrinsic sizing | Sizing from content and constraints (min, max, fit) rather than fixed breakpoints | Web, Android, iOS | Android: `GridCells.Adaptive`, `widthIn`; iOS: `ViewThatFits`; Web: `minmax()`, `auto-fill` | https://developer.mozilla.org/en-US/docs/Web/CSS/minmax
viewport segment | A logically separate region of the viewport, created when a fold or hinge splits it | Web | Android: the areas between separating `FoldingFeature`s; iOS: none | https://developer.mozilla.org/en-US/docs/Web/API/Viewport_segments_API
grid gutter | The space between grid columns | Android, iOS, Web | Android: `Arrangement.spacedBy`, the grid gutter in layout guidance; iOS: `spacing` in grids and stacks; Web: `gap` | https://developer.mozilla.org/en-US/docs/Web/CSS/minmax
reachability | Keeping frequent controls where one thumb can reach them, which is why compact modals become bottom sheets | Android, iOS | Android: bottom sheet and navigation bar placement; iOS: sheets; Web: none as a term | https://developer.android.com/develop/ui/compose/components/bottom-sheets

## Sources

- https://developer.android.com/develop/ui/compose/layouts/adaptive/list-detail
- https://developer.android.com/develop/ui/compose/layouts/adaptive/build-a-supporting-pane-layout
- https://developer.android.com/develop/ui/compose/lists
- https://developer.android.com/develop/ui/compose/layouts/adaptive/foldables/make-your-app-fold-aware
- https://developer.android.com/develop/ui/compose/layouts/adaptive/foldables/trifolds-and-landscape-foldables
- https://developer.android.com/develop/ui/compose/layouts/adaptive/build-adaptive-navigation
- https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes
- https://developer.android.com/develop/ui/compose/components/bottom-sheets
- https://developer.android.com/develop/ui/compose/modifiers-list
- https://developer.mozilla.org/en-US/docs/Web/CSS/@container
- https://developer.mozilla.org/en-US/docs/Web/CSS/minmax
- https://developer.mozilla.org/en-US/docs/Web/API/Viewport_segments_API
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/popover
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length
- https://drafts.csswg.org/css-env-1/
- https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html
