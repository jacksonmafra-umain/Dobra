# Fixture sites

Static pages for the website checks. Each numbered page reproduces one foldable failure observed on
real devices (foldable-artboards spec §8.2). `good.html` shows the fold-aware pattern and must not
trigger any rule. `expected.json` lists, per page and target, the rule ids that must and must not be
found.

Open a page directly from disk, or serve the folder with any static server. There is nothing to
install.

Target keys follow `deviceId/displayId/pose/orientation`:

| Key | Window (dp) |
|---|---|
| `galaxy-z-flip-7/cover/closed/landscape` | 352 × 339 |
| `galaxy-z-flip-7/inner/open/portrait` | 360 × 880 |
| `pixel-9-pro-fold/inner/book/portrait` | 851 × 883, separating vertical crease |
| `surface-duo-2/spanned/spanned/landscape` | 1100 × 756, hinge at x=537, 26 wide |

The rule thresholds the pages are built around (600 wide for side by side, 480 tall for a short
window, 200 wide for 20 or more characters of text) are estimated. Each page sits well past them.
