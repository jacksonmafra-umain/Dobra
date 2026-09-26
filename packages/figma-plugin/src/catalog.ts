// The bundled device catalog, validated once per plugin run.
import { loadCatalog } from '@hinge/core/catalog/load';
import { envConfigOf } from '@hinge/core/targets';

export const catalog = loadCatalog();
export const config = envConfigOf(catalog);
