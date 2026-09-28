import type { Report } from '@dobra/core/report';

/** Frames the report could not load, with the reason for each, in an error card. */
export function UnloadedList({ unloaded }: { unloaded: Report['unloaded'] }) {
  if (!unloaded.length) return null;
  return (
    <section className="note-card note-card--error">
      <h2>Could not load</h2>
      <ul>
        {unloaded.map((u) => (
          <li key={u.ref}>
            {u.name}: <span className="muted">{u.reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
