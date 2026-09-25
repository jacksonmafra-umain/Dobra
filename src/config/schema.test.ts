import { describe, expect, it } from 'vitest';
import raw from './simulator.config.json';
import { ConfigError, parseConfig } from './schema';

const clone = () => JSON.parse(JSON.stringify(raw));

function issuesOf(cfg: unknown): string[] {
  try {
    parseConfig(cfg);
  } catch (e) {
    if (e instanceof ConfigError) return e.issues;
    throw e;
  }
  return [];
}

describe('config schema', () => {
  it('accepts the shipped config', () => {
    expect(() => parseConfig(raw)).not.toThrow();
  });

  it('reports the path of a wrong type', () => {
    const cfg = clone();
    cfg.devices[1].displays.main.portraitSize.width = '402';
    expect(issuesOf(cfg)[0]).toMatch(/^devices\[1\]\.displays\.main\.portraitSize\.width: /);
  });

  it('rejects unknown keys so typos surface', () => {
    const cfg = clone();
    cfg.layoutRules[0].panse = 2;
    expect(issuesOf(cfg).join('\n')).toMatch(/layoutRules\[0\]/);
  });

  it('ignores $-prefixed comment keys', () => {
    const cfg = clone();
    cfg.layoutRules[0].$note = 'free text';
    expect(issuesOf(cfg)).toEqual([]);
  });

  it('checks cross references', () => {
    const cfg = clone();
    cfg.devices[3].poses[0].display = 'cover';
    cfg.screens[0].tab = 'missing';
    const issues = issuesOf(cfg).join('\n');
    expect(issues).toMatch(/devices\[3\]\.poses\[0\]\.display: .*"cover"/);
    expect(issues).toMatch(/screens\[0\]\.tab: /);
  });

  it('requires a fallback rule last', () => {
    const cfg = clone();
    cfg.layoutRules.pop();
    expect(issuesOf(cfg).join('\n')).toMatch(/fallback/);
  });
});
