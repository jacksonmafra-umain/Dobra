import { describe, expect, it } from 'vitest';
import { createNodeRunner } from './runner';

describe('createNodeRunner', () => {
  it('runs tools with its own environment, so ANDROID_AVD_HOME reaches avdmanager', async () => {
    const r = createNodeRunner({ PATH: process.env.PATH, DOBRA_PROBE: 'from runner' });
    const res = await r.exec('sh', ['-c', 'printf %s "$DOBRA_PROBE"']);
    expect(res).toMatchObject({ code: 0, stdout: 'from runner' });
  });

  it('feeds input to the tool', async () => {
    const res = await createNodeRunner().exec('cat', [], 'no\n');
    expect(res.stdout).toBe('no\n');
  });

  it('reports a program it cannot start instead of crashing', async () => {
    const errors: string[] = [];
    createNodeRunner().start('/no/such/dobra-emulator', [], (e) => errors.push(e));
    await new Promise((r) => setTimeout(r, 200));
    expect(errors.join()).toMatch(/ENOENT/);
  });
});

