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

- [Simulator](https://dobra-five.vercel.app/simulator/): preview a screen on any device, posture
  or window size, show the hinge, safe areas and grid, and compare iOS and Android side by side.
- [Report](https://dobra-five.vercel.app/report/): open the results of a Figma file or a website
  check, finding by finding.
- [Guide](https://dobra-five.vercel.app/guide/): a reference for responsive and adaptive layout on
  Android, iOS and the web, with breakpoints, APIs, patterns and accessibility.

**On the command line and in CI** ([CLI](packages/cli/README.md))

- `dobra check site <url>` opens a website on each device, emulates the fold, and reports what
  breaks, including pages that don't lay themselves out again after an unfold. It exits non-zero
  on errors, so it can gate a pull request.

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
| `dobra report` | Opens the report in the browser |
| `dobra plugin` | Shows the Figma plugin's manifest and how to import it in Figma desktop |
| `dobra check site <url>` | Checks a website on foldables; the report lands in the current folder |
| `dobra update` | Gets the latest version and rebuilds |

The code goes in `~/Dobra` when the installer downloads it, and Node and the `dobra` command go in
`~/.dobra`. Set `DOBRA_DIR` or `DOBRA_HOME` to use other folders, and `DOBRA_SKIP_BROWSER=1` to skip
Chromium. `dobra update` replaces the contents of `~/Dobra`, so keep your own files elsewhere.

## Develop

```sh
npm install
npm run dev                            # the simulator
npm test                               # every workspace's tests
npm run build:cli && npm run dobra -- check site https://example.com
```

The CLI needs Playwright's Chromium once: `npx playwright install chromium`. Each part's README
covers its own build and options.
