import { describe, expect, it } from 'vitest';
import manifest from '../manifest.json';

describe('manifest', () => {
  it('is a network-free, dynamic-page plugin with its commands and a Re-check button', () => {
    expect(manifest).toMatchObject({
      name: 'Hinge',
      api: '1.0.0',
      editorType: ['figma', 'dev'],
      main: 'dist/code.js',
      ui: 'dist/ui.html',
      documentAccess: 'dynamic-page',
      networkAccess: { allowedDomains: ['none'] },
    });
    expect(manifest.menu.map((m: { command: string }) => m.command)).toEqual(['presets', 'tag', 'coverage', 'check', 'adapt']);
    expect(manifest.relaunchButtons).toEqual([{ command: 'check', name: 'Re-check' }]);
  });
});
