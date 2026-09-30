# The Web

This part answers the Web questions: when to branch on the viewport and when on a component's own
space, how to lay out intrinsically so fewer breakpoints are needed, and how to handle safe areas,
foldables and user preferences in CSS. Every feature carries its Baseline or browser support status,
checked on 2026-09-27; features that are not Baseline are labelled.

## Media queries and container queries

A media query asks about the viewport, the device or the user's settings. A container query asks
about the size of an ancestor element, so a component can adapt to the space it is given rather
than to the window ([MDN: `@container`](https://developer.mozilla.org/en-US/docs/Web/CSS/@container)).
Use media queries for page-level structure (how many columns the page has, where navigation
goes) and container queries for components that appear in more than one layout (a card that sits
in a list and in a sidebar).

```css
/* Page level: the viewport decides. */
@media (width >= 600px) {
  .page { grid-template-columns: 20rem 1fr; }
}

/* Component level: the container decides. */
.card-slot { container: card / inline-size; }
@container card (width >= 400px) {
  .card { display: grid; grid-template-columns: 8rem 1fr; }
}
```

| Feature | What it does | Status (checked 2026-09-27) |
|---|---|---|
| `@media` | Conditions on the viewport, device and user preferences ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media)) | Baseline Widely available since July 2015 |
| Range syntax, `(400px <= width <= 700px)` | Comparison operators in place of `min-`/`max-` prefixes ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Using)) | Baseline Widely available since September 2025 ([web.dev Baseline digest](https://web.dev/blog/baseline-digest-sep-2025)); Chrome/Edge 104, Firefox 102, Safari 16.4 ([web.dev](https://web.dev/articles/media-query-range-syntax)) |
| `@container` size queries | Query `width`, `height`, `inline-size`, `block-size`, `aspect-ratio`, `orientation` of a container ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@container)) | Baseline Widely available since February 2023; MDN notes some parts vary |
| `container-type` | `size`, `inline-size` or `normal` ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/container-type)) | Baseline Widely available since February 2023 |
| `container-name` | Names a container so a query can target it ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/container-name)) | Baseline Widely available since February 2023 |
| Container query units `cqw`, `cqh`, `cqi`, `cqb`, `cqmin`, `cqmax` | 1% of the container's width, height, inline or block size; without a container they fall back to the small viewport units ([MDN: `<length>`](https://developer.mozilla.org/en-US/docs/Web/CSS/length)) | [unverified — confirm before use] (MDN's banner on that page covers `<length>` as a whole) |
| Container style queries, `@container style(--theme: dark)` | Query a custom property's value on the container; no `container-type` needed ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_size_and_style_queries)) | Baseline Newly available in 2026, for custom properties, when Firefox 151 shipped them ([web.dev](https://web.dev/blog/web-platform-05-2026)). Queries on regular properties such as `style(font-weight: bold)`: [unverified — confirm before use] |

A size container needs `container-type` (or the `container` shorthand) set to `size` or
`inline-size`. `inline-size` is the usual choice, because it lets the container's height still
follow its content ([MDN: `container-type`](https://developer.mozilla.org/en-US/docs/Web/CSS/container-type)).

## Intrinsic layout

Intrinsic layout lets the content and the available space decide the layout, so a grid reflows
without a breakpoint for every width. Reach for it first, and add a query only where the layout
has to change shape.

```css
/* As many columns of at least 16rem as fit; empty tracks collapse. */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: 1rem;
}

/* Items wrap onto new lines instead of shrinking below their basis. */
.row { display: flex; flex-wrap: wrap; gap: 1rem; }
.row > * { flex: 1 1 18rem; }
```

| Tool | What it does | Status (checked 2026-09-27) |
|---|---|---|
| `repeat(auto-fill \| auto-fit, …)` | Repeats tracks to fill the row; "`auto-fit` behaves the same as `auto-fill`, except that after placing the grid items any empty repeated tracks are collapsed" ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/repeat)) | `grid-template-columns` is Baseline Widely available since October 2017 ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/grid-template-columns)); the `repeat()` page has no banner of its own |
| `minmax(min, max)` | A track size range ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/minmax)) | Baseline Widely available since October 2017 |
| `flex-wrap`, `flex-basis` | Wrapping lines and an item's starting size ([MDN: `flex-wrap`](https://developer.mozilla.org/en-US/docs/Web/CSS/flex-wrap), [MDN: `flex-basis`](https://developer.mozilla.org/en-US/docs/Web/CSS/flex-basis)) | Baseline Widely available since September 2015 |
| `clamp(MIN, VAL, MAX)` | Equals `max(MIN, min(VAL, MAX))` ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/clamp)) | Baseline Widely available since July 2020 |
| `min()`, `max()` | The smallest or largest of a list ([MDN: `min()`](https://developer.mozilla.org/en-US/docs/Web/CSS/min), [MDN: `max()`](https://developer.mozilla.org/en-US/docs/Web/CSS/max)) | Baseline Widely available since July 2020 |
| Subgrid, `grid-template-columns: subgrid` | A nested grid uses its parent's tracks ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout/Subgrid)) | Baseline Widely available since September 2023 |

**Fluid type.** Scale text between two sizes with `clamp()`, and always mix a relative unit into
the middle value, for example `html { font-size: clamp(1em, 17px + 0.24vw, 1.125em); }`. web.dev
warns that "using viewport or container-relative units on their own for `font-size` is always
hostile to the user", and that a maximum more than 2.5 times the minimum can stop users reaching
the 200% text resize that WCAG requires ([web.dev: fluid type](https://web.dev/articles/baseline-in-action-fluid-type)).
MDN gives the same accessibility caution for text in `clamp()` ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/clamp)).
For type inside a component, use `cqi` in place of `vw` ([web.dev](https://web.dev/articles/baseline-in-action-fluid-type)).

## Logical properties

Logical properties name sides by flow, not by screen direction: "block" and "inline" map to the
physical sides according to `writing-mode`, `direction` and `text-orientation`
([MDN: logical properties](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_logical_properties_and_values)).
A layout written with them mirrors correctly for right-to-left languages without a second
stylesheet.

| Physical | Logical | Status (checked 2026-09-27) |
|---|---|---|
| `width`, `height` | `inline-size`, `block-size` ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/inline-size), [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/block-size)) | Baseline Widely available since January 2020 |
| `margin-left` + `margin-right` | `margin-inline` ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/margin-inline)) | Baseline Widely available since April 2021 |
| `padding-top` + `padding-bottom` | `padding-block` ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/padding-block)) | Baseline Widely available since April 2021 |
| `left` (in left-to-right text) | `inset-inline-start` ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/inset-inline-start)) | Baseline Widely available since April 2021 |

## Viewport units

On mobile, the browser's toolbars expand and retract, so "the viewport height" has three values
([web.dev: viewport units](https://web.dev/blog/viewport-units),
[MDN: `<length>`](https://developer.mozilla.org/en-US/docs/Web/CSS/length)):

| Units | Size | Use for |
|---|---|---|
| `svh`, `svw`, `svi`, `svb`, `svmin`, `svmax` | Small: the viewport with the toolbars expanded | Content that must be fully visible at load, such as a hero with its call to action |
| `lvh`, `lvw`, … | Large: the viewport with the toolbars retracted | Backgrounds that may be partly covered |
| `dvh`, `dvw`, … | Dynamic: whichever state the toolbars are in now | Full-height layouts that should follow the toolbars; they can cause relayout while the user scrolls |

MDN notes that `vh` and `vw` currently match the large sizes, and on desktop all three are the same
([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/length)). The units are defined in CSS
Values and Units Level 4, a W3C Working Draft ([W3C](https://www.w3.org/TR/css-values-4/)).
Support per MDN's compatibility data: Chrome and Chrome Android 108, Edge 108, Firefox 101, Safari
and Safari iOS 15.4 ([MDN compat data](https://bcd.developer.mozilla.org/bcd/api/v0/current/css.types.length.viewport_percentage_units_small.json)).
Baseline label for these units specifically: [unverified — confirm before use]. By web.dev's
definition, the last core browser shipping in December 2022 would make them Widely available from
about June 2025 ([web.dev: Baseline](https://web.dev/baseline)).

## Safe areas

Rounded corners, notches and system bars can cover part of the viewport. The
`env(safe-area-inset-top | right | bottom | left)` variables give the distance to keep content clear
of them ([MDN: `env()`](https://developer.mozilla.org/en-US/docs/Web/CSS/env)). They are defined in
the CSS Environment Variables Module Level 1, a W3C Working Draft
([W3C](https://www.w3.org/TR/css-env-1/)). `env()` is Baseline Widely available since January 2020
(checked 2026-09-27).

`viewport-fit=cover` in the viewport meta tag scales the viewport to fill the display, and MDN
recommends pairing it with the safe-area inset variables so content stays clear of what covers the
edges
([MDN: viewport meta](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport)):

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

```css
.bottom-bar {
  padding-block-end: max(1rem, env(safe-area-inset-bottom));
  padding-inline: max(1rem, env(safe-area-inset-left)) max(1rem, env(safe-area-inset-right));
}
```

`viewport-fit` has no Baseline label. Per MDN's compatibility data it works in Safari iOS 11 and
Chrome Android 135, and not in desktop browsers (checked 2026-09-27;
[MDN compat data](https://bcd.developer.mozilla.org/bcd/api/v0/current/html.elements.meta.name.viewport.json)).
Always include the viewport meta tag with `width=device-width` in the first place
([MDN: responsive design](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Responsive_Design)).

## Foldables and dual screens: the Viewport Segments API

On a foldable or dual-screen device, a fold or hinge can split the viewport into segments. MDN
groups the pieces as the "Viewport Segments API"
([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Viewport_segments_API)); they come from
three CSS Working Group specifications:

| Piece | Spec and stage | Support (checked 2026-09-27) |
|---|---|---|
| Media features `horizontal-viewport-segments`, `vertical-viewport-segments` (range, `<integer>`) | Media Queries Level 5, W3C Working Draft ([W3C](https://www.w3.org/TR/mediaqueries-5/)) | Limited availability, Experimental. Chrome, Edge and Chrome Android 138; not in Firefox or Safari ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/horizontal-viewport-segments)) |
| Environment variables `viewport-segment-width`, `-height`, `-top`, `-left`, `-bottom`, `-right` | CSS Environment Variables Module Level 1, W3C Working Draft; Editor's Draft newer ([W3C](https://www.w3.org/TR/css-env-1/), [Editor's Draft](https://drafts.csswg.org/css-env-1/)) | Limited availability, Experimental. Chrome, Edge and Chrome Android 138; not in Firefox or Safari ([MDN: `env()`](https://developer.mozilla.org/en-US/docs/Web/CSS/env)) |
| JavaScript `window.viewport.segments`, an array of `DOMRect` | CSS Viewport Module Level 1, Editor's Draft ([CSSWG](https://drafts.csswg.org/css-viewport/)) | Limited availability, Experimental. Chrome, Edge and Chrome Android 138; not in Firefox or Safari ([MDN: `Window.viewport`](https://developer.mozilla.org/en-US/docs/Web/API/Window/viewport)) |

The JavaScript surface is `window.viewport.segments`, not `window.viewportSegments`
([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/viewport)). An unfolded or
non-foldable device reports a single segment covering the whole viewport
([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Viewport_segments_API)).

**Indexes.** Each variable takes two indexes, `x` then `y`. The specification is explicit:
"Segments along the left edge have x position 0 … Similarly, segments along the top edge have y
position 0" ([CSSWG Editor's Draft](https://drafts.csswg.org/css-env-1/)). MDN's `env()` page
describes the vertical index inconsistently, so follow the specification: in a top-to-bottom split,
the top segment is `0 0` and the bottom one is `0 1`.

```css
/* Side by side across a vertical fold or hinge; one column per segment, the hinge as the gap. */
@media (horizontal-viewport-segments: 2) {
  .split {
    display: grid;
    grid-template-columns:
      env(viewport-segment-width 0 0) env(viewport-segment-width 1 0);
    column-gap: calc(env(viewport-segment-left 1 0) - env(viewport-segment-right 0 0));
  }
}

/* Stacked across a horizontal fold (tabletop): content on top, controls below. */
@media (vertical-viewport-segments: 2) {
  .stage { block-size: env(viewport-segment-height 0 0); }
  .controls { block-size: env(viewport-segment-height 0 1); }
}
```

Adapted from the MDN example ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/horizontal-viewport-segments)).
Give every `env()` a fallback value, or a layout outside the media query, so browsers without the
API still get a working single-segment layout.

**Device Posture API.** A separate API reports whether the device is `continuous` or `folded`,
through `navigator.devicePosture.type` and the `device-posture` media feature
([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Device_Posture_API)). It is a W3C Candidate
Recommendation Draft from the Devices and Sensors Working Group
([W3C](https://www.w3.org/TR/device-posture/)). Limited availability, Experimental: Chrome, Edge and
Chrome Android 132; not in Firefox; not in Safari by default (checked 2026-09-27,
[MDN](https://developer.mozilla.org/en-US/docs/Web/API/Device_Posture_API)). Prefer segments for
layout: they tell you where the fold is, and posture only tells you that there is one.

## User preferences

| Feature | Values | Status (checked 2026-09-27) |
|---|---|---|
| `prefers-reduced-motion` | `no-preference`, `reduce` ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)) | Baseline Widely available since January 2020 |
| `prefers-color-scheme` | `light`, `dark` ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme)) | Baseline Widely available since January 2020 |
| `prefers-contrast` | `no-preference`, `more`, `less`, `custom` ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-contrast)) | Baseline Widely available since May 2022 |
| `prefers-reduced-transparency` | `no-preference`, `reduce` ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency)) | Limited availability, Experimental |
| `prefers-reduced-data` | `no-preference`, `reduce` ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-data)) | Limited availability, Experimental; MDN says it is not supported by any user agent |
| `forced-colors` | `none`, `active` ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors)) | Baseline Widely available since September 2022 |
| `forced-color-adjust` property | `auto`, `none`, `preserve-parent-color` ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/forced-color-adjust)) | Limited availability |
| `color-scheme` property | `normal`, `light`, `dark`, `light dark` ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/color-scheme)) | Baseline Widely available since January 2022 |
| `light-dark()` | Picks one of two colours by the used colour scheme ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark)) | Baseline Newly available since May 2024 |

`light-dark()` only works when `color-scheme: light dark` is set on the element or the root
([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark)). In forced colors
mode the user's palette replaces yours and `box-shadow` is forced to `none`, so don't carry meaning
in shadows or background images alone ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors)).

```css
:root { color-scheme: light dark; --surface: light-dark(#fff, #17171a); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms; transition-duration: 0.01ms; }
}
```

## Responsive images

The WHATWG HTML standard defines how a browser picks an image from `srcset` and `sizes`
([WHATWG HTML: images](https://html.spec.whatwg.org/multipage/images.html)), and MDN's guide walks
through it ([MDN: responsive images](https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images)):

- **`srcset` with `w` descriptors** lists candidate files and their intrinsic pixel widths.
- **`sizes`** pairs media conditions with the width of the slot the image fills, so the browser can
  choose before layout.
- **`<picture>`** chooses by art direction (`<source media>`) or by format (`<source type>`), with a
  required `<img>` fallback. Baseline Widely available since March 2016
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/picture)).

```html
<img srcset="card-480w.jpg 480w, card-800w.jpg 800w"
     sizes="(width <= 600px) 480px, 800px"
     src="card-800w.jpg" alt="…">

<picture>
  <source type="image/avif" srcset="hero.avif">
  <source type="image/webp" srcset="hero.webp">
  <img src="hero.jpg" alt="…">
</picture>
```

`loading="lazy"` defers an image until it nears the viewport; web.dev advises against lazy-loading
images likely to be in view at load, especially the LCP image. Support: Chrome 77, Edge 79,
Firefox 121, Safari 16.4 ([web.dev](https://web.dev/articles/browser-level-image-lazy-loading)).
Baseline label for `loading` on its own: [unverified — confirm before use].

`sizes` describes the slot in the viewport, so when a container query changes a component's width,
update `sizes` to match, or the browser picks for the wrong slot.

## Testing and the limits of emulation

**In script.** `window.matchMedia()` returns a `MediaQueryList` whose `matches` tells you the
current result; listen for `change` on it rather than for `resize`
([MDN: testing media queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Testing),
[MDN: `matchMedia`](https://developer.mozilla.org/en-US/docs/Web/API/Window/matchMedia)). The
`resize` event fires only on `window` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/resize_event));
for an element's size, use `ResizeObserver`
([MDN](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver)). `matchMedia` and `resize`
are Baseline Widely available since July 2015, and `ResizeObserver` since July 2020 (checked
2026-09-27).

**Resize, don't only reload.** A foldable unfolds while the page is open. A layout chosen once from
`innerWidth` at load looks right after a reload and wrong after a live resize. Test both.

**What emulation covers.** Browser device emulation sets the viewport size, device pixel ratio,
touch and user agent. It runs on a desktop CPU and cannot reproduce every mobile behaviour, so its
own documentation calls it a first-order approximation and recommends real devices
(non-authoritative, vendor documentation: [Chrome DevTools device mode](https://developer.chrome.com/docs/devtools/device-mode)).

**Foldables in emulation.** Chrome's documentation describes emulating a foldable with a
Continuous/Folded posture toggle (non-authoritative:
[Chrome blog](https://developer.chrome.com/blog/foldable-apis-ot)), while MDN says current
developer tools "can emulate foldable devices but do not include emulation of different physical
segments" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Viewport_segments_API)). Whether
segments populate in DevTools device mode: [unverified — confirm before use]. WebKit ships none of
the segment features, so iOS and Safari targets can only be tested for size; a Safari segment
emulation: [unverified — confirm before use].

**What emulation can't tell you.** Hinge thickness and occlusion come from the hardware, so test
the final layout on a physical foldable or dual-screen device. Dobra's CLI drives Chromium's
display-feature emulation for this, and its fixture pages in `examples/sites/` show one failure
each plus a fold-aware `good.html`.

## Glossary entries

container query | A CSS condition on the size (or custom properties) of an ancestor container rather than the viewport | Web | Android: none (components read their own constraints, e.g. `BoxWithConstraints`) [unverified — confirm before use]; iOS: none | https://developer.mozilla.org/en-US/docs/Web/CSS/@container
container query units | `cqw`, `cqh`, `cqi`, `cqb`, `cqmin`, `cqmax`: 1% of the query container's size | Web | none | https://developer.mozilla.org/en-US/docs/Web/CSS/length
media query | A CSS condition on the viewport, device or user preferences, written `@media` | Web | Android: window size classes; iOS: size classes | https://developer.mozilla.org/en-US/docs/Web/CSS/@media
range syntax | Media query comparisons written with `<`, `<=`, `>`, `>=` instead of `min-`/`max-` | Web | none | https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Using
intrinsic layout | Layout sized by content and available space (`auto-fit`, `minmax()`, `flex-wrap`, `clamp()`) instead of fixed breakpoints | Web | Android: `FlowRow` and lazy grids with adaptive cells [unverified — confirm before use]; iOS: adaptive grid items [unverified — confirm before use] | https://developer.mozilla.org/en-US/docs/Web/CSS/repeat
fluid type | Font sizes that scale between a minimum and a maximum with `clamp()` | Web | Android: none (sp follows the user's font scale); iOS: none (Dynamic Type) | https://web.dev/articles/baseline-in-action-fluid-type
logical properties | CSS properties named by flow direction (inline/block, start/end) instead of physical sides | Web | Android: start/end layout directions; iOS: leading/trailing | https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_logical_properties_and_values
small, large and dynamic viewport units | `sv*`, `lv*`, `dv*`: viewport sizes with mobile toolbars expanded, retracted, or as they are now | Web | none | https://web.dev/blog/viewport-units
safe-area inset | `env(safe-area-inset-*)`: the distance to keep content clear of notches, corners and system bars | Web | Android: window insets; iOS: safe area | https://developer.mozilla.org/en-US/docs/Web/CSS/env
viewport-fit | A viewport meta value; `cover` lays the page out to the display edges so the page pads with the safe-area insets itself | Web | Android: edge-to-edge; iOS: ignoring the safe area | https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport
viewport segment | One of the logical areas a fold or hinge splits the viewport into, exposed as media features, `env(viewport-segment-*)` and `window.viewport.segments` | Web | Android: the areas either side of a separating `FoldingFeature`; iOS: the areas either side of a `division` reserved region (iOS 27.1 beta) | https://developer.mozilla.org/en-US/docs/Web/API/Viewport_segments_API
device posture | Whether a foldable is `continuous` or `folded`, from `navigator.devicePosture` and the `device-posture` media feature | Web | Android: `FoldingFeature.state`; iOS: none | https://developer.mozilla.org/en-US/docs/Web/API/Device_Posture_API
forced colors | A mode (such as Windows High Contrast) where the user's palette replaces the page's colours, detected with `forced-colors: active` | Web | Android: high-contrast text [unverified — confirm before use]; iOS: Increase Contrast [unverified — confirm before use] | https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors
Baseline | web.dev's label for features that work in all core browsers: Newly available once the last one ships, Widely available 30 months later | Web | none | https://web.dev/baseline

## Sources

- https://developer.mozilla.org/en-US/docs/Web/CSS/@media
- https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Using
- https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Testing
- https://developer.mozilla.org/en-US/docs/Web/CSS/@container
- https://developer.mozilla.org/en-US/docs/Web/CSS/container-type
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/container-name
- https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_size_and_style_queries
- https://developer.mozilla.org/en-US/docs/Web/CSS/length
- https://developer.mozilla.org/en-US/docs/Web/CSS/repeat
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/grid-template-columns
- https://developer.mozilla.org/en-US/docs/Web/CSS/minmax
- https://developer.mozilla.org/en-US/docs/Web/CSS/flex-wrap
- https://developer.mozilla.org/en-US/docs/Web/CSS/flex-basis
- https://developer.mozilla.org/en-US/docs/Web/CSS/clamp
- https://developer.mozilla.org/en-US/docs/Web/CSS/min
- https://developer.mozilla.org/en-US/docs/Web/CSS/max
- https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout/Subgrid
- https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_logical_properties_and_values
- https://developer.mozilla.org/en-US/docs/Web/CSS/inline-size
- https://developer.mozilla.org/en-US/docs/Web/CSS/block-size
- https://developer.mozilla.org/en-US/docs/Web/CSS/margin-inline
- https://developer.mozilla.org/en-US/docs/Web/CSS/padding-block
- https://developer.mozilla.org/en-US/docs/Web/CSS/inset-inline-start
- https://developer.mozilla.org/en-US/docs/Web/CSS/env
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport
- https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Responsive_Design
- https://developer.mozilla.org/en-US/docs/Web/API/Viewport_segments_API
- https://developer.mozilla.org/en-US/docs/Web/API/Window/viewport
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/horizontal-viewport-segments
- https://developer.mozilla.org/en-US/docs/Web/API/Device_Posture_API
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-contrast
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-data
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors
- https://developer.mozilla.org/en-US/docs/Web/CSS/forced-color-adjust
- https://developer.mozilla.org/en-US/docs/Web/CSS/color-scheme
- https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark
- https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images
- https://developer.mozilla.org/en-US/docs/Web/HTML/Element/picture
- https://developer.mozilla.org/en-US/docs/Web/API/Window/matchMedia
- https://developer.mozilla.org/en-US/docs/Web/API/Window/resize_event
- https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver
- https://bcd.developer.mozilla.org/bcd/api/v0/current/css.types.length.viewport_percentage_units_small.json
- https://bcd.developer.mozilla.org/bcd/api/v0/current/html.elements.meta.name.viewport.json
- https://web.dev/blog/baseline-digest-sep-2025
- https://web.dev/articles/media-query-range-syntax
- https://web.dev/blog/web-platform-05-2026
- https://web.dev/articles/baseline-in-action-fluid-type
- https://web.dev/blog/viewport-units
- https://web.dev/articles/browser-level-image-lazy-loading
- https://web.dev/baseline
- https://www.w3.org/TR/mediaqueries-5/
- https://www.w3.org/TR/css-env-1/
- https://drafts.csswg.org/css-env-1/
- https://drafts.csswg.org/css-viewport/
- https://www.w3.org/TR/css-values-4/
- https://www.w3.org/TR/device-posture/
- https://html.spec.whatwg.org/multipage/images.html
- Further reading, non-authoritative (vendor documentation): https://developer.chrome.com/docs/devtools/device-mode, https://developer.chrome.com/blog/foldable-apis-ot
