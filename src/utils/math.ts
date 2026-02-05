/**
 * Mathematical utility functions
 */

export function calculateBSA(weight_kg: number, height_cm: number = 170): number {
  // Mosteller formula: BSA (m²) = sqrt(height_cm × weight_kg / 3600)
  return Math.sqrt((height_cm * weight_kg) / 3600);
}

export function calculateCAGR(
  start_value: number,
  end_value: number,
  years: number
): number {
  return Math.pow(end_value / start_value, 1 / years) - 1;
}

export function projectWithCAGR(
  base_value: number,
  cagr: number,
  years: number
): number {
  return base_value * Math.pow(1 + cagr, years);
}

export function normalizeShares(
  shares: Record<string, number>,
  tolerance: number = 0.01
): Record<string, number> {
  const total = Object.values(shares).reduce((sum, val) => sum + val, 0);

  if (Math.abs(total - 1.0) <= tolerance) {
    return shares;
  }

  const normalized: Record<string, number> = {};
  for (const [key, value] of Object.entries(shares)) {
    normalized[key] = value / total;
  }

  return normalized;
}

export function sum(values: number[]): number {
  return values.reduce((acc, val) => acc + val, 0);
}

export function mean(values: number[]): number {
  return sum(values) / values.length;
}

export function weightedAverage(
  values: number[],
  weights: number[]
): number {
  if (values.length !== weights.length) {
    throw new Error('Values and weights must have same length');
  }

  const weighted_sum = values.reduce(
    (acc, val, idx) => acc + val * weights[idx],
    0
  );
  const weight_sum = sum(weights);

  return weighted_sum / weight_sum;
}
