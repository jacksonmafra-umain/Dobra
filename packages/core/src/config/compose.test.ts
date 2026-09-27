import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import catalogJson from '../catalog/catalog.json';
import profileJson from '../profiles/sample.profile.json';
import { composeConfig } from './compose';

describe('composeConfig', () => {
  it('composes the catalog with a profile passed in', () => {
    expect(composeConfig(catalogJson, profileJson).layoutRules.length).toBeGreaterThan(0);
  });

  it('does not import the sample profile itself', () => {
    const src = readFileSync(fileURLToPath(new URL('./compose.ts', import.meta.url)), 'utf8');
    expect(src).not.toMatch(/sample\.profile|\.json['"]/);
  });
});
