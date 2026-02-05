/**
 * Hashing utilities for cache keys and run IDs
 */

import { createHash } from 'crypto';

export function hashObject(obj: unknown): string {
  // Sort keys for deterministic hashing
  const str = JSON.stringify(obj, (_key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value)
        .sort()
        .reduce((sorted: Record<string, unknown>, k) => {
          sorted[k] = value[k];
          return sorted;
        }, {});
    }
    return value;
  });
  return createHash('sha256').update(str).digest('hex');
}

export function hashString(str: string): string {
  return createHash('sha256').update(str).digest('hex');
}

export function shortHash(str: string, length: number = 8): string {
  return hashString(str).substring(0, length);
}

export function generateRunId(inputs: unknown, assumptionsHash: string, mapHash: string): string {
  const combined = JSON.stringify({ inputs, assumptionsHash, mapHash });
  return shortHash(combined, 12);
}
