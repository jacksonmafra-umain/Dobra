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

## Run it locally

```sh
npm install
npm run dev                            # the simulator
npm test                               # every workspace's tests
npm run build:cli && npm run dobra -- check site https://example.com
```

The CLI needs Playwright's Chromium once: `npx playwright install chromium`. Each part's README
covers its own build and options.
