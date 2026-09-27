# Slice 2b — Catalog devices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the missing devices to `catalog/catalog.json` with sourced sizes, mark every
unpublished value as estimated, confirm the Galaxy Z Fold 7 sizes, and add the dual-screen
coverage requirements that the Surface Duo 2 makes possible.

**Architecture:** Data only, plus tests. Each new device is cloned from the closest existing
entry (same platform and category) with a small Python helper, then its sizes, pixels, density,
hinges and notes are replaced. The existing schema already enforces that an Android display's dp
size matches `pixels / density` unless it is marked `estimated`, so every confirmed number is
checked by the loader. One table test per task pins the values from the research.

**Tech Stack:** JSON catalog, zod schema (unchanged), Vitest 4, Python 3 for the data edits.

**Spec:** `docs/superpowers/specs/2026-09-25-foldable-artboards-design.md` §2 ("Catalog gaps"),
§4, §12 slice 2. Research with every source URL:
`/private/tmp/claude-501/-Users-jackson-mafra-Downloads-Projects-SizeClassSimulator--claude-worktrees-foldable-device-artboards-1e185c/44e1a8a4-3dbd-4cdb-9ee0-ae81c4db2d9d/scratchpad/device-research.md`
(copy the URLs it cites into each device's `$note`).

## Global Constraints

- Every value names a `source`; anything not confirmed by a manufacturer spec sheet or official
  developer documentation is `estimated: true` with a `$note` saying why (spec §1, §4).
- The user decided: include estimated devices, add iPhone Air and Pixel 11 Pro Fold, keep the
  iPhone Duo estimated (add its published pixel sizes as a note only).
- Surface Duo 2 is the only occluding hinge (`occlusion: "FULL"`), the reference fixture for the
  hinge rule (spec §4).
- Galaxy Z Fold 7 stays 750×832 dp inner and 411×960 dp cover at an estimated 2.625 density;
  duoresponsive's Fold 6 768×904 is not a dp value (research §12).
- Categories and posture kinds from slice 2a: `phone | foldable-book | foldable-flip | dual-screen | multi-fold | tablet | desktop`;
  `cover | flat | book | tabletop | partial | dual | rear`.
- Commits in English, microcommits, never mention the assistant. Never push to or merge into
  `main`; the PR closes a labeled issue (`enhancement`, `area:catalog`).
- Base branch: `feat/catalog-schema` (PR #14). Work branch: `feat/catalog-devices`.

## Review Focus

1. A confirmed Android display whose dp does not match `pixels / density` — expected: the loader
   rejects it (existing schema check); every confirmed entry in this plan is checked by simply
   loading the catalog in each task's test.
2. An estimated device without an explanation — expected: a raw-JSON test fails when a device or
   display is `estimated: true` and has no `$note` or `$comment` (Task 1).
3. Two devices with the same id, or a clone that keeps its template's id — expected: the
   existing duplicate-id check fails the load (covered by every task's `loadCatalog()`).
4. Spanning the Surface Duo 2 puts content under the gap — expected: the resolved environment
   has a separating, occluding vertical fold 26 dp wide at x = 537, and two 537 dp regions
   (Task 1).
5. A landscape-native inner display (Pixel Fold gen 1) is entered portrait-first by mistake —
   expected: its inner `size` is 841×701 and its crease sits at x = 420.5 (Task 2).

---

### Task 0: Branch and helper

- [ ] **Step 1: Branch**

```bash
git fetch origin
git switch -c feat/catalog-devices origin/feat/catalog-schema
npm install && npm test
git add docs/superpowers/plans/2026-09-26-slice-2b-catalog-devices.md
git commit -m "Add the implementation plan for the new catalog devices"
```
Expected: tests pass (core 166, simulator 72 at the time of writing).

- [ ] **Step 2: Write the data helper** (scratch, not committed) at
  `.superpowers/sdd/2026-09-26-slice-2b-catalog-devices/catalog_tools.py`:

```python
import copy, json

PATH = 'packages/core/src/catalog/catalog.json'

def load():
    return json.load(open(PATH))

def save(c):
    with open(PATH, 'w') as f:
        json.dump(c, f, indent=2, ensure_ascii=False)
        f.write('\n')

def device(c, id):
    return next(d for d in c['devices'] if d['id'] == id)

def clone(c, template, new_id, name, after=None):
    """Deep-copies a device, renames it and inserts it after `after` (default: after the template)."""
    d = copy.deepcopy(device(c, template))
    d['id'], d['name'] = new_id, name
    anchor = next(i for i, x in enumerate(c['devices']) if x['id'] == (after or template))
    c['devices'].insert(anchor + 1, d)
    return d

def dp(px, density):
    return round(px / density, 1)

def set_android_display(disp, *, px, density, label=None, estimated, note, source='device-spec'):
    """Sets pixels, density and the derived dp size (rounded to the nearest 0.5 like the existing entries)."""
    w, h = px
    disp['pixels'] = {'width': w, 'height': h}
    disp['density'] = density
    disp['size'] = {'width': round(w / density * 2) / 2, 'height': round(h / density * 2) / 2}
    if label: disp['label'] = label
    disp['source'] = source
    disp['estimated'] = estimated
    disp['$note'] = note
```
Every later task runs its edit as
`python3 - <<'EOF'` / `import sys; sys.path.insert(0, '.superpowers/sdd/2026-09-26-slice-2b-catalog-devices'); from catalog_tools import *` / … / `EOF`.
If `size` values with `.5` break a test that expects integers, round to the nearest integer and
ledger the choice.

### Task 1: Surface Duo 2 and the dual-screen requirements

**Files:**
- Create: `packages/core/src/catalog/devices.test.ts`
- Modify: `packages/core/src/catalog/catalog.json` (sources, a new device, requirements)

**Interfaces:**
- Consumes: `loadCatalog()` (`@dobra/core/catalog/load`), `resolveEnvironment(config, selection)`
  and `loadConfig()` from core; read `engine/environment.ts` for the exact `Selection` fields
  (`deviceId`, `displayId`/`poseId`, `rotation`) before writing the environment assertion.
- Produces: device `surface-duo-2` (android, `dual-screen`) with displays `single` and `spanned`,
  postures `single` (kind `cover`), `spanned` (kind `book`), `spanned-landscape` (kind
  `tabletop`, rotation 90); sources `microsoft-learn` and `android-studio-avd`.

- [ ] **Step 1: Write the failing test** `devices.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import catalogJson from './catalog.json';
import { loadCatalog } from './load';

const cat = loadCatalog();
const byId = (id: string) => {
  const d = cat.devices.find((x) => x.id === id);
  if (!d) throw new Error(`No device "${id}"`);
  return d;
};
const size = (id: string, display: string) => {
  const d = byId(id);
  return d.platform === 'android' ? d.displays[display].size : d.displays[display].portraitSize;
};

describe('catalog devices', () => {
  it('explains every estimated device and display', () => {
    for (const d of catalogJson.devices as Array<Record<string, unknown>>) {
      const displays = Object.values(d.displays as Record<string, Record<string, unknown>>);
      for (const node of [d, ...displays]) {
        if (node.estimated === true) expect(node.$note ?? node.$comment ?? d.$comment, `${d.id} needs a note`).toBeTruthy();
      }
    }
  });

  it('has the Surface Duo 2 with a 26 dp occluding hinge between two 537 dp screens', () => {
    const d = byId('surface-duo-2');
    expect(d.category).toBe('dual-screen');
    expect(size('surface-duo-2', 'single')).toEqual({ width: 537, height: 756 });
    expect(size('surface-duo-2', 'spanned')).toEqual({ width: 1100, height: 756 });
    if (d.platform !== 'android') throw new Error('android expected');
    expect(d.displays.spanned.hinges).toEqual([
      expect.objectContaining({ axis: 'vertical', position: 537, width: 26, occlusion: 'FULL' }),
    ]);
  });

  it('requires dual-screen coverage now that a dual-screen device exists', () => {
    const rows = cat.requirements.filter((r) => r.category === 'dual-screen' && r.level === 'required');
    expect(rows.map((r) => `${r.kind}/${r.orientation}`).sort()).toEqual(['book/landscape', 'cover/portrait', 'tabletop/portrait']);
  });
});
```
Add, in the same file, an environment assertion for Review Focus 4: resolve `surface-duo-2`
spanned (see `engine/postures.test.ts` for how existing tests build a selection and call
`resolveEnvironment`) and expect `env.folds` to hold one fold with `separating: true`,
`occludes: true`, `rect.x === 537`, `rect.width === 26`, and `env.regions` (or the field the
engine uses for split regions — check `Environment` in `engine/environment.ts`) to be two rects
537 dp wide.

Run: `npm test -w @dobra/core -- src/catalog/devices.test.ts` → FAIL (`No device "surface-duo-2"`).
If "explains every estimated device and display" also fails on devices that already exist, add a
one-sentence `$note` to each flagged entry saying which value is unconfirmed (read its sizes and
sources to write it), in a separate commit before Step 2, and ledger the list.

- [ ] **Step 2: Add the sources and the device**

```bash
python3 - <<'EOF'
import sys; sys.path.insert(0, '.superpowers/sdd/2026-09-26-slice-2b-catalog-devices')
from catalog_tools import *
c = load()
c['sources']['microsoft-learn'] = 'Microsoft Learn, Surface Duo screen dimensions: learn.microsoft.com/en-us/previous-versions/dual-screen/android/surface-duo-dimensions'
c['sources']['android-studio-avd'] = 'Android Studio device definitions (AOSP sdklib devices/nexus.xml)'
d = clone(c, 'pixel-9-pro-fold', 'surface-duo-2', 'Surface Duo 2', after='galaxy-z-flip-7')
d['category'] = 'dual-screen'
single = copy.deepcopy(d['displays']['outer']); spanned = copy.deepcopy(d['displays']['inner'])
set_android_display(single, px=(1344, 1892), density=2.5, label='One screen', estimated=False, source='microsoft-learn',
    note='1344×1892 px at 2.5 (Microsoft Learn dimensions diagram). 5.8-inch screen.')
single['size'] = {'width': 537, 'height': 756}  # Microsoft publishes 537×756 dp; 1344/2.5 = 537.6
single.pop('hinges', None)
set_android_display(spanned, px=(2754, 1892), density=2.5, label='Both screens (spanned)', estimated=False, source='microsoft-learn',
    note='2754×1892 px including the 66 px hinge mask, 1100×756 dp. A physical gap between two panels: OcclusionType.FULL.')
spanned['size'] = {'width': 1100, 'height': 756}
spanned['hinges'] = [{'id': 'hinge', 'axis': 'vertical', 'position': 537, 'width': 26, 'occlusion': 'FULL', 'source': 'microsoft-learn'}]
for disp in (single, spanned):
    disp['insets']['cutout'] = None
    disp['insets']['statusBar'] = 24
    disp['insets']['$note'] = '24 dp status bar per screen from the Microsoft Learn diagram; navigation and IME values are estimates.'
d['displays'] = {'single': single, 'spanned': spanned}
d['postures'] = [
    {'id': 'single', 'label': 'One screen', 'kind': 'cover', 'display': 'single', 'features': []},
    {'id': 'spanned', 'label': 'Spanned, double portrait', 'kind': 'book', 'display': 'spanned', 'features': [{'hinge': 'hinge', 'state': 'FLAT'}],
     'note': 'The gap hides content even when flat (FULL occlusion), so isSeparating is true: split at the hinge.'},
    {'id': 'spanned-landscape', 'label': 'Spanned, double landscape', 'kind': 'tabletop', 'display': 'spanned', 'rotation': 90,
     'features': [{'hinge': 'hinge', 'state': 'FLAT'}], 'note': 'The hinge turns HORIZONTAL: one screen above the other.'},
]
d['source'] = 'microsoft-learn'; d['estimated'] = False
d['$comment'] = 'The only device in the catalog whose hinge hides content (FULL occlusion). Reference fixture for the hinge-content rule.'
c['requirements'] += [
    {'category': 'dual-screen', 'kind': 'cover', 'orientation': 'portrait', 'level': 'required'},
    {'category': 'dual-screen', 'kind': 'book', 'orientation': 'landscape', 'level': 'required',
     'note': 'Double portrait spans 1100×756 dp: a landscape-shaped window split by a 26 dp gap.'},
    {'category': 'dual-screen', 'kind': 'tabletop', 'orientation': 'portrait', 'level': 'required'},
]
save(c)
EOF
```
If the schema rejects a key the clone carried over (for example `windowModes` values or a
`$comment` on a display), keep the key the schema allows and ledger what was dropped.

- [ ] **Step 3:** `npm test && npm run typecheck && npm run build` → PASS.
- [ ] **Step 4: Commit**

```bash
git add packages/core/src/catalog
git commit -m "Add the Surface Duo 2 and dual-screen coverage requirements"
```

### Task 2: Book foldables and the Galaxy Z Fold 7 check

**Files:** `packages/core/src/catalog/devices.test.ts`, `packages/core/src/catalog/catalog.json`

**Interfaces:**
- Produces devices (android, `foldable-book`, displays `outer`/`inner`, cloned from
  `pixel-9-pro-fold` without the `rear-display` and `dual-screen` postures unless noted):
  `pixel-fold`, `pixel-10-pro-fold` (keeps rear-display and dual-screen), `pixel-11-pro-fold`
  (keeps them), `oneplus-open`, `oppo-find-n6`. Updates notes on `galaxy-z-fold-7`.

- [ ] **Step 1: Write the failing tests** (append to `devices.test.ts`)

```ts
describe('book foldables', () => {
  it.each([
    ['pixel-fold', 'outer', { width: 411.5, height: 797 }],
    ['pixel-fold', 'inner', { width: 841, height: 701 }],
    ['pixel-10-pro-fold', 'outer', { width: 443, height: 970 }],
    ['pixel-10-pro-fold', 'inner', { width: 851.5, height: 883 }],
    ['pixel-11-pro-fold', 'outer', { width: 443, height: 961 }],
    ['oneplus-open', 'outer', { width: 425, height: 946.5 }],
    ['oneplus-open', 'inner', { width: 864, height: 929.5 }],
    ['oppo-find-n6', 'outer', { width: 434.5, height: 996.5 }],
    ['oppo-find-n6', 'inner', { width: 856.5, height: 945 }],
    ['galaxy-z-fold-7', 'cover', { width: 411, height: 960 }],
    ['galaxy-z-fold-7', 'inner', { width: 750, height: 832 }],
  ])('%s %s is %o dp', (id, display, expected) => {
    expect(byId(id).category).toBe('foldable-book');
    expect(size(id, display)).toEqual(expected);
  });

  it('keeps the Pixel Fold inner display landscape-native with the crease across its width', () => {
    const d = byId('pixel-fold');
    if (d.platform !== 'android') throw new Error('android expected');
    expect(d.displays.inner.hinges?.[0]).toMatchObject({ axis: 'vertical', position: 420.5, width: 0, occlusion: 'NONE' });
  });

  it('marks unpublished densities as estimated', () => {
    for (const id of ['oneplus-open', 'oppo-find-n6', 'pixel-11-pro-fold', 'galaxy-z-fold-7']) {
      expect(byId(id).estimated, id).toBe(true);
    }
    for (const id of ['pixel-fold', 'pixel-10-pro-fold']) expect(byId(id).estimated, id).toBe(false);
  });
});
```
The rows already use the helper's rounding (nearest 0.5 dp). Run → FAIL.

- [ ] **Step 2: Add the devices**

```bash
python3 - <<'EOF'
import sys; sys.path.insert(0, '.superpowers/sdd/2026-09-26-slice-2b-catalog-devices')
from catalog_tools import *
c = load()
def book(new_id, name, *, outer, inner, density, estimated, source, why, keep_modes=False, after):
    d = clone(c, 'pixel-9-pro-fold', new_id, name, after=after)
    set_android_display(d['displays']['outer'], px=outer, density=density, estimated=estimated, source=source, note=why)
    set_android_display(d['displays']['inner'], px=inner, density=density, estimated=estimated, source=source, note=why)
    inner_d = d['displays']['inner']
    inner_d['hinges'][0]['position'] = inner_d['size']['width'] / 2
    inner_d['hinges'][0]['estimated'] = estimated
    if not keep_modes:
        d['postures'] = [p for p in d['postures'] if p['kind'] not in ('rear', 'dual')]
    d['source'], d['estimated'] = source, estimated
    d.pop('$comment', None)
    d['$note'] = why
    return d

book('pixel-fold', 'Pixel Fold', outer=(1080, 2092), inner=(2208, 1840), density=2.625, estimated=False,
     source='android-studio-avd', after='pixel-9-pro-fold',
     why='Android Studio AVD pixel_fold: 420 dpi. The inner display is landscape-native (2208×1840 px); the crease runs across its width.')
book('pixel-10-pro-fold', 'Pixel 10 Pro Fold', outer=(1080, 2364), inner=(2076, 2152), density=2.4375, estimated=False,
     source='android-studio-avd', keep_modes=True, after='pixel-fold',
     why='Android Studio AVD pixel_10_pro_fold: 390 dpi. Outer 1080×2364 px is 443×970 dp (not 995, which is the 9 Pro Fold). Chrome DevTools uses 2.625 for the 9 Pro Fold cover; if the cover uses it, the outer would be about 411×900 dp.')
book('pixel-11-pro-fold', 'Pixel 11 Pro Fold', outer=(1080, 2342), inner=(2076, 2152), density=2.4375, estimated=True,
     source='device-spec', keep_modes=True, after='pixel-10-pro-fold',
     why='Pixels from Google Pixel support (support.google.com/pixelphone/answer/7158570). Density assumed to match the 10 Pro Fold (390 dpi); no AVD yet.')
book('oneplus-open', 'OnePlus Open', outer=(1116, 2484), inner=(2268, 2440), density=2.625, estimated=True,
     source='device-spec', after='galaxy-z-fold-7',
     why='Pixels from oneplus.com/us/open/specs. OnePlus does not publish the default density; 2.625 (420 dpi) is assumed.')
book('oppo-find-n6', 'Oppo Find N6', outer=(1140, 2616), inner=(2248, 2480), density=2.625, estimated=True,
     source='device-spec', after='oneplus-open',
     why='Pixels from oppo.com Find N6 specs (announced March 2026). Oppo does not publish the density; 2.625 is an assumption, so every dp value is a guess.')
f7 = device(c, 'galaxy-z-fold-7')
f7['displays']['cover']['$note'] = '1080×2520 px (GSMArena; 6.5-inch on Samsung specs). At the assumed 2.625: 411×960 dp.'
f7['displays']['inner']['$note'] = ('1968×2184 px (Samsung Developers emulator skin). Samsung publishes no density; 2.625 is supported by Chrome DevTools\' '
    'Fold 5 profile, which matches the Fold 5 pixels exactly. 750×832 dp. duoresponsive lists the Fold 6 at 768×904, which no single density produces: not a dp value.')
save(c)
EOF
```
The Pixel Fold's inner `size` comes out as 841×701 because its pixels are given landscape-first;
its crease `position` becomes 420.5, the middle of that width. Check that the tabletop posture
(rotation 90) still reads sensibly for a landscape-native display; if the engine treats the
natural orientation differently, ledger it and keep the numbers.

- [ ] **Step 3:** `npm test && npm run typecheck && npm run build` → PASS.
- [ ] **Step 4: Commit**

```bash
git add packages/core/src/catalog
git commit -m "Add Pixel Fold, Pixel 10 and 11 Pro Fold, OnePlus Open and Oppo Find N6, and document the Z Fold 7 sizes"
```

### Task 3: Flip foldables (Motorola)

**Files:** `devices.test.ts`, `catalog.json`

**Interfaces:**
- Produces devices (android, `foldable-flip`, cloned from `galaxy-z-flip-7`): `razr-plus-2024`,
  `razr-2026`, `razr-ultra-2026`, each with cover `coverScreen: { policy: 'any-app', continuity: true, note }`.

- [ ] **Step 1: Write the failing tests** (append)

```ts
describe('flip foldables', () => {
  it.each([
    ['razr-plus-2024', 'cover', { width: 392.5, height: 462.5 }],
    ['razr-plus-2024', 'inner', { width: 392.5, height: 960 }],
    ['razr-2026', 'cover', { width: 384, height: 387.5 }],
    ['razr-2026', 'inner', { width: 392.5, height: 960 }],
    ['razr-ultra-2026', 'cover', { width: 360, height: 424 }],
    ['razr-ultra-2026', 'inner', { width: 408, height: 997.5 }],
  ])('%s %s is %o dp', (id, display, expected) => {
    expect(byId(id).category).toBe('foldable-flip');
    expect(size(id, display)).toEqual(expected);
  });

  it('lets any app run on a Motorola cover screen', () => {
    for (const id of ['razr-plus-2024', 'razr-2026', 'razr-ultra-2026']) {
      const d = byId(id);
      if (d.platform !== 'android') throw new Error('android expected');
      expect(d.displays.cover.coverScreen).toMatchObject({ policy: 'any-app', continuity: true });
      expect(d.estimated).toBe(true);
    }
  });
});
```
The rows already use the helper's rounding (nearest 0.5 dp). Run → FAIL.

- [ ] **Step 2: Add the devices**

```bash
python3 - <<'EOF'
import sys; sys.path.insert(0, '.superpowers/sdd/2026-09-26-slice-2b-catalog-devices')
from catalog_tools import *
c = load()
MOTO = ('Motorola lets the user add any installed app to the external display '
        '(en-us.support.motorola.com/app/answers/detail/a_id/174650). Continuity keeps the app there when the phone closes.')
def flip(new_id, name, *, cover, inner, density, why, after):
    d = clone(c, 'galaxy-z-flip-7', new_id, name, after=after)
    set_android_display(d['displays']['cover'], px=cover, density=density, estimated=True, source='device-spec', note=why)
    set_android_display(d['displays']['inner'], px=inner, density=density, estimated=True, source='device-spec', note=why)
    cov = d['displays']['cover']
    cov['rotation'] = {'supported': False}
    cov['coverScreen'] = {'policy': 'any-app', 'continuity': True, 'note': MOTO}
    cov['insets']['source'] = 'estimated'
    inner_d = d['displays']['inner']
    inner_d['hinges'][0]['position'] = inner_d['size']['height'] / 2
    d['source'], d['estimated'] = 'device-spec', True
    d.pop('$comment', None)
    d['$note'] = why
    for p in d['postures']:
        if p['id'] == 'closed':
            p['note'] = 'Any app the user has added to the external display.'
    return d
flip('razr-plus-2024', 'Motorola Razr+ (2024)', cover=(1080, 1272), inner=(1080, 2640), density=2.75, after='galaxy-z-flip-7',
     why='Pixels from Motorola Support (a_id 181473). Motorola does not publish the density; 2.75 (440 dpi) is assumed.')
flip('razr-2026', 'Motorola Razr (2026)', cover=(1056, 1066), inner=(1080, 2640), density=2.75, after='razr-plus-2024',
     why='Inner pixels from GSMArena and Google Fi; the 1056×1066 px cover is from GSMArena and matches the official Razr 2024 cover. Density 2.75 assumed.')
flip('razr-ultra-2026', 'Motorola Razr Ultra (2026)', cover=(1080, 1272), inner=(1224, 2992), density=3.0, after='razr-2026',
     why='Pixels from GSMArena (motorola.com did not render its specs). Density 3.0 assumed.')
save(c)
EOF
```
The Flip 7 template's cover has no `pixels`; the helper adds them. If the Flip 7 cover carried
an `observed` source in its insets, the clone resets it to `estimated` (not observed on these
phones).

- [ ] **Step 3:** `npm test && npm run typecheck && npm run build` → PASS.
- [ ] **Step 4: Commit**

```bash
git add packages/core/src/catalog
git commit -m "Add the Motorola Razr+ 2024, Razr 2026 and Razr Ultra 2026 with any-app cover screens"
```

### Task 4: Galaxy S25 phones

**Files:** `devices.test.ts`, `catalog.json`

**Interfaces:**
- Produces devices (android, `phone`, cloned from `pixel-9`): `galaxy-s25`, `galaxy-s25-plus`,
  `galaxy-s25-ultra`.

- [ ] **Step 1: Write the failing test** (append)

```ts
describe('Galaxy S25 family', () => {
  it.each([
    ['galaxy-s25', { width: 360, height: 780 }],
    ['galaxy-s25-plus', { width: 384, height: 832 }],
    ['galaxy-s25-ultra', { width: 384, height: 832 }],
  ])('%s is %o dp, estimated', (id, expected) => {
    expect(byId(id).category).toBe('phone');
    expect(size(id, 'main')).toEqual(expected);
    expect(byId(id).estimated).toBe(true);
  });
});
```
Run → FAIL.

- [ ] **Step 2: Add the devices**

```bash
python3 - <<'EOF'
import sys; sys.path.insert(0, '.superpowers/sdd/2026-09-26-slice-2b-catalog-devices')
from catalog_tools import *
c = load()
WHY = ('Samsung publishes native pixels (Samsung Developers emulator skins) but not the default resolution or density. '
       '{render} at {density} is the common third-party value; confirm with adb shell wm size / wm density.')
for new_id, name, render, density, after in [
    ('galaxy-s25', 'Galaxy S25', (1080, 2340), 3.0, 'pixel-9-pro-xl'),
    ('galaxy-s25-plus', 'Galaxy S25+', (1080, 2340), 2.8125, 'galaxy-s25'),
    ('galaxy-s25-ultra', 'Galaxy S25 Ultra', (1080, 2340), 2.8125, 'galaxy-s25-plus'),
]:
    d = clone(c, 'pixel-9', new_id, name, after=after)
    set_android_display(d['displays']['main'], px=render, density=density, estimated=True, source='device-spec',
        note=WHY.format(render=f'{render[0]}×{render[1]} px', density=density))
    d['source'], d['estimated'] = 'device-spec', True
    d.pop('$comment', None)
    d['$note'] = 'Native panel pixels are confirmed; the default rendering resolution and density are not.'
save(c)
EOF
```
- [ ] **Step 3:** `npm test && npm run typecheck` → PASS.
- [ ] **Step 4: Commit**

```bash
git add packages/core/src/catalog
git commit -m "Add the Galaxy S25, S25+ and S25 Ultra as estimated phones"
```

### Task 5: iPhones, iPads and the iPhone Duo note

**Files:** `devices.test.ts`, `catalog.json`

**Interfaces:**
- Produces devices (ios): `iphone-mini` (phone, from `iphone-17`), `iphone-plus` and
  `iphone-air` (phone, from `iphone-17-pro-max`), and tablets `ipad-mini`, `ipad-11`,
  `ipad-pro-11`, `ipad-air-13`, `ipad-pro-13` (from `iphone-17`, rewritten as iPads).

- [ ] **Step 1: Write the failing tests** (append)

```ts
describe('Apple devices', () => {
  it.each([
    ['iphone-mini', 'phone', { width: 375, height: 812 }],
    ['iphone-plus', 'phone', { width: 430, height: 932 }],
    ['iphone-air', 'phone', { width: 420, height: 912 }],
    ['ipad-mini', 'tablet', { width: 744, height: 1133 }],
    ['ipad-11', 'tablet', { width: 820, height: 1180 }],
    ['ipad-pro-11', 'tablet', { width: 834, height: 1210 }],
    ['ipad-air-13', 'tablet', { width: 1024, height: 1366 }],
    ['ipad-pro-13', 'tablet', { width: 1032, height: 1376 }],
  ])('%s is a %s at %o pt', (id, category, expected) => {
    expect(byId(id).category).toBe(category);
    expect(size(id, 'main')).toEqual(expected);
  });

  it('gives iPads regular width and height in both orientations', () => {
    for (const id of ['ipad-mini', 'ipad-11', 'ipad-pro-11', 'ipad-air-13', 'ipad-pro-13']) {
      const d = byId(id);
      if (d.platform !== 'ios') throw new Error('ios expected');
      for (const o of ['portrait', 'landscape'] as const) {
        expect(d.displays.main.orientations[o]?.sizeClass).toMatchObject({ horizontal: 'regular', vertical: 'regular' });
      }
    }
  });

  it('keeps the iPhone Duo estimated', () => {
    expect(byId('iphone-duo').displays.inner.estimated).toBe(true);
  });
});
```
Run → FAIL.

- [ ] **Step 2: Add the devices**

```bash
python3 - <<'EOF'
import sys; sys.path.insert(0, '.superpowers/sdd/2026-09-26-slice-2b-catalog-devices')
from catalog_tools import *
c = load()
def iphone(new_id, name, template, *, size, island, note, after, radius_estimated=True):
    d = clone(c, template, new_id, name, after=after)
    m = d['displays']['main']
    m['portraitSize'] = {'width': size[0], 'height': size[1]}
    m['pixels'] = {'width': size[0] * 3, 'height': size[1] * 3}
    m['scale'] = 3
    m['estimated'] = False
    m['hardware']['dynamicIsland'] = island
    m['$note'] = note + (' Corner radius copied from the template: Apple publishes none.' if radius_estimated else '')
    return d
iphone('iphone-mini', 'iPhone mini (5.4-inch)', 'iphone-17', size=(375, 812), island=None, after='iphone-se',
       note='375×812 pt, the iPhone 13 mini / 12 mini class (Apple HIG device table). No mini is on sale; kept as the smallest notch-era size.')
d = device(c, 'iphone-mini')
for o, top in (('portrait', 50), ('landscape', 0)):
    sa = d['displays']['main']['orientations'][o]['safeArea']
    sa.update({'top': top, 'source': 'estimated'})
    if o == 'landscape': sa.update({'left': 50, 'right': 50})
iphone('iphone-plus', 'iPhone Plus (6.7-inch)', 'iphone-17-pro-max', size=(430, 932), island={'width': 125, 'height': 37, 'offset': 11},
       after='iphone-17', note='430×932 pt, the iPhone 16 Plus / 15 Plus class (Apple HIG). The 16 Plus is the last Plus model.')
iphone('iphone-air', 'iPhone Air', 'iphone-17-pro-max', size=(420, 912), island={'width': 125, 'height': 37, 'offset': 11},
       after='iphone-plus', note='420×912 pt (Apple HIG). Safe areas copied from the Pro Max and marked estimated.')
for o in ('portrait', 'landscape'):
    device(c, 'iphone-air')['displays']['main']['orientations'][o]['safeArea']['source'] = 'estimated'

def ipad(new_id, name, size, note, after):
    d = clone(c, 'iphone-17', new_id, name, after=after)
    d['category'] = 'tablet'
    m = d['displays']['main']
    m['portraitSize'] = {'width': size[0], 'height': size[1]}
    m['pixels'] = {'width': size[0] * 2, 'height': size[1] * 2}
    m['scale'] = 2
    m['estimated'] = False
    m['cornerRadius'] = 18
    m['homeIndicator'] = True
    m['hardware'] = {'dynamicIsland': None}
    for o in ('portrait', 'landscape'):
        m['orientations'][o] = {
            'sizeClass': {'horizontal': 'regular', 'vertical': 'regular'},
            'barAxis': 'horizontal',
            'safeArea': {'top': 24, 'right': 0, 'bottom': 20, 'left': 0, 'source': 'estimated'},
            'statusBar': True,
        }
    m['keyboard'] = {'portrait': 313, 'landscape': 398, 'source': 'estimated'}
    m['$note'] = note + ' Corner radius 18 pt and safe areas are estimates: Apple publishes neither.'
    return d
prev = 'iphone-duo'
for new_id, name, size, note in [
    ('ipad-mini', 'iPad mini', (744, 1133), '744×1133 pt, iPad mini (A17 Pro), apple.com/ipad/compare.'),
    ('ipad-11', 'iPad / iPad Air 11-inch', (820, 1180), '820×1180 pt, shared by iPad (A16) and iPad Air 11-inch (M4).'),
    ('ipad-pro-11', 'iPad Pro 11-inch', (834, 1210), '834×1210 pt, iPad Pro 11-inch (M4/M5), apple.com/ipad-pro/specs.'),
    ('ipad-air-13', 'iPad Air 13-inch', (1024, 1366), '1024×1366 pt, iPad Air 13-inch (M4); also the older 12.9-inch Pro.'),
    ('ipad-pro-13', 'iPad Pro 13-inch', (1032, 1376), '1032×1376 pt, iPad Pro 13-inch (M4/M5), apple.com/ipad-pro/specs.'),
]:
    ipad(new_id, name, size, note, prev); prev = new_id

duo = device(c, 'iphone-duo')
duo['$note'] = ('Apple published pixels for the iPhone Duo (apple.com/iphone-duo/specs): inner 1878×2670 px, outer 1398×2034 px. '
                'Point sizes are not published, so every pt value stays estimated.')
save(c)
EOF
```
Before writing the iPad block, read `iosOrientationSpec` in `schema.ts`: if `keyboard`,
`statusBar` or `barAxis` differ from the shape above, use the schema's shape and ledger it. The
iPhone mini keeps the iPhone 17's other safe-area values; check its landscape bottom inset
(21 pt) is still right for a notch device.

- [ ] **Step 3:** `npm test && npm run typecheck && npm run build` → PASS. Then `npm run dev`
  and check in the built-in browser that the device picker lists the new devices and that
  `ipad-pro-13`, `surface-duo-2` (spanned) and `razr-2026` (cover) render without console errors.
- [ ] **Step 4: Commit**

```bash
git add packages/core/src/catalog
git commit -m "Add the iPhone mini, Plus and Air sizes and the current iPads"
```

### Task 6: Issue, push and PR

- [ ] **Step 1:** Issue:

```bash
gh issue create -R jacksonmafra-umain/Dobra \
  --title "Catalog devices: Surface Duo 2, foldables, Galaxy S25, iPhones and iPads" \
  --label enhancement --label area:catalog \
  --body "Slice 2b of docs/superpowers/specs/2026-09-25-foldable-artboards-design.md. Adds the devices the catalog was missing, with a source for every value and unpublished densities marked estimated; confirms the Galaxy Z Fold 7 sizes; adds dual-screen coverage requirements now that the Surface Duo 2 is in."
```
- [ ] **Step 2:** `git push -u origin feat/catalog-devices`
- [ ] **Step 3:** PR targeting `feat/catalog-schema`, labels `enhancement,area:catalog`, body
  `Closes #N`, a Summary listing each device with confirmed/estimated, and a Test plan (counts,
  typecheck, build, browser check). No assistant mention.
- [ ] **Step 4:** Tell agent/01 its four devices are in (with the Pixel 10 Pro Fold outer at
  443×970 and the Find N6 as announced, estimated).
