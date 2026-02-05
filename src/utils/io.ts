/**
 * File I/O utilities
 */

import { mkdir, writeFile, readFile, access } from 'fs/promises';
import { join, dirname } from 'path';
import { constants } from 'fs';

export async function ensureDir(dir_path: string): Promise<void> {
  await mkdir(dir_path, { recursive: true });
}

export async function writeJson(file_path: string, data: unknown): Promise<void> {
  await ensureDir(dirname(file_path));
  await writeFile(file_path, JSON.stringify(data, null, 2), 'utf-8');
}

export async function readJson<T>(file_path: string): Promise<T> {
  const content = await readFile(file_path, 'utf-8');
  return JSON.parse(content) as T;
}

export async function fileExists(file_path: string): Promise<boolean> {
  try {
    await access(file_path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function writeCsv(file_path: string, rows: unknown[]): Promise<void> {
  if (rows.length === 0) {
    await writeFile(file_path, '', 'utf-8');
    return;
  }

  const headers = Object.keys(rows[0] as Record<string, unknown>);
  const csv_lines = [
    headers.join(','),
    ...rows.map((row) => {
      const rowObj = row as Record<string, unknown>;
      return headers
        .map((h) => {
          const val = rowObj[h];
          if (val === null || val === undefined) return '';
          if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return String(val);
        })
        .join(',');
    }),
  ];

  await ensureDir(dirname(file_path));
  await writeFile(file_path, csv_lines.join('\n'), 'utf-8');
}

export function getRunDir(run_id: string): string {
  return join(process.cwd(), 'runs', run_id);
}

export function getOutputDir(): string {
  return join(process.cwd(), 'out');
}
