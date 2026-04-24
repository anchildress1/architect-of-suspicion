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
  /** Anthropic: adaptive thinking + effort level (default 'high').
   *  OpenAI: reasoning_effort ('none'|'minimal'|'low'|'medium'|'high'|'xhigh').
   *    GPT-5+ added 'minimal' for tasks that need slight deliberation without
   *    the full thinking cost of 'low'.
   *  Gemini: thinkingConfig.thinkingLevel ('minimal'|'low'|'medium'|'high'). */
  reasoning?: string;
  /** OpenAI-only: `verbosity` param (GPT-5+). Controls output length/depth
   *  independent of correctness. 'low' = terse structured, 'medium' = default,
   *  'high' = verbose. Silently ignored by Anthropic and Gemini clients. */
  verbosity?: 'low' | 'medium' | 'high';
  /** Per-call request timeout (ms). Overrides the client-construction default
   *  of 120_000. Anthropic + OpenAI only — Gemini's SDK takes its timeout at
   *  construction, so use a larger constructor timeout if Gemini needs more. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

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
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${name} environment variable. Set it in .env (or your shell) before running the seed pipeline.`,
    );
  }
  return value;
}

class AnthropicClient implements AIClient {
  private readonly client: Anthropic;
  constructor(public readonly model: string) {
    // The constructor timeout is a fallback — each `complete()` call can
    // override it per-pass via `opts.timeoutMs` (see CompletionOptions).
    this.client = new Anthropic({
      apiKey: requireEnv('ANTHROPIC_API_KEY'),
      timeout: DEFAULT_TIMEOUT_MS,
    });
  }

  async complete(prompt: string, opts: CompletionOptions): Promise<string> {
    const effort = (opts.reasoning as 'low' | 'medium' | 'high' | 'max') ?? 'high';
    const response = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: opts.maxTokens ?? 4000,
        system: opts.system,
        thinking: { type: 'adaptive' },
        messages: [{ role: 'user', content: prompt }],
        output_config: {
          effort,
          format: { type: 'json_schema', schema: opts.schema },
        },
      },
      opts.timeoutMs ? { timeout: opts.timeoutMs } : undefined,
    );
    if (response.stop_reason === 'max_tokens') {
      throw new Error(
        `Anthropic response truncated (stop_reason=max_tokens, model=${this.model}). Increase maxTokens (current: ${opts.maxTokens ?? 4000}).`,
      );
    }
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error(
        `Anthropic returned no text content block (stop_reason=${response.stop_reason}, model=${this.model}).`,
      );
    }
    return textBlock.text;
  }
}

class OpenAIClient implements AIClient {
  private readonly client: OpenAI;
  constructor(public readonly model: string) {
    this.client = new OpenAI({
      apiKey: requireEnv('OPENAI_API_KEY'),
      timeout: DEFAULT_TIMEOUT_MS,
    });
  }

  async complete(prompt: string, opts: CompletionOptions): Promise<string> {
    const reasoning =
      (opts.reasoning as 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh') ?? 'none';
    const response = await this.client.chat.completions.create(
      {
        model: this.model,
        max_completion_tokens: opts.maxTokens ?? 4000,
        reasoning_effort: reasoning,
        // GPT-5+ verbosity knob — orthogonal to reasoning_effort. 'low' is
        // the right pick for structured-only outputs (no narrative padding).
        ...(opts.verbosity ? { verbosity: opts.verbosity } : {}),
        messages: [
          ...(opts.system ? [{ role: 'system' as const, content: opts.system }] : []),
          { role: 'user' as const, content: prompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'response', strict: true, schema: opts.schema },
        },
      },
      opts.timeoutMs ? { timeout: opts.timeoutMs } : undefined,
    );
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
    // @google/genai runs getApiKeyFromEnv() unconditionally in its constructor
    // and emits "Both GOOGLE_API_KEY and GEMINI_API_KEY are set. Using
    // GOOGLE_API_KEY." whenever both are present. That conflates a globally-
    // exported GOOGLE_API_KEY (for other tools) with this project's
    // GEMINI_API_KEY, and with `tsx --env-file=.env` the shell's global leaks
    // through the child process. Scrub both vars from process.env before
    // constructing the client so the SDK has no env signal to pick up —
    // only the explicit apiKey we pass reaches the wire.
    const apiKey = requireEnv('GEMINI_API_KEY');
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;
    this.client = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: DEFAULT_TIMEOUT_MS },
    });
  }

  async complete(prompt: string, opts: CompletionOptions): Promise<string> {
    const thinkingLevel = (opts.reasoning as 'minimal' | 'low' | 'medium' | 'high') ?? 'low';
    if (opts.timeoutMs && opts.timeoutMs !== DEFAULT_TIMEOUT_MS) {
      console.warn(
        `[gemini] per-call timeoutMs=${opts.timeoutMs} ignored — Gemini SDK only honors the constructor-time timeout (${DEFAULT_TIMEOUT_MS}ms).`,
      );
    }
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        systemInstruction: opts.system,
        maxOutputTokens: opts.maxTokens ?? 4000,
        responseMimeType: 'application/json',
        responseJsonSchema: opts.schema,
        thinkingConfig: { thinkingLevel },
      },
    });
    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
      throw new Error(
        `Gemini response did not complete normally (finishReason=${finishReason}, model=${this.model}). This may indicate a safety filter block, truncation, or recitation filter.`,
      );
    }
    const text = response.text;
    if (text === undefined || text === null) {
      throw new Error(
        `Gemini returned no text content (model=${this.model}, finishReason=${finishReason ?? 'unknown'}).`,
      );
    }
    return text;
  }
}
