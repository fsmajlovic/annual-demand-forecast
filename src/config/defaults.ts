/**
 * Default configuration values
 */

export const DEFAULT_MODEL = 'gpt-4o-2024-08-06';
export const DEFAULT_TEMPERATURE = 0.1;
export const DEFAULT_MAX_TOKENS = 4000;

export const PIPELINE_DEFAULTS = {
  MAX_LANDSCAPE_ITERATIONS: 3,
  COMPLETENESS_THRESHOLD: 0.85,
  BASE_YEAR: 2024,
  HORIZON_YEARS: 10,
};

export const CACHE_CONFIG = {
  DB_PATH: 'llm_cache.db',
  ENABLE_CACHE: true,
};
