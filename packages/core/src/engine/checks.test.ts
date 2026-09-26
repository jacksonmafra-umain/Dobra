// src/engine/checks.test.ts
import { describe, expect, it } from 'vitest';
import raw from '../config/simulator.config.json';
import { parseConfig } from '../config/schema';
import { runLayoutChecks, targetOf } from './checks';
import { resolveEnvironment, type Selection } from './environment';
import { observedConfig } from './fixtures/observed';
import { resolveLayout } from './layout';

const base = parseConfig(raw);
const flipCover: Selection = { deviceId: 'galaxy-z-flip-7', displayId: 'cover', orientation: 'portrait', free: null, pose: 'closed' };

function findings(config: typeof base, sel: Selection, screenId: string) {
  const env = resolveEnvironment(config, sel);
  const screen = config.screens.find((s) => s.id === screenId)!;
  return runLayoutChecks(config, env, resolveLayout(config, env, screen), screen, targetOf(sel, env));
}

describe('shipped config', () => {
  it('raises no errors on the Flip cover home screen', () => {
    expect(findings(base, flipCover, 'home').filter((f) => f.severity === 'error')).toEqual([]);
  });
});

describe('observed failure #1: landscape is not wide', () => {
  it('flags a side-by-side hero on the 352 dp cover', () => {
    const f = findings(observedConfig(base, 1), flipCover, 'home');
    expect(f).toContainEqual(
      expect.objectContaining({ ruleId: 'landscape-not-wide', severity: 'error', nodeId: 'news_story_hero', source: 'androidx-window' }),
    );
    expect(f[0].target).toEqual({ deviceId: 'galaxy-z-flip-7', displayId: 'cover', pose: 'closed', orientation: 'landscape', rotation: 0 });
  });
});

describe('observed failure #2: cumulative width loss', () => {
  it('flags the hero text column below its legible width', () => {
    const f = findings(observedConfig(base, 2), flipCover, 'home').find((x) => x.ruleId === 'min-legible-width');
    expect(f).toMatchObject({ nodeId: 'news_story_hero', estimated: true });
    expect(f!.message).toMatch(/352 dp window → 228 dp content → hero text 66 dp < 200 dp/);
  });
});

describe('observed failure #5: text in a 40% pane', () => {
  it('flags the list pane on a 600 dp window', () => {
    const sel: Selection = { deviceId: 'pixel-tablet', displayId: 'main', orientation: 'portrait', free: null, windowMode: 'split', splitRatio: 0.5 };
    const f = findings(observedConfig(base, 5), sel, 'locations').find((x) => x.ruleId === 'min-legible-width');
    expect(f).toMatchObject({ nodeId: 'pane:list', severity: 'warn' });
  });
});

describe('other layout checks', () => {
  it('warns about a floating bar on a short window', () => {
    const f = findings(base, { deviceId: 'pixel-9', displayId: 'main', orientation: 'portrait', free: null }, 'home');
    expect(f.map((x) => x.ruleId)).not.toContain('chrome-overlap');
    const short = findings(base, { deviceId: 'pixel-9', displayId: 'main', orientation: 'portrait', free: null, windowMode: 'split' }, 'home');
    expect(short).toContainEqual(expect.objectContaining({ ruleId: 'chrome-overlap', estimated: true }));
  });

  it('flags a single pane that straddles a separating hinge', () => {
    const cfg = structuredClone(base);
    const rule = cfg.layoutRules.find((r) => r.id === 'android-expanded')!;
    rule.scene = 'single';
    const sel: Selection = { deviceId: 'pixel-9-pro-fold', displayId: '', orientation: 'portrait', free: null, pose: 'book' };
    expect(findings(cfg, sel, 'locations')).toContainEqual(expect.objectContaining({ ruleId: 'pane-split', severity: 'error' }));
  });

  it('does not flag panes split at the hinge', () => {
    const sel: Selection = { deviceId: 'pixel-9-pro-fold', displayId: '', orientation: 'portrait', free: null, pose: 'book' };
    expect(findings(base, sel, 'locations').map((f) => f.ruleId)).not.toContain('pane-split');
  });

  it('notes a single pane in tabletop', () => {
    const f = findings(base, { deviceId: 'pixel-9-pro-fold', displayId: '', orientation: 'portrait', free: null, pose: 'tabletop' }, 'home');
    expect(f).toContainEqual(expect.objectContaining({ ruleId: 'tabletop-controls', severity: 'info' }));
  });
});
