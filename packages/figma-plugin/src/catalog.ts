// The bundled device catalog, validated once per plugin run.
import { loadCatalog } from '@dobra/core/catalog/load';
import { envConfigOf } from '@dobra/core/targets';

export const catalog = loadCatalog();
export const config = envConfigOf(catalog);
