/** Notes the checker left about the run (Report.notes), such as a target it zoomed out to fit. */
export function ReportNotes({ notes }: { notes?: string[] }) {
  if (!notes?.length) return null;
  return (
    <>
      <h2>Notes</h2>
      <ul>
        {notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </>
  );
}
