# Dobra

Dobra helps designers and developers build interfaces that work on foldable, dual-screen and
large-screen devices, on iOS, Android and the web. It knows each device's displays, postures, safe
areas and hinges, and it checks designs and websites for the mistakes those devices expose, such as
content under a hinge or a layout that breaks when the device unfolds.

Try it at [dobra-five.vercel.app](https://dobra-five.vercel.app).

## What you can do

**In Figma** ([plugin](packages/figma-plugin/README.md))

- Create artboards for real devices in every posture and orientation, with hinge and safe-area
  overlays.
- Add size classes and devices to the file as Figma variables.
- Tag frames by device, check them for foldable problems, and see which devices and postures
  your designs don't cover yet.
- Adapt a frame to another device, with the problems it finds flagged in place.

**In the browser**

- [Simulator](https://dobra-five.vercel.app/simulator/) ([README](apps/simulator/README.md)):
  preview a sample screen or your own Figma frames on any device, posture or window size, show the
  hinge, safe areas and grid, and compare iOS and Android side by side.
- [Report](https://dobra-five.vercel.app/report/) ([README](apps/report/README.md)): open the results of a Figma file or a website
  check, finding by finding.
- [Guide](https://dobra-five.vercel.app/guide/): a reference for responsive and adaptive layout on
  Android, iOS and the web, with breakpoints, APIs, patterns and accessibility.

**On the command line and in CI** ([CLI](packages/cli/README.md))

- `dobra check site <url>` opens a website on each device, emulates the fold, and reports what
  breaks, including pages that don't lay themselves out again after an unfold. It exits non-zero
  on errors, so it can gate a pull request.

**In Claude Code** ([skill](plugins/dobra/skills/dobra/SKILL.md))

- Ask, in any project, to check a site or an Android or iOS app on foldables. The `dobra` skill
  runs the site check, reviews Compose or SwiftUI code against the guide, creates emulators and
  simulators like catalog devices, and explains each fix with the guide.

## Install on your Mac

You don't need GitHub, Node or admin rights. Open Terminal and paste this line:

```sh
bash -c "$(curl -fsSL https://raw.githubusercontent.com/jacksonmafra-umain/Dobra/main/install.sh)"
```

Or download the ZIP from GitHub (**Code › Download ZIP**), unzip it, and run `bash install.sh` in
that folder. A clone works the same way.

The installer adds Node when it's missing, installs the packages, builds every tool and installs
Chromium for the site checker. It takes a few minutes the first time. Then, in a new Terminal
window:

| Command | What it does |
| --- | --- |
| `dobra simulator` | Opens the simulator in the browser |
| `dobra report` | Opens the report in the browser; its **Website** check runs on your machine |
| `dobra plugin` | Shows the Figma plugin's manifest and how to import it in Figma desktop |
| `dobra check site <url>` | Checks a website on foldables; the report lands in the current folder |
| `dobra update` | Gets the latest version and rebuilds |

### Add the Figma plugin

The plugin runs in the Figma desktop app, not in the browser. Add it once:

1. Run `dobra plugin`. It opens Figma and shows the plugin's `manifest.json` in Finder.
2. In Figma, open any design file, then go to **Plugins › Development › Import plugin from
   manifest…**
3. Choose `~/Dobra/packages/figma-plugin/manifest.json`, the file Finder shows.
4. Run it from **Plugins › Development › Dobra**.

After `dobra update`, Figma loads the new version the next time you run the plugin. The
[plugin guide](docs/figma-plugin/guide.md) walks through each tab.

### Use Dobra from Claude Code

The installer copies the `dobra` skill to `~/.claude/skills/dobra`, so Claude Code can use it in
any project. Without the installer, add it as a plugin:

```
/plugin marketplace add jacksonmafra-umain/Dobra
/plugin install dobra@dobra
```

Then ask, for example, "check https://example.com on foldables" or "review this app's layout for
foldables". The skill runs `dobra check site`, reviews the code against the guide, and says what it
couldn't check.

### Where things go

The code goes in `~/Dobra` when the installer downloads it, and Node and the `dobra` command go in
`~/.dobra`. Set `DOBRA_DIR` or `DOBRA_HOME` to use other folders, and `DOBRA_SKIP_BROWSER=1` to skip
Chromium. The skill goes in `~/.claude/skills/dobra`; `DOBRA_SKIP_SKILL=1` skips it, and a
folder there that Dobra didn't install is left alone. `dobra update` replaces the contents of `~/Dobra`, so keep your own files elsewhere.

## Develop

```sh
npm install
npm run dev                            # the simulator
npm test                               # every workspace's tests
npm run build:cli && npm run dobra -- check site https://example.com
```

The CLI needs Playwright's Chromium once: `npx playwright install chromium`. Each part's README
covers its own build and options:

| Part | README |
| --- | --- |
| `packages/core`: catalog, layout engine, rules, reports | [packages/core](packages/core/README.md) |
| `packages/figma-plugin` | [packages/figma-plugin](packages/figma-plugin/README.md) |
| `packages/cli` | [packages/cli](packages/cli/README.md) |
| `packages/brand`: tokens, fonts, logo | [packages/brand](packages/brand/README.md) |
| `apps/simulator` | [apps/simulator](apps/simulator/README.md) |
| `apps/report` | [apps/report](apps/report/README.md) |
| `apps/site`: landing page and guide, deployed to Vercel | [apps/site](apps/site/README.md) |
