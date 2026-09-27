import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '@hinge/core/config/load';
import catalogJson from '@hinge/core/catalog/catalog.json';

describe('@hinge/core', () => {
  it('serves the config JSON and a validated config', () => {
    expect(loadConfig().devices.length).toBe(catalogJson.devices.length);
  });

  it('has no old-path re-exports left in the app', () => {
    for (const dir of ['engine', 'config']) {
      expect(existsSync(fileURLToPath(new URL(`./${dir}`, import.meta.url)))).toBe(false);
    }
  });
});
