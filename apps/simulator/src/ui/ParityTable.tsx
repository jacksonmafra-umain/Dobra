import type { ParityRow } from './parity';

/** What each platform resolves for the same screen and state. Rows that differ are emphasised; neither side is the reference. */
export function ParityTable({ rows, a, b }: { rows: ParityRow[]; a: string; b: string }) {
  return (
    <table className="parity-table">
      <thead>
        <tr>
          <th scope="col" />
          <th scope="col">{a}</th>
          <th scope="col">{b}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} data-differs={r.differs || undefined}>
            <th scope="row">{r.label}</th>
            <td>{r.a}</td>
            <td>{r.b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
