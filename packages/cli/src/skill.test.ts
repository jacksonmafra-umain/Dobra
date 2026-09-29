// Keeps the dobra agent skill honest: the guide sections it cites exist, the CLI options it tells
// agents to pass are real, its links between files resolve, and Android text never shows pt.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { USAGE } from './args';
import { EMULATOR_USAGE } from './emulator/args';

const ROOT = join(import.meta.dirname, '../../..');
const SKILL = join(ROOT, 'plugins/dobra/skills/dobra');
const GUIDE = join(ROOT, 'docs/guide');

const files = () => readdirSync(SKILL).filter((f) => f.endsWith('.md'));
const source = (path: string) => readFileSync(join(ROOT, path), 'utf8');

/** The options a usage text lists, as whole tokens. */
const optionsOf = (usage: string) => new Set([...usage.matchAll(/(?:^|[\s[])(--[a-z][a-z-]*)/g)].map((m) => m[1]));
const SITE_OPTIONS = optionsOf(USAGE);
const EMULATOR_OPTIONS = optionsOf(EMULATOR_USAGE);

/** Every --option on the lines of a file that aren't about another tool (curl, adb, xcrun, npm). */
function optionsIn(text: string, only?: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    if (/\b(curl|adb|xcrun|npx|npm)\b/.test(line)) continue;
    if (only && !line.includes(only)) continue;
    for (const [option] of line.matchAll(/--[a-z][a-z-]*/g)) out.push(option);
  }
  return out;
}
const read = (f: string) => readFileSync(join(SKILL, f), 'utf8');

/** GitHub-style heading anchors, as the site renders them, for ASCII headings. */
function anchors(markdown: string): Set<string> {
  const out = new Set<string>();
  for (const line of markdown.split('\n')) {
    const m = /^#{1,6} (.+)$/.exec(line);
    if (!m) continue;
    out.add(m[1].trim().toLowerCase().replace(/[^a-z0-9 _-]/g, '').replace(/ /g, '-'));
  }
  return out;
}

describe('dobra skill', () => {
  it('has a SKILL.md named dobra with a description', () => {
    const text = read('SKILL.md');
    const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
    expect(front).not.toBeNull();
    expect(front![1]).toMatch(/^name: dobra$/m);
    const description = /^description: (.+)$/m.exec(front![1]);
    expect(description).not.toBeNull();
    expect(description![1].length).toBeLessThanOrEqual(1024);
  });

  it('cites only guide sections that exist', () => {
    const missing: string[] = [];
    for (const f of files()) {
      for (const [, file, anchor] of read(f).matchAll(/\b(\d{2}-[a-z-]+\.md)#([a-z0-9-]+)/g)) {
        const path = join(GUIDE, file);
        if (!existsSync(path) || !anchors(readFileSync(path, 'utf8')).has(anchor)) missing.push(`${f}: ${file}#${anchor}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('passes only options dobra check site accepts, as whole tokens', () => {
    const unknown: string[] = [];
    for (const f of files()) {
      const options = f === 'site-check.md' ? optionsIn(read(f)) : optionsIn(read(f), 'dobra check site');
      for (const o of options) if (o !== '--help' && !SITE_OPTIONS.has(o)) unknown.push(`${f}: ${o}`);
    }
    expect(unknown).toEqual([]);
  });

  it('passes only options dobra emulator accepts, as whole tokens', () => {
    const unknown: string[] = [];
    for (const f of files()) {
      const options = f === 'emulators.md' ? optionsIn(read(f)) : optionsIn(read(f), 'dobra emulator');
      for (const o of options) if (o !== '--help' && !EMULATOR_OPTIONS.has(o)) unknown.push(`${f}: ${o}`);
    }
    expect(unknown).toEqual([]);
  });

  it('explains every rule the checks can report, and no others', () => {
    const union = /export type RuleId =([\s\S]*?);/.exec(source('packages/core/src/engine/checks.ts'))![1];
    const rules = [...union.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]).sort();
    const table = [...read('site-check.md').matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1]).sort();
    expect(table).toEqual(rules);
  });

  it('names only catalog devices', () => {
    const catalog = JSON.parse(source('packages/core/src/catalog/catalog.json')) as { devices: { id: string }[] };
    const ids = new Set(catalog.devices.map((d) => d.id));
    const unknown: string[] = [];
    for (const f of files()) {
      for (const [, id] of read(f).matchAll(/`((?:iphone|ipad|pixel|galaxy|surface|razr|huawei|oneplus|oppo|android|tablet|chromebook)-[a-z0-9-]+)`/g)) {
        if (!ids.has(id)) unknown.push(`${f}: ${id}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('matches only error messages the CLI prints', () => {
    const cli = ['packages/cli/src/main.ts', 'packages/cli/src/targets.ts', 'packages/cli/src/args.ts'].map(source).join('\n');
    for (const message of ['Unknown target', 'Not a web address']) {
      expect(cli).toContain(message);
      expect(read('site-check.md')).toContain(message);
    }
    expect(source('scripts/dobra')).toContain('Unknown command: %s');
  });

  it('probes for the emulator command with one that exits 0 when it exists', () => {
    // `dobra emulator --help` prints the usage but exits 2, so it can't tell "missing" from "there".
    expect(read('emulators.md')).toMatch(/dobra emulator list --json/);
  });

  it('checks local servers with the same scheme the check uses', () => {
    const text = read('site-check.md');
    expect(text).toMatch(/http:\/\//);
    expect(text).toMatch(/curl[^\n]*--max-time/);
  });

  it('links only files in the skill', () => {
    const broken: string[] = [];
    for (const f of files()) {
      for (const [, target] of read(f).matchAll(/\]\(([a-z-]+\.md)\)/g)) {
        if (!existsSync(join(SKILL, target))) broken.push(`${f} -> ${target}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('never gives Android sizes in pt', () => {
    if (!existsSync(join(SKILL, 'native-android.md'))) return;
    expect(read('native-android.md')).not.toMatch(/\d\s?pt\b/);
  });
});
