import catalogJson from './catalog.json';
import { parseCatalog, type Catalog } from '../config/schema';

/** The validated device catalog. Pass other catalog JSON to validate it instead of the bundled one. */
export function loadCatalog(json: unknown = catalogJson): Catalog {
  return parseCatalog(json);
}
