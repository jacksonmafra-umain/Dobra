// Chrome on a device: open the page in it, then forward its DevTools socket to a free local port so
// Playwright can connect. The forward is this run's own (tcp:0) and is removed on close.
import { shQuote } from '@dobra/core/emulator/script';
import { ToolError, type Runner } from '../emulator/runner';
import { adbFor } from './adb';

export interface ChromeSession {
  port: number;
  close(): Promise<void>;
}

export async function openChrome(
  r: Runner,
  serial: string,
  url: string,
  {
    waitMs = 20_000,
    sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms)),
    emulator = false,
  }: { waitMs?: number; sleep?: (ms: number) => Promise<void>; emulator?: boolean } = {},
): Promise<ChromeSession> {
  const adb = adbFor(r);
  if (emulator) {
    // A fresh emulator's Chrome stops on its first-run screens and never opens DevTools. Emulators
    // only: Chrome reads these flags from /data/local/tmp when it's the debug app. Never on a phone.
    for (const cmd of [
      ["echo '_ --disable-fre --no-default-browser-check --no-first-run' > /data/local/tmp/chrome-command-line"],
      ['am', 'set-debug-app', '--persistent', 'com.android.chrome'],
      ['am', 'force-stop', 'com.android.chrome'],
    ])
      await r.exec(adb, ['-s', serial, 'shell', ...cmd]);
  }
  // adb shell hands its arguments to the device's shell as one line, so the address is quoted.
  const start = await r.exec(adb, ['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', shQuote(url), 'com.android.chrome']);
  if (start.code !== 0 || /^Error/m.test(start.stdout)) throw new ToolError(`Chrome isn't installed on ${serial}.`);
  const fwd = await r.exec(adb, ['-s', serial, 'forward', 'tcp:0', 'localabstract:chrome_devtools_remote']);
  const port = Number(fwd.stdout.trim());
  if (fwd.code !== 0 || !Number.isInteger(port) || port <= 0) throw new ToolError(`adb couldn't forward Chrome's DevTools on ${serial}: ${(fwd.stderr || fwd.stdout).trim()}`);
  let open = true;
  const close = async () => {
    if (!open) return;
    open = false;
    await r.exec(adb, ['-s', serial, 'forward', '--remove', `tcp:${port}`]);
  };
  for (let waited = 0; ; waited += 500) {
    const unix = await r.exec(adb, ['-s', serial, 'shell', 'cat', '/proc/net/unix']);
    if (unix.stdout.includes('@chrome_devtools_remote')) return { port, close };
    if (waited >= waitMs) {
      await close();
      throw new ToolError(`Chrome on ${serial} didn't open DevTools: unlock the phone and keep Chrome in front, and check that USB debugging is on.`);
    }
    await sleep(500);
  }
}
