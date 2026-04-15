import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';

let client: Anthropic | null = null;

export function getClaudeClient(): Anthropic {
  if (!client) {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Missing ANTHROPIC_API_KEY environment variable');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}
