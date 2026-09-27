# @dobra/brand

Dobra's design tokens, fonts, logo and icon. Every Dobra surface imports its look from here.

## Use

```css
@import '@dobra/brand/fonts.css';
@import '@dobra/brand/tokens.css';

body { background: var(--dobra-bg); color: var(--dobra-text); font: var(--dobra-type-body-md); }
```

Dark is the default. Set `data-theme="light"` on any element to switch it and its children to light.
The tokens do not read `prefers-color-scheme`; a surface that follows the system sets the attribute.

Code without CSS reads the same values from `@dobra/brand/tokens`:

```ts
import { tokens } from '@dobra/brand/tokens';
tokens.dark.hinge; // '#EC4899'
```

## Tokens

| Token | Use |
| --- | --- |
| `--dobra-bg`, `--dobra-panel`, `--dobra-flyout`, `--dobra-field` | Canvas, Level 1 panels, Level 2 flyouts, inputs |
| `--dobra-text`, `--dobra-muted` | Body and secondary text |
| `--dobra-border`, `--dobra-border-strong` | Hairlines and input borders |
| `--dobra-fold`, `--dobra-on-fold` | Primary and active state, fold lines, focus; text on it |
| `--dobra-accent-2` | Secondary controls, metadata, safe areas |
| `--dobra-pass`, `--dobra-warn`, `--dobra-hinge` | Passing checks, warnings, hinge occlusion and errors |
| `--dobra-glow`, `--dobra-shadow-2` | Fold guide glow, Level 2 shadow |
| `--dobra-radius*`, `--dobra-space-*` | 2/4/8/12 px radii, 4/8/12/20/32 px spacing |
| `--dobra-font-*`, `--dobra-type-*`, `--dobra-tracking-*` | Geist, Inter, JetBrains Mono and the type scale |

Panels are translucent. Add `backdrop-filter: blur(16px)` (Level 1) or `blur(24px)` (Level 2)
where something sits behind them.

## Files

- `logo.svg` (dark backgrounds), `logo-light.svg` (light backgrounds)
- `icon.svg`, `favicon.svg`
- `png/favicon-32.png`, `png/icon-128.png` (Figma Community), `png/icon-512.png` (GitHub avatar)

## Regenerating

```bash
node packages/brand/scripts/copy-fonts.mjs   # after a @fontsource version change
node packages/brand/scripts/build-logo.mjs   # after changing the logo
node packages/brand/scripts/build-png.mjs    # after changing icon.svg or favicon.svg
```

The tests fail when the fonts or the logo are stale.

Fonts: Geist, Inter and JetBrains Mono under the SIL Open Font License (`fonts/OFL-*.txt`).
