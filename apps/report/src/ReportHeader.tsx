import logoDark from '@dobra/brand/logo.svg';
import logoLight from '@dobra/brand/logo-light.svg';

/** The page header: the logo for the system theme, the heading, and the catalog the checks use. */
export function ReportHeader({ catalogVersion }: { catalogVersion: string }) {
  return (
    <header className="page-header">
      <div className="page-header__brand">
        <picture>
          <source srcSet={logoLight} media="(prefers-color-scheme: light)" />
          <img className="page-header__logo" src={logoDark} alt="Dobra" />
        </picture>
        <span className="badge badge--mono">catalog {catalogVersion}</span>
      </div>
      <h1>Foldable Check</h1>
      <p className="muted">Coverage and foldable rule findings for a Figma file, or for a report made by the command-line checker.</p>
    </header>
  );
}
