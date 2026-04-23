/** Unified AI client interface so each pass can be assigned any provider.
 *  All clients use structured outputs — valid JSON is guaranteed, no parsing
 *  tricks needed. */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';

export interface CompletionOptions {
  system?: string;
  maxTokens?: number;
  /** JSON Schema for structured output. Required — all passes must use it. */
  schema: Record<string, unknown>;
}

export interface AIClient {
  complete(prompt: string, opts: CompletionOptions): Promise<string>;
  readonly model: string;
}

export function clientFor(model: string): AIClient {
  if (model.startsWith('claude-')) return new AnthropicClient(model);
  if (model.startsWith('gpt-')) return new OpenAIClient(model);
  if (model.startsWith('gemini-')) return new GeminiClient(model);
  throw new TypeError(`Unrecognized model provider for "${model}"`);
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} environment variable`);
  return value;
}


class AnthropicClient implements AIClient {
  private readonly client: Anthropic;
  constructor(public readonly model: string) {
    this.client = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
  }

  async complete(prompt: string, opts: CompletionOptions): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: opts.maxTokens ?? 4000,
      system: opts.system,
      messages: [{ role: 'user', content: prompt }],
      output_config: {
        format: { type: 'json_schema', schema: opts.schema },
      },
    });
    const block = response.content[0];
    return block?.type === 'text' ? block.text : '';
  }
}

class OpenAIClient implements AIClient {
  private readonly client: OpenAI;
  constructor(public readonly model: string) {
    this.client = new OpenAI({ apiKey: requireEnv('OPENAI_API_KEY') });
  }

  async complete(prompt: string, opts: CompletionOptions): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_completion_tokens: opts.maxTokens ?? 4000,
      messages: [
        ...(opts.system ? [{ role: 'system' as const, content: opts.system }] : []),
        { role: 'user' as const, content: prompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'response', strict: true, schema: opts.schema },
      },
    });
    const choice = response.choices[0];
    if (choice?.finish_reason === 'length') {
      throw new Error(
        `OpenAI response truncated (hit max_completion_tokens=${opts.maxTokens ?? 4000}). Increase maxTokens.`,
      );
    }
    return choice?.message?.content ?? '';
  }
}

class GeminiClient implements AIClient {
  private readonly client: GoogleGenAI;
  constructor(public readonly model: string) {
    this.client = new GoogleGenAI({ apiKey: requireEnv('GEMINI_API_KEY') });
  }

  async complete(prompt: string, opts: CompletionOptions): Promise<string> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        systemInstruction: opts.system,
        maxOutputTokens: opts.maxTokens ?? 4000,
        responseMimeType: 'application/json',
        responseJsonSchema: opts.schema,
      },
    });
    return response.text ?? '';
  }
}
