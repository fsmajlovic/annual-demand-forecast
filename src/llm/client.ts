/**
 * OpenAI client with structured outputs, tool calling, and caching
 * Production-ready implementation with proper error handling and retry logic
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { getCache } from './cache.js';
import { getSearchClient, type SearchResponse } from './search.js';
import { createLogger } from '../utils/log.js';
import { hashString } from '../utils/hash.js';

const logger = createLogger('llm-client');

export interface LLMCallOptions {
  model?: string;
  temperature?: number;
  use_tools?: boolean;
  max_tokens?: number;
  use_cache?: boolean;
  max_retries?: number;
}

export interface LLMCallResult<T> {
  data: T;
  cached: boolean;
  tool_outputs?: SearchResponse[];
  tokens_used?: number;
  prompt_hash: string;
  response_hash: string;
}

export class LLMClient {
  private client: OpenAI;
  private cache = getCache();
  private searchClient = getSearchClient();
  private default_model: string = 'gpt-4o-2024-08-06';

  constructor(api_key?: string) {
    this.client = new OpenAI({
      apiKey: api_key || process.env.OPENAI_API_KEY,
      maxRetries: 3,
      timeout: 120000, // 2 minutes
    });
  }

  /**
   * Make a structured LLM call with JSON schema validation and optional tool use
   */
  async callWithSchema<T>(
    schema_name: string,
    json_schema: Record<string, unknown>,
    zod_schema: z.ZodType<T>,
    system_prompt: string,
    user_prompt: string,
    options: LLMCallOptions = {}
  ): Promise<LLMCallResult<T>> {
    const model = options.model || this.default_model;
    const use_cache = options.use_cache !== false;
    const use_tools = options.use_tools || false;
    const max_retries = options.max_retries || 2;

    // Generate cache key
    const prompt_payload = { system_prompt, user_prompt };
    const cache_key = this.cache.generateCacheKey(model, prompt_payload, schema_name, use_tools);
    const prompt_hash = hashString(JSON.stringify(prompt_payload));

    // Check cache
    if (use_cache) {
      const cached_entry = this.cache.get(cache_key);
      if (cached_entry) {
        const cached_data = JSON.parse(cached_entry.response_json);
        const validated_data = zod_schema.parse(cached_data);

        logger.info({ schema_name, cached: true }, 'Using cached LLM response');

        return {
          data: validated_data,
          cached: true,
          tool_outputs: cached_entry.tool_outputs
            ? JSON.parse(cached_entry.tool_outputs)
            : undefined,
          prompt_hash,
          response_hash: hashString(cached_entry.response_json),
        };
      }
    }

    // Make API call with retry logic
    logger.info(
      { schema_name, model, use_tools, cached: false },
      'Making new LLM API call'
    );

    let last_error: Error | null = null;
    for (let attempt = 0; attempt <= max_retries; attempt++) {
      try {
        if (attempt > 0) {
          logger.warn({ attempt, schema_name }, 'Retrying LLM call');
          await this.sleep(1000 * Math.pow(2, attempt)); // Exponential backoff
        }

        const result = use_tools
          ? await this.callWithTools(
              model,
              schema_name,
              json_schema,
              zod_schema,
              system_prompt,
              user_prompt,
              prompt_hash,
              options
            )
          : await this.callSimple(
              model,
              schema_name,
              json_schema,
              zod_schema,
              system_prompt,
              user_prompt,
              prompt_hash,
              options
            );

        // Cache the result
        if (use_cache) {
          this.cache.set(
            cache_key,
            model,
            prompt_payload,
            schema_name,
            result.data,
            result.tool_outputs
          );
        }

        return {
          ...result,
          prompt_hash,
        };
      } catch (error) {
        last_error = error as Error;
        logger.error({ error, attempt, schema_name }, 'LLM call failed');

        // Don't retry on certain errors
        if (
          error instanceof Error &&
          (error.message.includes('invalid_request') ||
            error.message.includes('authentication'))
        ) {
          throw error;
        }
      }
    }

    throw last_error || new Error('LLM call failed after retries');
  }

  /**
   * Call LLM with tool use (web search)
   */
  private async callWithTools<T>(
    model: string,
    schema_name: string,
    json_schema: Record<string, unknown>,
    zod_schema: z.ZodType<T>,
    system_prompt: string,
    user_prompt: string,
    prompt_hash: string,
    options: LLMCallOptions
  ): Promise<LLMCallResult<T>> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: system_prompt },
      { role: 'user', content: user_prompt },
    ];

    const tools: OpenAI.Chat.ChatCompletionTool[] = [
      {
        type: 'function',
        function: {
          name: 'web_search',
          description:
            'Search the web for current medical information, clinical guidelines, dosing protocols, FDA approvals, and epidemiological data. Use this to ground your responses with real evidence and citations.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description:
                  'The search query. Be specific and include key medical terms (drug names, conditions, guidelines, etc.)',
              },
            },
            required: ['query'],
            additionalProperties: false,
          },
        },
      },
    ];

    // Step 1: Initial call with tools available
    let completion = await this.client.chat.completions.create({
      model,
      messages,
      temperature: options.temperature || 0.1,
      max_tokens: options.max_tokens || 4000,
      tools,
      tool_choice: 'auto',
    });

    let message = completion.choices[0].message;
    const search_results: SearchResponse[] = [];

    // Step 2: Execute tool calls if requested
    if (message.tool_calls && message.tool_calls.length > 0) {
      logger.info({ tool_count: message.tool_calls.length }, 'Processing tool calls');

      messages.push(message);

      for (const tool_call of message.tool_calls) {
        if (tool_call.function.name === 'web_search') {
          const args = JSON.parse(tool_call.function.arguments);
          logger.info({ query: args.query }, 'Executing web search');

          const search_response = await this.searchClient.search(args.query, 5);
          search_results.push(search_response);

          // Format search results for the model
          const formatted_results = search_response.results
            .map(
              (r, idx) =>
                `[${idx + 1}] ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}\n`
            )
            .join('\n');

          messages.push({
            role: 'tool',
            tool_call_id: tool_call.id,
            content: `Search results for "${args.query}":\n\n${formatted_results}`,
          });
        }
      }

      // Step 3: Get structured response after tool use
      completion = await this.client.chat.completions.create({
        model,
        messages,
        temperature: options.temperature || 0.1,
        max_tokens: options.max_tokens || 4000,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: schema_name,
            strict: true,
            schema: json_schema,
          },
        },
      });

      message = completion.choices[0].message;
    } else {
      // No tools called, make structured call directly
      completion = await this.client.chat.completions.create({
        model,
        messages,
        temperature: options.temperature || 0.1,
        max_tokens: options.max_tokens || 4000,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: schema_name,
            strict: true,
            schema: json_schema,
          },
        },
      });

      message = completion.choices[0].message;
    }

    // Parse and validate response
    if (!message.content) {
      throw new Error('No content in LLM response');
    }

    const response_data = JSON.parse(message.content);
    const response_hash = hashString(message.content);
    const validated_data = zod_schema.parse(response_data);

    logger.info({ schema_name, tokens: completion.usage?.total_tokens }, 'LLM call completed');

    return {
      data: validated_data,
      cached: false,
      tool_outputs: search_results.length > 0 ? search_results : undefined,
      tokens_used: completion.usage?.total_tokens,
      prompt_hash,
      response_hash,
    };
  }

  /**
   * Call LLM without tools (direct structured output)
   */
  private async callSimple<T>(
    model: string,
    schema_name: string,
    json_schema: Record<string, unknown>,
    zod_schema: z.ZodType<T>,
    system_prompt: string,
    user_prompt: string,
    prompt_hash: string,
    options: LLMCallOptions
  ): Promise<LLMCallResult<T>> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: system_prompt },
      { role: 'user', content: user_prompt },
    ];

    const completion = await this.client.chat.completions.create({
      model,
      messages,
      temperature: options.temperature || 0.1,
      max_tokens: options.max_tokens || 4000,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: schema_name,
          strict: true,
          schema: json_schema,
        },
      },
    });

    const message = completion.choices[0].message;

    if (!message.content) {
      throw new Error('No content in LLM response');
    }

    const response_data = JSON.parse(message.content);
    const response_hash = hashString(message.content);
    const validated_data = zod_schema.parse(response_data);

    logger.info({ schema_name, tokens: completion.usage?.total_tokens }, 'LLM call completed');

    return {
      data: validated_data,
      cached: false,
      tool_outputs: undefined,
      tokens_used: completion.usage?.total_tokens,
      prompt_hash,
      response_hash,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Global client instance
let globalClient: LLMClient | null = null;

export function getClient(): LLMClient {
  if (!globalClient) {
    globalClient = new LLMClient();
  }
  return globalClient;
}
