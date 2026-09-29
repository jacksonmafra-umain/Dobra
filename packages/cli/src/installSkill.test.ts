// The installer's step that copies the dobra agent skill into ~/.claude/skills.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../../..');

/** Runs install.sh's install_skill function alone, with HOME in a temporary folder. */
function installSkill(home: string) {
  const script = `
    set -euo pipefail
    info() { printf '%s\\n' "$*"; }
    MARKER=.dobra-install
    eval "$(sed -n '/^install_skill() {/,/^}/p' "$1/install.sh")"
    install_skill "$1"
  `;
  return spawnSync('bash', ['-c', script, '_', ROOT], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
}

describe('install_skill', () => {
  it('copies the skill and marks it', () => {
    const home = mkdtempSync(join(tmpdir(), 'dobra-home-'));
    const r = installSkill(home);
    expect(r.status).toBe(0);
    const dest = join(home, '.claude/skills/dobra');
    expect(readFileSync(join(dest, 'SKILL.md'), 'utf8')).toMatch(/^name: dobra$/m);
    expect(existsSync(join(dest, '.dobra-install'))).toBe(true);
  });

  it('replaces a copy it installed before', () => {
    const home = mkdtempSync(join(tmpdir(), 'dobra-home-'));
    installSkill(home);
    const dest = join(home, '.claude/skills/dobra');
    writeFileSync(join(dest, 'stale.md'), 'old');
    expect(installSkill(home).status).toBe(0);
    expect(existsSync(join(dest, 'stale.md'))).toBe(false);
    expect(existsSync(join(dest, 'SKILL.md'))).toBe(true);
  });

  it('leaves a dobra skill folder it did not install alone', () => {
    const home = mkdtempSync(join(tmpdir(), 'dobra-home-'));
    const dest = join(home, '.claude/skills/dobra');
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, 'SKILL.md'), 'mine');
    const r = installSkill(home);
    expect(r.status).toBe(0);
    expect(readFileSync(join(dest, 'SKILL.md'), 'utf8')).toBe('mine');
    expect(r.stdout).toMatch(/Leaving .*dobra alone/);
  });
});
