/**
 * SQLite-based caching layer for LLM calls
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { hashObject } from '../utils/hash.js';
import { createLogger } from '../utils/log.js';

const logger = createLogger('cache');

export interface CacheEntry {
  cache_key: string;
  model_name: string;
  prompt_payload: string;
  schema_name: string;
  response_json: string;
  tool_outputs: string | null;
  created_at: string;
}

export class LLMCache {
  private db: Database.Database;

  constructor(db_path: string = join(process.cwd(), 'llm_cache.db')) {
    this.db = new Database(db_path);
    this.initializeTables();
  }

  private initializeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS llm_cache (
        cache_key TEXT PRIMARY KEY,
        model_name TEXT NOT NULL,
        prompt_payload TEXT NOT NULL,
        schema_name TEXT NOT NULL,
        response_json TEXT NOT NULL,
        tool_outputs TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_model_schema ON llm_cache(model_name, schema_name);
      CREATE INDEX IF NOT EXISTS idx_created_at ON llm_cache(created_at);
    `);
    logger.info('LLM cache tables initialized');
  }

  public generateCacheKey(
    model_name: string,
    prompt_payload: unknown,
    schema_name: string,
    use_tools: boolean
  ): string {
    const key_data = {
      model_name,
      prompt_payload,
      schema_name,
      use_tools,
    };
    return hashObject(key_data);
  }

  public get(cache_key: string): CacheEntry | null {
    const stmt = this.db.prepare(
      'SELECT * FROM llm_cache WHERE cache_key = ?'
    );
    const row = stmt.get(cache_key) as CacheEntry | undefined;

    if (row) {
      logger.debug({ cache_key }, 'Cache hit');
      return row;
    }

    logger.debug({ cache_key }, 'Cache miss');
    return null;
  }

  public set(
    cache_key: string,
    model_name: string,
    prompt_payload: unknown,
    schema_name: string,
    response_json: unknown,
    tool_outputs?: unknown
  ): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO llm_cache
      (cache_key, model_name, prompt_payload, schema_name, response_json, tool_outputs, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      cache_key,
      model_name,
      JSON.stringify(prompt_payload),
      schema_name,
      JSON.stringify(response_json),
      tool_outputs ? JSON.stringify(tool_outputs) : null,
      new Date().toISOString()
    );

    logger.debug({ cache_key, schema_name }, 'Cache entry saved');
  }

  public clear(): void {
    this.db.exec('DELETE FROM llm_cache');
    logger.info('Cache cleared');
  }

  public close(): void {
    this.db.close();
  }

  public stats(): { total_entries: number; by_schema: Record<string, number> } {
    const total_stmt = this.db.prepare('SELECT COUNT(*) as count FROM llm_cache');
    const total_result = total_stmt.get() as { count: number };

    const schema_stmt = this.db.prepare(
      'SELECT schema_name, COUNT(*) as count FROM llm_cache GROUP BY schema_name'
    );
    const schema_results = schema_stmt.all() as Array<{ schema_name: string; count: number }>;

    const by_schema: Record<string, number> = {};
    for (const row of schema_results) {
      by_schema[row.schema_name] = row.count;
    }

    return {
      total_entries: total_result.count,
      by_schema,
    };
  }
}

// Global cache instance
let globalCache: LLMCache | null = null;

export function getCache(): LLMCache {
  if (!globalCache) {
    globalCache = new LLMCache();
  }
  return globalCache;
}

export function closeCache(): void {
  if (globalCache) {
    globalCache.close();
    globalCache = null;
  }
}
