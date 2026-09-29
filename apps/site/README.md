# Dobra site

The public site at <https://dobra-five.vercel.app>, built with Astro as static output. It has:

- the landing page (`src/pages/index.astro`): the tools, the Mac installer and the developer commands;
- the guide at `/guide/`, rendered from `docs/guide` at the repository root;
- the simulator at `/simulator/` and the web report at `/report/`, copied in from their own builds.

## Commands

Run these from the repository root:

```bash
npm run dev:site                  # Astro dev server for the landing page and the guide
npm run build:site                # builds the simulator, the report, then the site into apps/site/dist
npm run test -w @dobra/site       # unit tests for the Markdown plugins, guide routes, theme and CSS
npm run test:dist -w @dobra/site  # checks the built dist; run npm run build:site first
npm run typecheck -w @dobra/site  # astro sync, then tsc --noEmit
```

`npm run typecheck` at the root also covers the site. The dev server serves only the Astro pages;
`/simulator/` and `/report/` exist after a build, because `scripts/copy-tools.mjs` copies
`apps/simulator/dist` and `apps/report/dist` into `dist/simulator/` and `dist/report/` after
`astro build`. It stops with an error if either app has not been built.

## The guide

`src/content.config.ts` reads `docs/guide/*.md` in place; nothing is copied. File names map to
routes (`src/lib/guide.ts`):

| File | Route |
| --- | --- |
| `00-index.md` | `/guide/` |
| `NN-name.md`, for example `04-web.md` | `/guide/name/`, for example `/guide/web/` |

Each page takes its title from its first `#` heading, and the sidebar lists every page with its
`##` sections. URLs always end in a slash.

The guide uses the unified Markdown processor with these plugins (`src/markdown`):

- `remarkGuideLinks`: links between guide files (`04-web.md#x`) become site routes (`/guide/web/#x`).
- `remarkGlossaryTable`: the `## Glossary entries` section, one entry per line with fields split by
  ` | `, becomes a five-column table. A line with the wrong number of fields stays visible as text.
- `remarkUnverifiedCallout`: `[unverified — confirm before use]` becomes an inline callout, and its
  paragraph is highlighted.
- `remarkSourcesBlock`: the `## Sources` section is wrapped so it renders as its own block.
- `rehype-slug` and `rehypeHeadingAnchors`: h2 to h4 headings get ids and a `#` link.

Code blocks use Shiki with light and dark themes, switched by the site's theme toggle.

## Tests of the build

`test/built/site.test.ts` runs against `dist` and checks that every guide file has a page, heading
ids are unique and anchored, internal links and anchors resolve, guide images have alt text and
files, links to the tools and other sites open in a new tab, the simulator and report are bundled
with their assets, the canonical URL and sitemap use dobra-five.vercel.app, trailing slashes are
enforced, the landing page shows the installer, and no page loads fonts from the network.

## Deploy

The Vercel project "dobra" deploys every push to `main` to <https://dobra-five.vercel.app>, and each
pull request gets a preview deployment. The root `vercel.json` sets the build: `npm ci`, then
`npm run build:site`, serving `apps/site/dist` with trailing slashes. `public/vercel.json` also asks
for trailing slashes, so `/simulator` redirects to `/simulator/` and its relative assets load.
