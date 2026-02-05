/**
 * Validation helpers for shares, rates, and population bounds
 */

import { createLogger } from '../utils/log.js';

const logger = createLogger('validation');

export interface ValidationConfig {
  /** If true, renormalize shares that don't sum to 1.0 instead of throwing */
  allow_share_renormalization: boolean;
  /** If true, allow equal split across regimens when no regimen_shares provided */
  allow_equal_regimen_split: boolean;
  /** Tolerance for share sum validation (default 0.01 = 1%) */
  share_sum_tolerance: number;
  /** Maximum deviation from 1.0 before renormalization is skipped (default 0.1 = 10%) */
  max_renormalization_deviation: number;
  /** Maximum allowed population (sanity check) */
  max_population?: number;
  /** Geography for population bounds lookup */
  geography?: string;
}

export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  allow_share_renormalization: true,
  allow_equal_regimen_split: true, // Set to false for strict mode
  share_sum_tolerance: 0.05, // 5% tolerance
  max_renormalization_deviation: 0.15, // Only renormalize if within 15% of 1.0
  max_population: 350_000_000, // US population as default cap
};

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  normalized_value?: number | Record<string, number>;
}

export interface ShareValidationTrace {
  original_shares: Record<string, number>;
  original_sum: number;
  normalized_shares: Record<string, number>;
  normalized: boolean;
  warning?: string;
}

/**
 * Validate that a rate is between 0 and 1
 */
export function validateRate(
  rate: number,
  name: string
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  if (typeof rate !== 'number' || isNaN(rate)) {
    result.valid = false;
    result.errors.push(`${name} must be a valid number, got: ${rate}`);
    return result;
  }

  if (rate < 0) {
    result.valid = false;
    result.errors.push(`${name} cannot be negative: ${rate}`);
  } else if (rate > 1) {
    result.valid = false;
    result.errors.push(`${name} cannot exceed 1.0: ${rate}`);
  }

  return result;
}

/**
 * Validate and optionally normalize shares to sum to 1.0
 */
export function validateShares(
  shares: Record<string, number>,
  dimension_name: string,
  config: ValidationConfig
): { result: ValidationResult; trace: ShareValidationTrace } {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  const trace: ShareValidationTrace = {
    original_shares: { ...shares },
    original_sum: 0,
    normalized_shares: {},
    normalized: false,
  };

  // Check for empty shares
  if (!shares || Object.keys(shares).length === 0) {
    result.valid = false;
    result.errors.push(`${dimension_name} shares cannot be empty`);
    return { result, trace };
  }

  // Validate each share is in [0, 1]
  for (const [key, value] of Object.entries(shares)) {
    if (typeof value !== 'number' || isNaN(value)) {
      result.valid = false;
      result.errors.push(`${dimension_name}[${key}] must be a valid number, got: ${value}`);
      continue;
    }
    if (value < 0) {
      result.valid = false;
      result.errors.push(`${dimension_name}[${key}] cannot be negative: ${value}`);
    }
    if (value > 1) {
      result.valid = false;
      result.errors.push(`${dimension_name}[${key}] cannot exceed 1.0: ${value}`);
    }
  }

  if (!result.valid) {
    return { result, trace };
  }

  // Calculate sum
  const sum = Object.values(shares).reduce((a, b) => a + b, 0);
  trace.original_sum = sum;

  // Check if sum is approximately 1.0
  const deviation = Math.abs(sum - 1.0);

  if (deviation > config.share_sum_tolerance) {
    // Sum is not close to 1.0
    if (sum > 1.0) {
      // Shares exceed 100% - this is an error (can't have > 100% of patients)
      if (config.allow_share_renormalization && deviation <= config.max_renormalization_deviation) {
        // Small overage - renormalize with warning
        const normalized: Record<string, number> = {};
        for (const [key, value] of Object.entries(shares)) {
          normalized[key] = value / sum;
        }
        trace.normalized_shares = normalized;
        trace.normalized = true;
        trace.warning = `${dimension_name} shares summed to ${sum.toFixed(4)}, renormalized to 1.0`;
        result.warnings.push(trace.warning);
        result.normalized_value = normalized;
        logger.warn({ dimension_name, original_sum: sum }, trace.warning);
      } else {
        result.valid = false;
        result.errors.push(
          `${dimension_name} shares must sum to ~1.0 (tolerance: ${config.share_sum_tolerance}). ` +
          `Got: ${sum.toFixed(4)}. Shares cannot exceed 1.0.`
        );
      }
    } else {
      // Shares are < 1.0 - this is intentional patient loss (some patients not covered)
      // Apply shares as-is without renormalization
      trace.normalized_shares = { ...shares };
      result.normalized_value = shares;

      if (deviation > config.max_renormalization_deviation) {
        // Large deviation - warn about significant patient loss
        const loss_pct = ((1 - sum) * 100).toFixed(1);
        result.warnings.push(
          `${dimension_name} shares sum to ${sum.toFixed(4)} (${loss_pct}% patient loss). ` +
          `This may be intentional if not all dimension values are covered.`
        );
      } else if (config.allow_share_renormalization) {
        // Small deviation - renormalize with warning
        const normalized: Record<string, number> = {};
        for (const [key, value] of Object.entries(shares)) {
          normalized[key] = value / sum;
        }
        trace.normalized_shares = normalized;
        trace.normalized = true;
        trace.warning = `${dimension_name} shares summed to ${sum.toFixed(4)}, renormalized to 1.0`;
        result.warnings.push(trace.warning);
        result.normalized_value = normalized;
        logger.warn({ dimension_name, original_sum: sum }, trace.warning);
      }
    }
  } else {
    trace.normalized_shares = { ...shares };
    result.normalized_value = shares;
  }

  return { result, trace };
}

/**
 * Validate population bounds
 */
export function validatePopulation(
  population: number,
  name: string,
  config: ValidationConfig
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  if (typeof population !== 'number' || isNaN(population)) {
    result.valid = false;
    result.errors.push(`${name} must be a valid number, got: ${population}`);
    return result;
  }

  if (population < 0) {
    result.valid = false;
    result.errors.push(`${name} cannot be negative: ${population}`);
  }

  if (config.max_population && population > config.max_population) {
    result.valid = false;
    result.errors.push(
      `${name} (${population.toLocaleString()}) exceeds maximum allowed population ` +
      `(${config.max_population.toLocaleString()}). This may indicate incorrect epidemiology data.`
    );
  }

  // Sanity warning for very large numbers
  if (population > 100_000_000) {
    result.warnings.push(
      `${name} is very large (${population.toLocaleString()}). ` +
      `Please verify this is correct for the target geography.`
    );
  }

  return result;
}

/**
 * Aggregate validation results
 */
export function aggregateValidationResults(
  results: ValidationResult[]
): ValidationResult {
  return {
    valid: results.every((r) => r.valid),
    errors: results.flatMap((r) => r.errors),
    warnings: results.flatMap((r) => r.warnings),
  };
}

/**
 * Throw if validation failed
 */
export function throwIfInvalid(result: ValidationResult, context: string): void {
  if (!result.valid) {
    const errorMessage = `Validation failed for ${context}:\n` +
      result.errors.map((e) => `  - ${e}`).join('\n');
    throw new Error(errorMessage);
  }

  // Log warnings even if valid
  for (const warning of result.warnings) {
    logger.warn({ context }, warning);
  }
}
