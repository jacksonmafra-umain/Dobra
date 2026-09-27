export interface ChangeEntry {
  label: string;
  changes: string[];
}

export function WhatChanged({ entry }: { entry: ChangeEntry | null }) {
  return (
    <section className="panel">
      <h2 className="panel__title">What changed</h2>
      {entry ? (
        <>
          <p className="change-label">{entry.label}</p>
          {entry.changes.length === 0 ? (
            <p className="muted">No layout rules changed.</p>
          ) : (
            <ul className="change-list">
              {entry.changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="muted">Change the device, pose, orientation or size to see which rules kick in.</p>
      )}
    </section>
  );
}
