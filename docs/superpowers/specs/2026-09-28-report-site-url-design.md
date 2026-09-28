# Foldable Check: check a website by URL — design

## 1. Goal

The web report ("Foldable Check", `apps/report`) accepts either a Figma file or a website URL and
validates it against the device rules. Today it takes a Figma link plus a token, or a report JSON
made by the CLI. A website can only be checked from the command line.

The user chose three ways to run a site check, all behind one input:

1. **Local server mode.** `npm run dobra -- report` serves the report page and a local check
   endpoint. This is the main path: it can check `localhost` and staging sites, and needs no
   hosting.
2. **Hosted check.** A serverless function on Vercel runs Chromium, so anyone using the public
   report page can paste a public URL.
3. **Command hand-off.** When no endpoint answers, the page shows the exact CLI command (and a
   GitHub Actions step) and takes the resulting JSON back through the existing file input.

This reverses one non-goal of `2026-09-25-foldable-artboards-design.md` ("A hosted
website-checking service"). The rest of that spec stands: the same rules, targets, report format
and fold emulation.

### Success criteria

- One page, two inputs: "Figma file" and "Website". Both end in the same report view.
- A site URL checked locally, by the hosted function or through the CLI hand-off produces the same
  `Report` (source kind `web`) for the same page and targets.
- The hosted function refuses private, loopback and link-local addresses, and caps targets and run
  time. The local server accepts them.
- No new report fields; `Report.notes` carries run notes as it does today.

## 2. Architecture

```
apps/report (static)                 packages/cli (Node)
  SiteCheckForm ──probe──▶ GET  /api/health      ─┐
                └─check──▶ POST /api/check {url,  │  createCheckHandler({ launch, policy })
                                 targets|categories}   └─ checkSite(url, targets, { browser, … })
  fallback: CliHandoff (command + Actions step)
```

- **`packages/cli/src/server.ts`**: `createCheckHandler({ launch, policy })` returns a
  framework-free `(req: CheckRequest) => Promise<CheckResult>`. It validates the request, resolves
  targets with the CLI's existing target and category parsing, launches a browser through
  `launch()`, and calls `checkSite` with that browser. `policy` decides what is allowed (§4).
- **Local mode**: a `report` subcommand in the CLI starts a Node `http` server that serves the
  built report app (`apps/report/dist`) and routes `/api/health` and `/api/check` to the handler,
  with the local policy. It prints the URL to open. Launch uses the Playwright Chromium the CLI
  already installs.
- **Hosted mode**: Vercel functions for `/api/check` and `/api/health` use the same handler with
  the hosted policy. Where they live depends on the deployment choice in §8. Launch uses `playwright-core` with a Chromium build
  packaged for serverless. Which package, and whether it supports the CDP display-feature override
  the fold emulation needs: [unverified — confirm before use], settled in the plan's first task.
- **Report app**: `SiteCheckForm.tsx` (URL, a target picker defaulting to one representative
  device per required coverage cell, as the CLI does, and a Check button) plus `siteCheck.ts`
  (probe, call, error mapping), both with plain class names and no styling. On load the form
  probes `/api/health` at the root of its own origin (the report is served under `/report/`). If an endpoint
  answers, the form checks directly. If not, it shows `CliHandoff`.

## 3. Request and response

```ts
interface CheckRequest { url: string; targets?: string[]; categories?: string[] }
type CheckResult =
  | { ok: true; report: Report }
  | { ok: false; status: 400 | 403 | 413 | 429 | 504 | 500; error: string };
interface Health { ok: true; mode: 'local' | 'hosted'; maxTargets: number; maxSeconds: number }
```

`targets` are target keys as the CLI takes them, and `categories` expand to every target of a
category. When both are omitted, the representative set is used. Unknown keys are a 400 with the
offending key.

## 4. Policies

| | Local | Hosted |
|---|---|---|
| Schemes | `http`, `https` | `https`, and `http` for public hosts |
| Private, loopback, link-local hosts | allowed | refused (403), checked after DNS resolution and again on every redirect |
| Max targets per request | none | 6 (413 above) |
| Time budget | none | the function's max duration less a margin; partial results are returned with a note |
| Rate limit | none | per client IP, a few checks per minute (429) |
| Transitions (unfold pass) | on | on, counted against the time budget |
| CORS | same origin | same origin |

The hosted check loads arbitrary third-party pages in a sandboxed headless browser. It never sends
cookies or credentials, blocks downloads, and returns only the report.

## 5. UI

- Two tabs or segmented control at the top: **Figma file** | **Website**.
- Website: URL field, target picker (category chips plus "Representative set"), **Check site**.
  Progress shows the target being checked. Errors map to plain messages: "This address is private;
  run `npm run dobra -- report` to check it locally" for a 403 on the hosted page.
- **Hand-off** when no endpoint answers: the command with the URL and targets filled in, a copy
  button, a GitHub Actions step, and "Open a report JSON" right below.
- Styling follows agent/03's restyle of the report app (PR #83). This work ships unstyled
  components with plain class names; agent/03 places and styles them. If they land after the
  restyle, a small follow-up styles them.

## 6. Error handling

- A target that fails to load is listed under **Could not load**, as in the CLI.
- A hosted run that hits its time budget returns the targets done so far, with a note naming the
  rest.
- Network failure or a 5xx during a check shows the hand-off with the command pre-filled.

## 7. Testing

- **Handler:** unit tests with a stub `launch`: request validation, target resolution, policy
  refusals (private IPs, redirects to private IPs, target caps), and time-budget notes.
- **Local server:** an integration test serves `examples/sites` and runs a real check through
  `/api/check`, matching `expected.json` for one page.
- **CLI binary:** a case in `packages/cli/src/e2e.test.ts` builds the real binary, starts
  `dobra report` and answers `POST /api/check`. `run()` stays unit-testable (only `checkSite`
  touches Playwright), and the exit codes stay as documented: 0 clean, 1 findings or unloaded,
  2 bad input.
- **Report app:** the form and the client against a fake endpoint, plus the hand-off when the probe
  fails.
- **Hosted:** a smoke test of the function locally (`vercel dev` or a Node harness) against a
  public fixture page. Deploying is the user's step.

## 8. Hosted deployment: a decision for the user

The report is built as one static HTML file and served at `https://dobra-five.vercel.app/report/`,
inside the Vercel project "dobra", as part of the static site from `apps/site`. That site is
deployed as a prebuilt static folder (`vercel deploy dist`), so it has no serverless functions
today. A hosted `/api/check` needs one of:

| Option | How | For | Against |
|---|---|---|---|
| **A. Functions in the "dobra" project** | Switch the site's deploy from a prebuilt folder to a Vercel build (or `vercel build` locally, then `vercel deploy --prebuilt`) that includes `api/check` and `api/health` | Same origin: the report calls `/api/check` with no CORS; one project, one domain | Changes how agent/03 deploys the site; the Chromium function's size and cold start affect that project's builds |
| **B. A separate function project** | A second Vercel project (for example `dobra-check`) with only the two functions; the report calls its URL | The static site's deploy stays as it is; the check can be scaled, limited or turned off on its own | Cross-origin: the function sends CORS headers for `dobra-five.vercel.app` only; the report needs the function's URL at build time; two projects to manage |

**Chosen: A** (2026-09-28). Same origin keeps the client and the security model simple. Choose
**B** if the site's deploy should stay a plain static upload. Either way, the local mode and the
hand-off work without any deployment.

## 9. Ownership and delivery

- `packages/cli`: agent/02's area; the handler and the `report` subcommand go in new files, agreed
  with agent/02.
- `apps/report`: agent/03 is restyling it (PR #83). The form and client ship as self-contained
  components for that plan to place.

Delivery slices, each its own issue and PR:

0. Spike: confirm a serverless Chromium package that runs in a Vercel function within its size
   and time limits, and honours the display-feature override. It decides whether slice 3 checks
   folds or only sizes.
1. Handler and local `report` server (packages/cli).
2. Report app: Website input, probe, check call and hand-off (apps/report).
3. Hosted Vercel functions and configuration (apps/report/api, `vercel.json`); deploying is the
   user's step.

## 10. Risks

- Serverless Chromium size and cold starts, and whether it honours the display-feature override.
  If it doesn't, hosted checks run size-only for folded targets and the report says so in a note.
- Abuse of a public URL fetcher: mitigated by the policy in §4. The user owns the Vercel project
  and its limits.
- Function time limits cap how many targets one hosted request can check.
