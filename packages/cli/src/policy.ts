// Which addresses a site check may reach. The local server checks anything, including localhost;
// the hosted check refuses private networks, so it can't be used to reach them.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface Policy {
  mode: 'local' | 'hosted';
  maxTargets: number;
  maxSeconds: number;
  /** False where the browser can't emulate a fold; folded targets are then checked for size only. */
  foldEmulation: boolean;
}

export const LOCAL: Policy = { mode: 'local', maxTargets: Infinity, maxSeconds: Infinity, foldEmulation: true };
export const HOSTED: Policy = { mode: 'hosted', maxTargets: 6, maxSeconds: 50, foldEmulation: true };

export type Resolve = (host: string) => Promise<string[]>;

const PRIVATE_NOTE = 'This address is on a private network. Run `npm run dobra -- report` to check it locally.';

/** Loopback, private, shared (CGNAT), link-local, unspecified, multicast and reserved IPv4 ranges. */
function privateV4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/** The eight 16-bit groups of an IPv6 address, with `::` and a dotted IPv4 tail expanded. */
function groups(ip: string): number[] {
  let s = ip.toLowerCase();
  const dotted = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const [a, b, c, d] = dotted[1].split('.').map(Number);
    s = s.slice(0, -dotted[1].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = s.split('::');
  const h = head ? head.split(':') : [];
  const t = tail !== undefined && tail ? tail.split(':') : [];
  const fill = tail === undefined ? [] : new Array(8 - h.length - t.length).fill('0');
  return [...h, ...fill, ...t].map((g) => parseInt(g || '0', 16));
}

export function isPublicAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return !privateV4(ip);
  if (kind !== 6) return false;
  const g = groups(ip);
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) addresses carry an IPv4 address.
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    if (g[5] === 0 && g[6] === 0 && g[7] <= 1) return false; // :: and ::1
    return !privateV4(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`);
  }
  const first = g[0];
  if ((first & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((first & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((first & 0xff00) === 0xff00) return false; // multicast ff00::/8
  return true;
}

const defaultResolve: Resolve = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/** Null when the URL may be fetched under this policy, else the reason it may not. */
export async function refuseUrl(url: string, policy: Policy, resolve: Resolve = defaultResolve): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'That is not a valid URL.';
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'Only http and https addresses can be checked.';
  if (policy.mode === 'local') return null;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  let ips: string[];
  try {
    ips = isIP(host) ? [host] : await resolve(host);
  } catch {
    ips = [];
  }
  if (!ips.length) return `${host} does not resolve.`;
  // Every answer must be public: a host with one private answer could be steered to it.
  if (!ips.every(isPublicAddress)) return PRIVATE_NOTE;
  return null;
}
