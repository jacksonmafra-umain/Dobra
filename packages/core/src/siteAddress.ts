// A site address as people type or paste it: "www.example.com" means https://www.example.com. An
// explicit scheme (http://localhost:3000) is kept, and callers still reject anything but http and
// https. Pastes from chat and docs often arrive as a Markdown link or in angle brackets; the
// address inside is used.
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const MARKDOWN_LINK = /^\[[^\]]*\]\(([^)\s]+)\)$/;
const ANGLED = /^<([^>\s]+)>$/;

export function withScheme(address: string): string {
  let a = address.trim();
  a = MARKDOWN_LINK.exec(a)?.[1] ?? a;
  a = ANGLED.exec(a)?.[1] ?? a;
  return a === '' || SCHEME.test(a) ? a : `https://${a}`;
}
