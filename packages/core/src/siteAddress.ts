// A site address as people type it: "www.example.com" means https://www.example.com. An explicit
// scheme (http://localhost:3000) is kept, and callers still reject anything but http and https.
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

export function withScheme(address: string): string {
  const a = address.trim();
  return a === '' || SCHEME.test(a) ? a : `https://${a}`;
}
