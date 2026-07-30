import OpenAI from 'openai';
import { env } from '../config/env';
import { AIUnavailableError } from './ai-gateway.types';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!env.ai.openAiApiKey) {
    throw new AIUnavailableError('OPENAI_API_KEY is not configured');
  }
  if (!client) {
    client = new OpenAI({ apiKey: env.ai.openAiApiKey });
  }
  return client;
}

export const MODEL = 'gpt-4o-mini';

// Structured JSON output from a single chat completion call. Throws
// AIUnavailableError if no key is configured (never attempts the call);
// any other failure (timeout, API error) propagates as a plain Error, which
// the orchestrator treats as transient and retries.
export async function chatJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
  const openai = getClient();

  const response = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned an empty response');
  }
  return JSON.parse(content) as T;
}

// Same as chatJson, but attaches images as base64 data URIs (gpt-4o-mini is
// vision-capable). Used for Repair Validation (REP-021: AI compares Before/
// After images) - reading local-disk bytes directly rather than passing the
// relative /files/... URL, since that path isn't publicly reachable by
// OpenAI's servers.
export async function visionChatJson<T>(
  systemPrompt: string,
  textPrompt: string,
  images: { dataUri: string }[],
): Promise<T> {
  const openai = getClient();

  const response = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: textPrompt },
          ...images.map((img) => ({
            type: 'image_url' as const,
            image_url: { url: img.dataUri },
          })),
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned an empty response');
  }
  return JSON.parse(content) as T;
}
