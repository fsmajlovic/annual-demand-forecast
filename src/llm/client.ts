/**
 * OpenAI client with structured outputs, tool calling, and caching
 * Production-ready implementation with proper error handling and retry logic
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { getCache } from './cache.js';
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
  tool_outputs?: unknown[];
  tokens_used?: number;
  prompt_hash: string;
  response_hash: string;
}

export class LLMClient {
  private client: OpenAI;
  private cache = getCache();
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
    // gpt-4o-search-preview has native web search - don't pass tools parameter
    const is_search_model = model.includes('search-preview');
    const use_tools = is_search_model ? false : (options.use_tools || false);
    const max_retries = options.max_retries || 2;

    if (is_search_model && options.use_tools) {
      logger.info({ model }, 'Using model with native web search - custom tools disabled');
    }

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
   * Call LLM with native web search using Responses API
   * Single call: web search + strict JSON schema output
   */
  private async callWithTools<T>(
    model: string,
    schema_name: string,
    json_schema: Record<string, unknown>,
    zod_schema: z.ZodType<T>,
    system_prompt: string,
    user_prompt: string,
    prompt_hash: string,
    _options: LLMCallOptions
  ): Promise<LLMCallResult<T>> {
    // Combine system and user prompts for the Responses API input
    const input = `${system_prompt}\n\n---\n\n${user_prompt}`;

    logger.info({ schema_name, model }, 'Using Responses API with native web search');

    // Use Responses API with native web_search tool
    // This is a single call that handles search + structured output
    const response = await (this.client as any).responses.create({
      model,
      tools: [{ type: 'web_search' }],
      input,
      text: {
        format: {
          type: 'json_schema',
          name: schema_name,
          strict: true,
          schema: json_schema,
        },
      },
    });

    // Extract the output text from the response
    let output_text: string | undefined;

    // Handle different response structures
    if (response.output_text) {
      output_text = response.output_text;
    } else if (response.output) {
      // Try to find text content in output array
      for (const item of response.output) {
        if (item.type === 'message' && item.content) {
          for (const content of item.content) {
            if (content.type === 'output_text' || content.type === 'text') {
              output_text = content.text;
              break;
            }
          }
        }
        if (output_text) break;
      }
    }

    if (!output_text) {
      logger.error({ response: JSON.stringify(response).substring(0, 500) }, 'Unexpected response structure');
      throw new Error('No output text in Responses API response');
    }

    const response_data = JSON.parse(output_text);
    const response_hash = hashString(output_text);
    const validated_data = zod_schema.parse(response_data);

    logger.info({ schema_name, tokens: response.usage?.total_tokens }, 'LLM call completed via Responses API');

    return {
      data: validated_data,
      cached: false,
      tool_outputs: undefined, // Native web search doesn't expose individual search results
      tokens_used: response.usage?.total_tokens,
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

    // gpt-4o-search-preview doesn't support temperature or response_format
    const is_search_model = model.includes('search-preview');

    const completion = await this.client.chat.completions.create({
      model,
      messages,
      ...(is_search_model ? {} : { temperature: options.temperature || 0.1 }),
      max_tokens: options.max_tokens || 4000,
      ...(is_search_model ? {} : {
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: schema_name,
            strict: true,
            schema: json_schema,
          },
        },
      }),
    });

    const message = completion.choices[0].message;

    if (!message.content) {
      throw new Error('No content in LLM response');
    }

    // For search models, we need to extract JSON from the response
    let response_data;
    if (is_search_model) {
      // Try to extract JSON from the response
      const json_match = message.content.match(/```json\n?([\s\S]*?)\n?```/) ||
                         message.content.match(/\{[\s\S]*\}/);
      if (json_match) {
        const json_str = json_match[1] || json_match[0];
        response_data = JSON.parse(json_str);
      } else {
        throw new Error('Could not extract JSON from search model response');
      }
    } else {
      response_data = JSON.parse(message.content);
    }

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
