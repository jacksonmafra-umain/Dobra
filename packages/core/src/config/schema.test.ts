import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../catalog/load';
import { rawConfig as raw } from './load';
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
    const duo = cfg.devices.findIndex((d: { id: string }) => d.id === 'iphone-duo');
    cfg.devices[duo].poses[0].display = 'cover';
    cfg.screens[0].tab = 'missing';
    const issues = issuesOf(cfg).join('\n');
    expect(issues).toMatch(new RegExp(`devices\\[${duo}\\]\\.poses\\[0\\]\\.display: .*"cover"`));
    expect(issues).toMatch(/screens\[0\]\.tab: /);
  });

  it('requires a fallback rule last', () => {
    const cfg = clone();
    cfg.layoutRules.pop();
    expect(issuesOf(cfg).join('\n')).toMatch(/fallback/);
  });

  it('reports a media-only rule after the fallback as never matching', () => {
    const cfg = clone();
    const fallback = cfg.layoutRules.find((r: { platform: string; match: object }) => r.platform === 'android' && Object.keys(r.match).length === 0);
    cfg.layoutRules.push({ ...fallback, id: 'android-mouse', match: { pointer: 'fine' } });
    expect(issuesOf(cfg)).toContainEqual(expect.stringContaining('Rule "android-mouse" comes after the android fallback, so it never matches'));
  });

  it('ships no Figma file or frame ids', () => {
    const cfg = parseConfig(raw);
    expect('figmaFile' in cfg).toBe(false);
    expect(cfg.screens.every((s) => s.figma === null && typeof s.source === 'string')).toBe(true);
    expect(JSON.stringify(cfg.sources)).not.toMatch(/node \d|FILE_KEY/);
  });

  it('rejects a screen that names an unknown scene', () => {
    const cfg = clone();
    cfg.screens[0].scene = 'three-pane';
    expect(issuesOf(cfg).join('\n')).toMatch(/screens\[0\]\.scene: Unknown scene "three-pane"/);
  });
  it('rejects a grid form on a component that does not allow it', () => {
    const cfg = clone();
    cfg.layoutRules[0].components.reward_card = { grid: { columns: [{ fr: 1 }], gap: 16 } };
    expect(issuesOf(cfg).join('\n')).toMatch(/layoutRules\[0\]\.components\.reward_card: .*grid/);
  });

  it('rejects an empty track list', () => {
    const cfg = clone();
    const rule = cfg.layoutRules.find((r: { id: string }) => r.id === 'android-expanded');
    rule.components.product_card = { grid: { columns: [], gap: 16 } };
    expect(issuesOf(cfg).join('\n')).toMatch(/product_card/);
  });

  it('rejects an unknown cover-screen policy', () => {
    const cfg = clone();
    const flip = cfg.devices.find((d: { id: string }) => d.id === 'galaxy-z-flip-7');
    flip.displays.cover.coverScreen.policy = 'sometimes';
    expect(issuesOf(cfg).join('\n')).toMatch(/coverScreen\.policy/);
  });

  it('accepts media match keys and rejects unknown values with the path', () => {
    const cfg = clone();
    const android = cfg.layoutRules.findIndex((r: { platform: string }) => r.platform === 'android');
    cfg.layoutRules.splice(android, 0, { ...cfg.layoutRules[android], id: 'fine-pointer', match: { pointer: 'fine' } });
    expect(issuesOf(cfg)).toEqual([]);
    cfg.layoutRules[android].match = { pointer: 'hover' };
    expect(issuesOf(cfg).join('\n')).toMatch(/layoutRules\[\d+\]\.match\.pointer/);
  });

  it('checks the layout defaults: every class, non-negative numbers and known sources', () => {
    const missing = clone();
    delete missing.layoutDefaults.android.medium;
    expect(issuesOf(missing).join('\n')).toMatch(/layoutDefaults\.android.*Missing default for medium/);
    const negative = clone();
    negative.layoutDefaults.android.compact.margin = -1;
    expect(issuesOf(negative).join('\n')).toMatch(/layoutDefaults\.android\.compact\.margin/);
    const unknown = clone();
    unknown.layoutDefaults.ios.regular.source = 'nowhere';
    expect(issuesOf(unknown).join('\n')).toMatch(/Unknown source "nowhere"/);
  });
});

describe('iOS simulator mapping', () => {
  const ios = loadCatalog().devices.filter((d) => d.platform === 'ios');

  it('names an Apple simulator device type for every iOS device', () => {
    for (const d of ios) {
      expect(d.simulator?.deviceType, d.id).toMatch(/^com\.apple\.CoreSimulator\.SimDeviceType\.(iPhone|iPad)-[A-Za-z0-9-]+$/);
    }
  });

  it('marks the closest-model mappings as estimated', () => {
    const estimated = ios.filter((d) => d.simulator?.estimated).map((d) => d.id).sort();
    expect(estimated).toEqual(['ipad-11', 'iphone-mini', 'iphone-plus']);
  });
});
