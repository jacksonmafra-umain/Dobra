import raw from './simulator.config.json';
import { parseConfig } from './schema';

/** The validated config. Throws a ConfigError (with paths) when simulator.config.json is invalid. */
export const loadConfig = () => parseConfig(raw);
