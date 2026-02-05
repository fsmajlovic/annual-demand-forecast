/**
 * Utilities for generating stable, deterministic node IDs
 */

export function generateNodeId(
  subtype_key: string | null,
  setting_key: string | null,
  stage_key: string | null,
  line_key: string | null,
  regimen_key: string
): string {
  const parts: string[] = [];

  if (subtype_key) parts.push(sanitizeKey(subtype_key));
  if (setting_key) parts.push(sanitizeKey(setting_key));
  if (stage_key && stage_key !== setting_key) parts.push(sanitizeKey(stage_key));
  if (line_key) parts.push(sanitizeKey(line_key));
  parts.push(sanitizeKey(regimen_key));

  return parts.join('_');
}

export function sanitizeKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function generateCitationId(index: number): string {
  return `cite_${String(index).padStart(3, '0')}`;
}
