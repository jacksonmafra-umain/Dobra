import type { ConfigError } from '@hinge/core/config/schema';

/** Shown instead of the simulator when the catalog or app profile does not validate. */
export function ConfigErrorPage({ error }: { error: ConfigError }) {
  return (
    <div className="app config-error">
      <h1>The config is invalid</h1>
      <p className="muted">Fix these values and reload. Each line starts with the path of the offending value.</p>
      <ul>
        {error.issues.map((issue) => (
          <li key={issue}>
            <code>{issue}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
