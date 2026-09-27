// src/engine/fixtures/observed.ts
// Config variants that reproduce failures observed on a physical Galaxy Z Flip 7 and a Pixel 9 Pro
// Fold emulator. Tests only: the shipped config must not trigger them.
import type { SimulatorConfig } from '../../config/types';

export function observedConfig(base: SimulatorConfig, failure: 1 | 2 | 5): SimulatorConfig {
  const cfg: SimulatorConfig = structuredClone(base);
  const android = cfg.layoutRules.filter((r) => r.platform === 'android');
  const short = android.find((r) => r.id === 'android-compact-short')!;
  switch (failure) {
    case 1:
      // Side-by-side chosen from orientation == landscape: the hero splits on the 352 dp cover.
      short.match = { orientation: 'landscape' };
      short.components.news_story_hero = { variant: 'split', bleed: 'inset' };
      break;
    case 2:
      // Stacked landscape branches: wide page gutters plus the split hero leave the text column tiny.
      short.pageMargin = { base: 62, mode: 'max' };
      short.components.news_story_hero = { variant: 'split', bleed: 'inset' };
      break;
    case 5:
      // Text that fits in one column and not in a 40% pane.
      cfg.scenes!['list-detail'] = { ...cfg.scenes!['list-detail'], listMinWidth: 0, detailMinWidth: 0 };
      break;
  }
  return cfg;
}
