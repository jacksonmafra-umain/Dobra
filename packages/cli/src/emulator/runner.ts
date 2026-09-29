// What dobra emulator needs from the machine: run a tool, and read and write files. Tests pass a fake.
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface Runner {
  exec(file: string, args: string[], input?: string): Promise<ExecResult>;
  exists(path: string): boolean;
  /** Entry names in a folder; empty when it's missing. */
  list(dir: string): string[];
  read(path: string): string;
  write(path: string, data: string): void;
  rename(from: string, to: string): void;
  env: Record<string, string | undefined>;
  arch: string;
  platform: string;
  home: string;
}

/** A platform tool that is missing or failed: exit 1, with what to do about it. */
export class ToolError extends Error {}

export const nodeRunner: Runner = {
  exec: (file, args, input) =>
    new Promise((resolve) => {
      const child = execFile(file, args, { maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
        const code = error ? (typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : 1) : 0;
        resolve({ code, stdout: String(stdout), stderr: error && !stderr ? error.message : String(stderr) });
      });
      if (input !== undefined) child.stdin?.end(input);
    }),
  exists: (p) => existsSync(p),
  list: (d) => {
    try {
      return readdirSync(d);
    } catch {
      return [];
    }
  },
  read: (p) => readFileSync(p, 'utf8'),
  write: (p, data) => writeFileSync(p, data, 'utf8'),
  rename: (a, b) => renameSync(a, b),
  env: process.env,
  arch: process.arch,
  platform: process.platform,
  home: homedir(),
};
