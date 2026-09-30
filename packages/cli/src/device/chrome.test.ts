import { describe, expect, it } from 'vitest';
import { openChrome } from './chrome';
import { fakeAdb } from './fakeAdb';

const instant = { sleep: async () => {} };
const UNIX_READY = '0000000000000000: 00000002 00000000 00010000 0001 01 12345 @chrome_devtools_remote\n';

function device(opts: { socket?: boolean; noChrome?: boolean } = {}) {
  return fakeAdb({ RZ: { model: 'SM-F741B' } }, (args) => {
    const cmd = args.join(' ');
    if (cmd.startsWith('-s RZ forward tcp:0')) return { code: 0, stdout: '41817\n', stderr: '' };
    if (cmd.startsWith('-s RZ shell am start'))
      return opts.noChrome ? { code: 0, stdout: 'Error: Activity class {com.android.chrome/…} does not exist.\n', stderr: '' } : { code: 0, stdout: 'Starting: Intent { … }\n', stderr: '' };
    if (cmd === '-s RZ shell cat /proc/net/unix') return { code: 0, stdout: opts.socket === false ? '' : UNIX_READY, stderr: '' };
    return undefined;
  });
}
const sent = (r: ReturnType<typeof device>) => r.calls.filter((c) => c.args[0] === '-s').map((c) => c.args.slice(2).join(' '));

describe('openChrome', () => {
  it('opens the page in Chrome and forwards DevTools to the port adb picks', async () => {
    const r = device();
    const s = await openChrome(r, 'RZ', 'http://localhost:4000/good.html', instant);
    expect(s.port).toBe(41817);
    expect(sent(r)).toContain("shell am start -a android.intent.action.VIEW -d 'http://localhost:4000/good.html' com.android.chrome");
    expect(sent(r)).toContain('forward tcp:0 localabstract:chrome_devtools_remote');
  });

  it('removes only its own forward, once', async () => {
    const r = device();
    const s = await openChrome(r, 'RZ', 'http://x', instant);
    await s.close();
    await s.close();
    expect(sent(r).filter((c) => c.startsWith('forward --remove'))).toEqual(['forward --remove tcp:41817']);
  });

  it('gives up with the fix when DevTools never appears, and removes the forward first', async () => {
    const r = device({ socket: false });
    await expect(openChrome(r, 'RZ', 'http://x', { ...instant, waitMs: 1000 })).rejects.toThrow(/didn't open DevTools: unlock the phone/);
    expect(sent(r)).toContain('forward --remove tcp:41817');
  });

  it('says when Chrome is not installed', async () => {
    await expect(openChrome(device({ noChrome: true }), 'RZ', 'http://x', instant)).rejects.toThrow(/Chrome isn't installed on RZ/);
  });

  it('quotes the address for the device shell, so it cannot run as a command there', async () => {
    const r = device();
    await openChrome(r, 'RZ', "http://x/?a=1&b=2;reboot'", instant);
    expect(sent(r).find((c) => c.startsWith('shell am start'))).toBe("shell am start -a android.intent.action.VIEW -d 'http://x/?a=1&b=2;reboot'\\''' com.android.chrome");
  });

  it('skips Chrome\'s first-run screens on an emulator, and touches nothing like that on a phone', async () => {
    const emu = device();
    await openChrome(emu, 'RZ', 'http://x', { ...instant, emulator: true });
    const cmds = sent(emu);
    expect(cmds).toContain("shell echo '_ --disable-fre --no-default-browser-check --no-first-run' > /data/local/tmp/chrome-command-line");
    expect(cmds).toContain('shell am set-debug-app --persistent com.android.chrome');
    expect(cmds.indexOf('shell am force-stop com.android.chrome')).toBeLessThan(cmds.findIndex((c) => c.startsWith('shell am start')));
    const phone = device();
    await openChrome(phone, 'RZ', 'http://x', instant);
    expect(sent(phone).some((c) => /chrome-command-line|set-debug-app|force-stop/.test(c))).toBe(false);
  });
});

