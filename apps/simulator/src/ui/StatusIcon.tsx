import type { StatusKind } from './brand';

// Three 14 px icons drawn with currentColor; the color comes from .finding-icon--<kind>.
const PATHS: Record<StatusKind, string> = {
  error: 'M7 1.5 12.5 12H1.5Z M7 5.5v3 M7 10.2v.1',
  warn: 'M7 1.75a5.25 5.25 0 1 0 0 10.5A5.25 5.25 0 0 0 7 1.75Z M7 4.5v3.2 M7 9.6v.1',
  info: 'M7 1.75a5.25 5.25 0 1 0 0 10.5A5.25 5.25 0 0 0 7 1.75Z M7 6.4v3.6 M7 4.4v.1',
};

export function StatusIcon({ kind }: { kind: StatusKind }) {
  return (
    <svg className={`finding-icon finding-icon--${kind}`} viewBox="0 0 14 14" width="14" height="14" aria-hidden>
      <path d={PATHS[kind]} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
