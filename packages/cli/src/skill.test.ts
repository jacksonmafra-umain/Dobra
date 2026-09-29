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

  it('passes only options dobra check site accepts', () => {
    const unknown: string[] = [];
    for (const f of files()) {
      for (const line of read(f).split('\n')) {
        if (!line.includes('dobra check site')) continue;
        for (const [option] of line.matchAll(/--[a-z][a-z-]*/g)) {
          if (option !== '--help' && !USAGE.includes(option)) unknown.push(`${f}: ${option}`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it('passes only options dobra emulator accepts', () => {
    const unknown: string[] = [];
    for (const f of files()) {
      for (const line of read(f).split('\n')) {
        if (!line.includes('dobra emulator')) continue;
        for (const [option] of line.matchAll(/--[a-z][a-z-]*/g)) {
          if (!EMULATOR_USAGE.includes(option)) unknown.push(`${f}: ${option}`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it('probes for the emulator command with one that exits 0 when it exists', () => {
    // `dobra emulator --help` prints the usage but exits 2, so it can't tell "missing" from "there".
    expect(read('emulators.md')).toMatch(/dobra emulator list --json/);
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
