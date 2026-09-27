// src/engine/gridFlexLayout.test.ts
import { describe, expect, it } from 'vitest';
import raw from '../config/simulator.config.json';
import { parseConfig } from '../config/schema';
import { resolveEnvironment } from './environment';
import { resolveLayout } from './layout';

const config = parseConfig(raw);
const layout = (deviceId: string, screenId: string) =>
  resolveLayout(
    config,
    resolveEnvironment(config, { deviceId, displayId: '', orientation: 'portrait', free: null }),
    config.screens.find((s) => s.id === screenId)!,
  );

describe('grid and flex forms', () => {
  it('keeps perRow components resolving exactly as before', () => {
    const l = layout('iphone-17', 'rewards');
    expect(l.resolved.reward_card.form).toBe('perRow');
    expect(l.perRow.reward_card).toBe(2);
  });
  it('resolves an adaptive grid for products', () => {
    expect(layout('android-compact-phone', 'products').resolved.product_card.columnWidths).toHaveLength(1);
    expect(layout('pixel-9', 'products').resolved.product_card.columnWidths).toEqual([181.5, 181.5]);
    expect(layout('pixel-tablet', 'products').resolved.product_card.columnWidths.length).toBeGreaterThan(2);
  });
  it('resolves a wrapping flex for shortcuts on Android', () => {
    const r = layout('android-compact-phone', 'home').resolved.shortcut_card_item;
    expect(r.form).toBe('flex');
    expect(r.items).toHaveLength(config.components.shortcut_card_item.items ?? 6);
  });
});
