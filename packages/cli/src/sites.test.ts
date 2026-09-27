// Acceptance: the example sites reproduce foldable failures seen on real devices, and
// examples/sites/expected.json says which rules each must (and must not) trigger.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseTargetKey } from '@dobra/core/targets';
import { checkSite } from './checkSite';
import { startFixtureServer } from './test/server';

const SITES = fileURLToPath(new URL('../../../examples/sites/', import.meta.url));
interface Check { target: string; expect: string[]; forbid: string[] }
interface Expected {
  pages: { file: string; checks: Check[] }[];
  transitions: ({ file: string; from: string; to: string } & Omit<Check, 'target'>)[];
}
const expected = JSON.parse(readFileSync(`${SITES}expected.json`, 'utf8')) as Expected;

let browser: Browser;
let server: Awaited<ReturnType<typeof startFixtureServer>>;
beforeAll(async () => {
  browser = await chromium.launch();
  server = await startFixtureServer(SITES);
});
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

async function rulesOn(file: string, key: string, transitions: boolean): Promise<string[]> {
  const target = parseTargetKey(key);
  if (!target) throw new Error(`Bad target key ${key}`);
  const report = await checkSite(`${server.url}/${file}`, [target], { wait: 300, transitions, browser });
  if (report.unloaded.length) throw new Error(`${file} did not load: ${report.unloaded[0].reason}`);
  return report.frames[0].findings.map((f) => f.ruleId);
}

describe('example sites', () => {
  for (const page of expected.pages)
    for (const c of page.checks)
      it(`${page.file} on ${c.target}`, async () => {
        const rules = await rulesOn(page.file, c.target, false);
        expect(rules).toEqual(expect.arrayContaining(c.expect));
        expect(rules.filter((r) => c.forbid.includes(r))).toEqual([]);
      });

  for (const t of expected.transitions)
    it(`${t.file}: unfolding ${t.from} to ${t.to}`, async () => {
      const rules = await rulesOn(t.file, t.to, true);
      expect(rules).toEqual(expect.arrayContaining(t.expect));
      expect(rules.filter((r) => t.forbid.includes(r))).toEqual([]);
    });
});
